/** @jest-environment node */
// lib/orchestrator/jobLease — the queue's races, crashes and debts, against an in-memory store with the live semantics.
import {
  HEARTBEAT_MS,
  HOLD_MS,
  LEASE_MS,
  cancel,
  claim,
  complete,
  enqueue,
  execOf,
  fail,
  failPending,
  heartbeat,
  isLeaseOwned,
  reap,
  release,
  settled,
  supabaseLeaseStore,
} from './jobLease';
import { memoryLeaseStore } from './testing/memoryLeaseStore';

let t = 1_000_000;
const now = () => t;
const KIND = 'agent-montage';
const put = (store: ReturnType<typeof memoryLeaseStore>, id = 'j1', extra: Record<string, unknown> = {}) =>
  enqueue(store, { id, userId: 'u1', serviceType: 'film', kind: KIND, params: { subtype: 'montage', ...extra } });
const reapOpts = {
  owesRefund: (r: { params: Record<string, unknown> }) => Boolean(r.params._reserve),
  error: 'stopped: the render stopped and its retry ran out',
  abandonedError: 'billing_unavailable: the charge never finished',
};

beforeEach(() => { t = 1_000_000; });

describe('enqueue', () => {
  test('one row per id: the second enqueue says it exists and changes nothing', async () => {
    const s = memoryLeaseStore(now);
    expect(await put(s)).toBe('inserted');
    expect(await put(s, 'j1', { other: true })).toBe('exists');
    const row = s.rows.get('j1')!;
    expect(row).toMatchObject({ status: 'pending', stage: 'queued' });
    expect(row.exec).toEqual({ kind: KIND, v: 0, attempt: 0, maxAttempts: 2, owner: null, leaseUntil: null });
    expect(row.params.other).toBeUndefined();
  });

  test('a store that is down answers error, never throws', async () => {
    const s = memoryLeaseStore(now);
    s.down = true;
    expect(await put(s)).toBe('error');
  });
});

describe('claim: exactly one worker wins a row', () => {
  test('two workers racing for one pending row: one claims, the other is told it raced', async () => {
    const s = memoryLeaseStore(now);
    await put(s);
    const [a, b] = await Promise.all([claim(s, 'j1', 'A', now()), claim(s, 'j1', 'B', now())]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    const lost = a.ok ? b : a;
    expect(lost).toEqual({ ok: false, reason: 'raced' });
    expect(s.rows.get('j1')).toMatchObject({ status: 'processing', stage: 'starting', exec: { attempt: 1, leaseUntil: t + LEASE_MS } });
  });

  test('a held lease is not claimable; a lapsed one is, as attempt 2 (the crash retry)', async () => {
    const s = memoryLeaseStore(now);
    await put(s);
    expect((await claim(s, 'j1', 'A', now())).ok).toBe(true);
    expect(await claim(s, 'j1', 'B', now() + LEASE_MS - 1)).toEqual({ ok: false, reason: 'leased' });
    t += LEASE_MS; // A stopped renewing: its function died
    const b = await claim(s, 'j1', 'B', now());
    expect(b.ok).toBe(true);
    expect(s.rows.get('j1')).toMatchObject({ stage: 'retrying', exec: { attempt: 2, owner: 'B' } });
  });

  test('no attempts left, a final row, a missing row: nothing to claim', async () => {
    const s = memoryLeaseStore(now);
    await put(s);
    await claim(s, 'j1', 'A', now());
    t += LEASE_MS;
    await claim(s, 'j1', 'B', now());
    t += LEASE_MS;
    expect(await claim(s, 'j1', 'C', now())).toEqual({ ok: false, reason: 'exhausted' });
    await put(s, 'j2');
    await cancel(s, 'j2', 'u1', 'cancelled by the user', false);
    expect(await claim(s, 'j2', 'C', now())).toEqual({ ok: false, reason: 'final' });
    expect(await claim(s, 'nope', 'C', now())).toEqual({ ok: false, reason: 'missing' });
  });
});

describe('heartbeat, progress and the end of a run are fenced by the lease', () => {
  test('a heartbeat keeps the lease; the old worker loses everything once another claimed the row', async () => {
    const s = memoryLeaseStore(now);
    await put(s);
    await claim(s, 'j1', 'A', now());
    t += HEARTBEAT_MS;
    expect(await heartbeat(s, 'j1', 'A', now())).toBe('held');
    expect(s.rows.get('j1')!.exec!.leaseUntil).toBe(t + LEASE_MS);

    t += LEASE_MS; // A stalls past its lease; B takes over
    await claim(s, 'j1', 'B', now());
    expect(await heartbeat(s, 'j1', 'A', now())).toBe('lost');
    expect(await s.progress('j1', 'A', 'stitch', 88)).toBe(false);
    expect(await complete(s, 'j1', 'A', { signedUrl: 'https://x/a.mp4', result: {} })).toBe(false);
    expect(await fail(s, 'j1', 'A', 'render_failed: x', false)).toBe(false);
    expect(s.rows.get('j1')).toMatchObject({ status: 'processing', exec: { owner: 'B' } });

    expect(await s.progress('j1', 'B', 'stitch', 88)).toBe(true);
    expect(await complete(s, 'j1', 'B', { signedUrl: 'https://x/b.mp4', result: { videoUrl: 'https://x/b.mp4' } })).toBe(true);
    expect(s.rows.get('j1')).toMatchObject({ status: 'completed', pct: 100, signedUrl: 'https://x/b.mp4', exec: { owner: null, leaseUntil: null } });
  });

  test('a heartbeat that loses a compare-and-set to a harmless write reads again and still holds', async () => {
    const s = memoryLeaseStore(now);
    await put(s);
    await claim(s, 'j1', 'A', now());
    let once = true;
    s.beforeCas = async () => {
      if (!once) return;
      once = false;
      const row = s.rows.get('j1')!;
      row.exec = { ...row.exec!, v: row.exec!.v + 1 };
      row.params = { ...row.params, _exec: row.exec };
    };
    expect(await heartbeat(s, 'j1', 'A', now())).toBe('held');
  });

  test('a cancelled row stops its worker: heartbeat says stopped, nothing more lands', async () => {
    const s = memoryLeaseStore(now);
    await put(s);
    await claim(s, 'j1', 'A', now());
    expect(await cancel(s, 'j1', 'someone-else', 'cancelled by the user', false)).toEqual({ ok: false, reason: 'not_owner' });
    expect((await cancel(s, 'j1', 'u1', 'cancelled by the user', false)).ok).toBe(true);
    expect(await heartbeat(s, 'j1', 'A', now())).toBe('stopped');
    expect(await s.progress('j1', 'A', 'music', 96)).toBe(false);
    expect(await complete(s, 'j1', 'A', { signedUrl: 'https://x/late.mp4', result: {} })).toBe(false);
    expect(s.rows.get('j1')).toMatchObject({ status: 'failed', error: 'cancelled by the user', signedUrl: null });
    expect(await cancel(s, 'j1', 'u1', 'cancelled by the user', false)).toEqual({ ok: false, reason: 'final' });
  });

  test('cancel against a worker finishing at the same moment: exactly one of them wins', async () => {
    const s = memoryLeaseStore(now);
    await put(s);
    await claim(s, 'j1', 'A', now());
    const [c, d] = await Promise.all([
      cancel(s, 'j1', 'u1', 'cancelled by the user', false),
      complete(s, 'j1', 'A', { signedUrl: 'https://x/a.mp4', result: {} }),
    ]);
    expect(Number(c.ok) + Number(d)).toBe(1);
    const row = s.rows.get('j1')!;
    expect(row.status === 'completed' ? d : c.ok).toBe(true);
  });
});

describe('debts: the refund owed by a failed row is written with the failure and paid once', () => {
  test('a charged job that fails owes a refund until it is settled', async () => {
    const s = memoryLeaseStore(now);
    await put(s, 'j1', { _reserve: { ref: 'agent-montage:j1', credits: 10 } });
    await claim(s, 'j1', 'A', now());
    expect(await fail(s, 'j1', 'A', 'render_failed: stitch', true)).toBe(true);
    expect(s.rows.get('j1')!.exec!.owe).toBe('refund');
    expect((await s.listOwed(KIND, 10)).map((r) => r.id)).toEqual(['j1']);
    expect(await settled(s, 'j1')).toBe(true);
    expect(s.rows.get('j1')!.exec!.owe).toBeUndefined();
    expect(await s.listOwed(KIND, 10)).toEqual([]);
    expect(await settled(s, 'j1')).toBe(false);
  });

  test('the sweep fails a row whose last attempt died, owing a refund only when it was charged', async () => {
    const s = memoryLeaseStore(now);
    await put(s, 'paid', { _reserve: { ref: 'agent-montage:paid', credits: 10 } });
    await put(s, 'free');
    await put(s, 'waiting');
    for (const id of ['paid', 'free']) {
      await claim(s, id, 'A', now());
    }
    t += LEASE_MS;
    for (const id of ['paid', 'free']) await claim(s, id, 'B', now()); // the retry…
    t += LEASE_MS; // …dies too
    const r = await reap(s, KIND, now(), reapOpts);
    expect(r.exhausted.map((x) => x.id).sort()).toEqual(['free', 'paid']);
    expect(r.runnable).toEqual(['waiting']);
    expect(s.rows.get('paid')).toMatchObject({ status: 'failed', error: reapOpts.error, exec: { owe: 'refund', owner: null } });
    expect(s.rows.get('free')!.exec!.owe).toBeUndefined();
  });

  test('the sweep leaves a held lease alone and offers a lapsed one with attempts left', async () => {
    const s = memoryLeaseStore(now);
    await put(s, 'held');
    await put(s, 'lapsed');
    await claim(s, 'held', 'A', now() + LEASE_MS);
    await claim(s, 'lapsed', 'A', now());
    t += LEASE_MS;
    const r = await reap(s, KIND, now(), reapOpts);
    expect(r).toEqual({ runnable: ['lapsed'], exhausted: [] });
  });
});

describe('billing hold: no worker takes a job before it is paid for', () => {
  const held = (s: ReturnType<typeof memoryLeaseStore>, id = 'h1') =>
    enqueue(s, { id, userId: 'u1', serviceType: 'film', kind: KIND, params: { _reserve: { ref: `agent-montage:${id}`, credits: 10 } }, hold: true });

  test('a held row cannot be claimed; released, it can', async () => {
    const s = memoryLeaseStore(now);
    await held(s);
    expect(await claim(s, 'h1', 'A', now())).toEqual({ ok: false, reason: 'held' });
    expect((await reap(s, KIND, now(), reapOpts)).runnable).toEqual([]);
    expect(await release(s, 'h1')).toBe(true);
    expect((await claim(s, 'h1', 'A', now())).ok).toBe(true);
    expect(await release(s, 'h1')).toBe(false);
  });

  test('a refused charge fails the still-pending row; it never fails a row a worker holds', async () => {
    const s = memoryLeaseStore(now);
    await held(s);
    expect(await failPending(s, 'h1', 'insufficient_credits')).toBe(true);
    expect(s.rows.get('h1')).toMatchObject({ status: 'failed', error: 'insufficient_credits' });
    await put(s, 'r1');
    await claim(s, 'r1', 'A', now());
    expect(await failPending(s, 'r1', 'insufficient_credits')).toBe(false);
  });

  test('a hold whose request died is failed by the sweep, owing what may have been charged', async () => {
    const s = memoryLeaseStore(now);
    await held(s);
    t += HOLD_MS - 1;
    expect((await reap(s, KIND, now(), reapOpts)).exhausted).toEqual([]);
    t += 1;
    const r = await reap(s, KIND, now(), reapOpts);
    expect(r.exhausted.map((x) => x.id)).toEqual(['h1']);
    expect(s.rows.get('h1')).toMatchObject({ status: 'failed', error: reapOpts.abandonedError, exec: { owe: 'refund' } });
    expect(s.rows.get('h1')!.exec!.hold).toBeUndefined();
  });
});

describe('helpers', () => {
  test('execOf reads only a well-formed _exec; isLeaseOwned tells other reapers to keep off', () => {
    expect(execOf(null)).toBeNull();
    expect(execOf({ _exec: { kind: 'x' } })).toBeNull();
    expect(execOf({ _exec: { kind: 'x', v: 1, attempt: 0, maxAttempts: 2, owner: 'A', leaseUntil: 5, owe: 'refund' } }))
      .toEqual({ kind: 'x', v: 1, attempt: 0, maxAttempts: 2, owner: 'A', leaseUntil: 5, owe: 'refund' });
    expect(isLeaseOwned({ params: { _reserve: {} } })).toBe(false);
    expect(isLeaseOwned({ params: { _exec: { kind: 'x', v: 0, attempt: 0, maxAttempts: 2 } } })).toBe(true);
  });
});

describe('supabaseLeaseStore: one filtered statement per compare-and-set', () => {
  function fakeClient(answer: { data?: unknown; error?: { message: string; code?: string } | null }) {
    const calls: Array<[string, ...unknown[]]> = [];
    const builder: Record<string, unknown> = {};
    for (const m of ['update', 'insert', 'select', 'eq', 'in', 'order', 'limit']) {
      builder[m] = (...a: unknown[]) => { calls.push([m, ...a]); return m === 'insert' ? Promise.resolve({ error: answer.error ?? null }) : builder; };
    }
    builder.then = (res: (v: unknown) => void) => res({ data: answer.data ?? null, error: answer.error ?? null });
    builder.maybeSingle = () => Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null });
    return { client: { from: () => builder }, calls };
  }
  const report = jest.fn();

  test('cas filters on the id, the version and the allowed statuses, and reports whether a row moved', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'j1' }] });
    const store = supabaseLeaseStore(() => client, report);
    expect(await store.cas('j1', { v: 3, from: ['processing'] }, { status: 'completed', stage: 'completed', pct: 100, params: { _exec: {} } })).toBe(true);
    expect(calls).toEqual([
      ['update', { params: { _exec: {} }, status: 'completed', current_stage: 'completed', pct: 100 }],
      ['eq', 'id', 'j1'],
      ['eq', 'params->_exec->>v', '3'],
      ['in', 'status', ['processing']],
      ['select', 'id'],
    ]);
    const none = fakeClient({ data: [] });
    expect(await supabaseLeaseStore(() => none.client, report).cas('j1', { v: 3, from: ['processing'] }, { params: {} })).toBe(false);
  });

  test('progress lands only on a processing row under that owner', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'j1' }] });
    expect(await supabaseLeaseStore(() => client, report).progress('j1', 'A', 'stitch', 88.4)).toBe(true);
    expect(calls).toEqual([
      ['update', { current_stage: 'stitch', pct: 88 }],
      ['eq', 'id', 'j1'],
      ['eq', 'status', 'processing'],
      ['eq', 'params->_exec->>owner', 'A'],
      ['select', 'id'],
    ]);
  });

  test('a duplicate id is "exists"; another insert error is "error"; no client is "error"', async () => {
    const dup = fakeClient({ error: { message: 'duplicate key', code: '23505' } });
    expect(await supabaseLeaseStore(() => dup.client, report).insert({ id: 'j1', userId: 'u', serviceType: 'film', params: {} })).toBe('exists');
    const bad = fakeClient({ error: { message: 'boom', code: '42P01' } });
    expect(await supabaseLeaseStore(() => bad.client, report).insert({ id: 'j1', userId: 'u', serviceType: 'film', params: {} })).toBe('error');
    expect(await supabaseLeaseStore(() => { throw new Error('no env'); }, report).insert({ id: 'j1', userId: 'u', serviceType: 'film', params: {} })).toBe('error');
  });

  test('a read maps the row and its _exec', async () => {
    const { client } = fakeClient({ data: { id: 'j1', user_id: 'u1', status: 'processing', current_stage: 'stitch', pct: 88, params: { _exec: { kind: KIND, v: 2, attempt: 1, maxAttempts: 2, owner: 'A', leaseUntil: 9 } }, created_at: '2026-10-09T12:00:00.000Z', error: null, result: null, signed_url: null } });
    const row = await supabaseLeaseStore(() => client, report).read('j1');
    expect(row).toMatchObject({ id: 'j1', userId: 'u1', status: 'processing', stage: 'stitch', pct: 88, exec: { owner: 'A', v: 2 }, createdAt: Date.parse('2026-10-09T12:00:00.000Z') });
  });
});
