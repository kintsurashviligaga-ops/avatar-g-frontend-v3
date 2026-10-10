/** @jest-environment node */
/**
 * The delivery outbox (./outbox.ts) over an in-memory store with the live compare-and-set semantics, every outlet
 * mocked. Pins: who is told and in what words, the person's places, once per outlet (a race, a crash mid-send, a second
 * sweep), bounded retries with backoff, final refusals, the give-up deadline, the old path's dedupe, and that the job's
 * own row never changes but for its `_tell` record.
 */
import type { ChannelResult, NotifyEvent } from './types';
import { DEFAULT_PREFS, normalizePrefs, type NotifyPrefs } from './preferences';
import {
  BACKOFF_MS, CLAIM_MS, FRESH_MS, GIVE_UP_MS, MAX_TRIES, deliver, noticeOf, outletsFor, sweepDeliveries, tellOf,
  type OutboxDeps, type OutboxRow, type Outlet, type TellState,
} from './outbox';
import { memoryOutboxStore, type MemoryOutboxStore } from './testing/memoryOutboxStore';

const USER = '00000000-0000-4000-8000-0000000000aa';
const T0 = Date.parse('2026-10-10T12:00:00Z');

interface World {
  deps: OutboxDeps;
  store: MemoryOutboxStore;
  clock: { now: number };
  sent: Array<{ outlet: Outlet; ev: NotifyEvent }>;
  answers: Partial<Record<Outlet, ChannelResult[]>>;
  prefs: NotifyPrefs;
  told: Set<string>;
}

function world(opts: { outlets?: Outlet[]; prefs?: unknown } = {}): World {
  const clock = { now: T0 };
  const store = memoryOutboxStore(() => clock.now);
  const sent: World['sent'] = [];
  const answers: World['answers'] = {};
  const told = new Set<string>();
  let id = 0;
  const w: World = {
    store, clock, sent, answers, told,
    prefs: normalizePrefs(opts.prefs ?? DEFAULT_PREFS),
    deps: undefined as unknown as OutboxDeps,
  };
  const sender = (outlet: Outlet) => async (ev: NotifyEvent): Promise<ChannelResult> => {
    sent.push({ outlet, ev });
    return answers[outlet]?.shift() ?? { sent: true };
  };
  w.deps = {
    store,
    prefs: async () => w.prefs,
    send: Object.fromEntries((opts.outlets ?? ['bell', 'push', 'whatsapp']).map((o) => [o, sender(o)])),
    firstNotice: async (_u, jobId) => { if (told.has(jobId)) return false; told.add(jobId); return true; },
    now: () => clock.now,
    newId: () => `d${(id += 1)}`,
  };
  return w;
}

function row(over: Partial<OutboxRow> & { params?: Record<string, unknown> } = {}): OutboxRow {
  return {
    id: 'job-1', userId: USER, status: 'completed', serviceType: 'film', error: null, updatedAt: T0,
    params: { _exec: { kind: 'agent-montage', v: 4, attempt: 1, maxAttempts: 2, owner: null, leaseUntil: null } },
    ...over,
  };
}

const runRow = (status: string, rowStatus = status === 'failed' || status === 'cancelled' ? 'failed' : 'completed'): OutboxRow =>
  row({
    id: 'run-1', status: rowStatus,
    params: { _exec: { kind: 'agent-run', v: 9, attempt: 0, maxAttempts: 2, owner: null, leaseUntil: null }, _run: { v: 1, status } },
  });

const put = (w: World, r: OutboxRow) => { w.store.rows.set(r.id, JSON.parse(JSON.stringify(r)) as OutboxRow); };
const tellAt = (w: World, id = 'job-1'): TellState => tellOf(w.store.rows.get(id)!.params)!;
const outlets = (w: World) => w.sent.map((s) => s.outlet);

describe('noticeOf: who is told, in what words', () => {
  it('a finished queued montage: ready, in Georgian, to the Library', () => {
    expect(noticeOf(row())).toEqual({
      event: 'task_completed',
      ev: { userId: USER, kind: 'film', event: 'task_completed', title: '🎬 თქვენი ვიდეო მზადაა!', body: 'ის თქვენს ბიბლიოთეკაშია.', url: '/ka/library', locale: 'ka' },
    });
  });

  it('a run: finished, partly finished, failed; a stop the person asked for is not news', () => {
    expect(noticeOf(runRow('completed'))!.ev.title).toBe('✅ Agent G-მ დავალება შეასრულა');
    const partial = noticeOf(runRow('partially_completed'))!;
    expect(partial.event).toBe('task_completed');
    expect(partial.ev.title).toBe('✅ Agent G-მ დავალების ნაწილი შეასრულა');
    const failed = noticeOf(runRow('failed'))!;
    expect(failed.event).toBe('needs_attention');
    expect(failed.ev.url).toBe('/ka');
    expect(noticeOf(runRow('cancelled'))).toBeNull();
  });

  it('a failed charged render needs attention, without promising a refund', () => {
    const n = noticeOf(row({ status: 'failed', serviceType: 'music', params: { _reserve: { ref: 'r1', credits: 5 } } }))!;
    expect(n.event).toBe('needs_attention');
    expect(n.ev.title).toBe('⚠️ თქვენი აუდიო ვერ შეიქმნა');
    expect(JSON.stringify(n.ev)).not.toMatch(/refund|დაბრუნ/i);
  });

  it('English and Russian when the job says so', () => {
    expect(noticeOf(row({ params: { _settle: {}, locale: 'en' } }))!.ev).toMatchObject({ title: '🎬 Your video is ready!', url: '/en/library', locale: 'en' });
    expect(noticeOf(row({ serviceType: 'image', params: { _settle: {}, lang: 'ru' } }))!.ev.title).toBe('🖼 Ваше изображение готово!');
  });

  it('tells nothing for: a live row, a run step, a row a browser could have written, a stop, a refused charge', () => {
    expect(noticeOf(row({ status: 'processing' }))).toBeNull();
    expect(noticeOf(row({ params: { _exec: { kind: 'agent-montage', v: 1, attempt: 1, maxAttempts: 2 }, _parent: 'run-1' } }))).toBeNull();
    expect(noticeOf(row({ params: { prompt: 'x', source: 'smart-assistant' } }))).toBeNull();
    expect(noticeOf(row({ status: 'failed', params: { _exec: { kind: 'agent-edit', v: 3, attempt: 1, maxAttempts: 2, lastError: 'cancelled' } } }))).toBeNull();
    expect(noticeOf(row({ status: 'failed', params: { _exec: { kind: 'agent-edit', v: 1, attempt: 0, maxAttempts: 2, lastError: 'insufficient credits' } } }))).toBeNull();
  });

  it('an abandoned billing hold is news: the request that knew about it died', () => {
    expect(noticeOf(row({ status: 'failed', params: { _exec: { kind: 'agent-edit', v: 1, attempt: 0, maxAttempts: 2, lastError: 'billing hold abandoned' } } }))!.event).toBe('needs_attention');
  });
});

describe('outletsFor: the person’s places', () => {
  it('defaults: a finished task on the bell, push and WhatsApp; a failure on the bell and push only', () => {
    const p = normalizePrefs(DEFAULT_PREFS);
    expect(outletsFor(p, 'task_completed')).toEqual(['bell', 'push', 'whatsapp']);
    expect(outletsFor(p, 'needs_attention')).toEqual(['bell', 'push']);
  });

  it('a call is wished only for a finished task, never for a failure (preferences.ts)', () => {
    const p = normalizePrefs({ events: { task_completed: ['site', 'call', 'sms'], needs_attention: ['site', 'call', 'telegram'] } });
    expect(outletsFor(p, 'task_completed')).toEqual(['bell', 'push', 'sms', 'call']);
    expect(outletsFor(p, 'needs_attention')).toEqual(['bell', 'push', 'telegram']);
  });
});

describe('deliver', () => {
  it('a finished job reaches the bell, push and WhatsApp once; the job row is otherwise untouched', async () => {
    const w = world();
    const before = row();
    put(w, before);
    expect((await deliver(w.deps, 'job-1')).outcome).toBe('delivered');
    expect(outlets(w)).toEqual(['bell', 'push', 'whatsapp']);
    expect(w.sent[0]!.ev.title).toBe('🎬 თქვენი ვიდეო მზადაა!');
    const t = tellAt(w);
    expect(t.done).toBe(true);
    expect(Object.values(t.out).map((m) => m!.s)).toEqual(['sent', 'sent', 'sent']);
    const after = w.store.rows.get('job-1')!;
    expect(after.status).toBe('completed');
    const { _tell, _exec, ...rest } = after.params;
    const { _exec: execBefore, ...restBefore } = before.params;
    expect(rest).toEqual(restBefore);
    // The lease version moved with every write of ours, so a stale lease write cannot undo the record.
    expect((_exec as { v: number }).v).toBeGreaterThan((execBefore as { v: number }).v);
    expect(_tell).toBeDefined();

    // Again, and from the sweep: nothing more is sent.
    expect((await deliver(w.deps, 'job-1')).outcome).toBe('done');
    expect((await sweepDeliveries(w.deps)).seen).toBe(0);
    expect(w.sent).toHaveLength(3);
  });

  it('a failure goes to the bell and push only (the default), never WhatsApp', async () => {
    const w = world();
    put(w, row({ status: 'failed', params: { _reserve: { ref: 'r', credits: 3 } } }));
    await deliver(w.deps, 'job-1');
    expect(outlets(w)).toEqual(['bell', 'push']);
  });

  it('two deliverers at once: each outlet is sent exactly once', async () => {
    const w = world();
    put(w, row());
    const r = await Promise.all([deliver(w.deps, 'job-1'), deliver(w.deps, 'job-1'), sweepDeliveries(w.deps)]);
    expect(outlets(w).sort()).toEqual(['bell', 'push', 'whatsapp']);
    expect(r[0].outcome === 'delivered' || r[1].outcome === 'delivered' || r[2].outcomes.delivered === 1).toBe(true);
    expect(tellAt(w).done).toBe(true);
  });

  it('a passing failure is tried again after its backoff, at most MAX_TRIES in all, then given up', async () => {
    const w = world();
    w.answers.whatsapp = [{ sent: false, reason: 'failed' }, { sent: false, reason: 'rate_limited' }, { sent: false, reason: 'failed' }];
    put(w, row());
    await deliver(w.deps, 'job-1');
    expect(tellAt(w).out.whatsapp).toMatchObject({ s: 'retry', n: 1, r: 'failed' });
    expect(tellAt(w).done).toBeUndefined();

    w.clock.now += BACKOFF_MS[0] - 1;
    expect((await deliver(w.deps, 'job-1')).outcome).toBe('waiting');
    expect(outlets(w)).toEqual(['bell', 'push', 'whatsapp']);

    w.clock.now += 1;
    expect((await sweepDeliveries(w.deps)).outcomes).toEqual({ delivered: 1 });
    expect(tellAt(w).out.whatsapp).toMatchObject({ s: 'retry', n: 2, r: 'rate_limited' });

    w.clock.now += BACKOFF_MS[1];
    await deliver(w.deps, 'job-1');
    expect(tellAt(w).out.whatsapp).toMatchObject({ s: 'gave_up', n: MAX_TRIES });
    expect(tellAt(w).done).toBe(true);
    // The bell and push were sent once; WhatsApp three times; never again.
    expect(outlets(w)).toEqual(['bell', 'push', 'whatsapp', 'whatsapp', 'whatsapp']);
    w.clock.now += GIVE_UP_MS;
    await sweepDeliveries(w.deps);
    expect(w.sent).toHaveLength(5);
  });

  it('a refusal that waiting will not change is final at once: not linked, opted out, the window closed', async () => {
    for (const reason of ['not_linked', 'opted_out', 'window_closed', 'not_configured'] as const) {
      const w = world();
      w.answers.whatsapp = [{ sent: false, reason }];
      put(w, row());
      await deliver(w.deps, 'job-1');
      expect(tellAt(w).out.whatsapp).toEqual({ s: 'skipped', n: 1, at: T0, r: reason });
      expect(tellAt(w).done).toBe(true);
    }
  });

  it('a sender that throws is a passing failure, and never reaches the job', async () => {
    const w = world();
    w.deps.send.push = async () => { throw new Error('boom'); };
    put(w, row());
    expect((await deliver(w.deps, 'job-1')).outcome).toBe('delivered');
    expect(tellAt(w).out.push).toMatchObject({ s: 'retry', n: 1, r: 'failed' });
    expect(w.store.rows.get('job-1')!.status).toBe('completed');
  });

  it('a deliverer that died mid-send: its outlets close as unknown and are NOT sent again', async () => {
    const w = world();
    const crashed: TellState = {
      v: 1, event: 'task_completed', at: T0, owner: 'tell-dead', until: T0 + CLAIM_MS,
      out: { bell: { s: 'sent', n: 1, at: T0 }, push: { s: 'sending', n: 1, at: T0 }, whatsapp: { s: 'sending', n: 1, at: T0 } },
    };
    put(w, row({ params: { ...row().params, _tell: crashed } }));
    // Its claim still holds: nobody else sends.
    expect((await deliver(w.deps, 'job-1')).outcome).toBe('busy');
    w.clock.now += CLAIM_MS;
    expect((await sweepDeliveries(w.deps)).outcomes).toEqual({ done: 1 });
    expect(w.sent).toEqual([]);
    const t = tellAt(w);
    expect(t.out.push).toMatchObject({ s: 'unknown', r: 'unknown' });
    expect(t.out.whatsapp).toMatchObject({ s: 'unknown', r: 'unknown' });
    expect(t.done).toBe(true);
  });

  it('a row that ended before the outbox saw it is not told (no write either)', async () => {
    const w = world();
    put(w, row({ updatedAt: T0 - FRESH_MS - 1 }));
    expect((await deliver(w.deps, 'job-1')).outcome).toBe('stale');
    expect(w.store.writes).toBe(0);
    expect(w.sent).toEqual([]);
  });

  it('the old one-shot path already told this job: closed as already_told, nothing sent', async () => {
    const w = world();
    w.told.add('job-1');
    put(w, row());
    expect((await deliver(w.deps, 'job-1')).outcome).toBe('already_told');
    expect(w.sent).toEqual([]);
    expect(tellAt(w)).toMatchObject({ done: true, note: 'already_told' });
  });

  it('an outlet the deployment lacks is recorded as not configured, never pretended', async () => {
    const w = world({ prefs: { events: { task_completed: ['site', 'telegram', 'sms', 'call'] } } });
    put(w, row());
    await deliver(w.deps, 'job-1');
    expect(outlets(w)).toEqual(['bell', 'push']);
    const t = tellAt(w);
    for (const o of ['telegram', 'sms', 'call'] as const) expect(t.out[o]).toMatchObject({ s: 'skipped', r: 'not_configured', n: 0 });
    expect(t.done).toBe(true);
  });

  it('the person turns WhatsApp off while its retry waits: it is not tried again', async () => {
    const w = world();
    w.answers.whatsapp = [{ sent: false, reason: 'failed' }];
    put(w, row());
    await deliver(w.deps, 'job-1');
    w.prefs = normalizePrefs({ events: { task_completed: ['site'] } });
    w.clock.now += BACKOFF_MS[0];
    await deliver(w.deps, 'job-1');
    expect(tellAt(w).out.whatsapp).toMatchObject({ s: 'skipped', r: 'opted_out' });
    expect(tellAt(w).done).toBe(true);
    expect(outlets(w)).toEqual(['bell', 'push', 'whatsapp']);
  });

  it('still open GIVE_UP_MS after it was taken: closed as expired', async () => {
    const w = world();
    w.answers.whatsapp = [{ sent: false, reason: 'failed' }];
    put(w, row());
    await deliver(w.deps, 'job-1');
    w.clock.now += GIVE_UP_MS + 1;
    expect((await deliver(w.deps, 'job-1')).outcome).toBe('expired');
    expect(tellAt(w)).toMatchObject({ done: true, note: 'expired' });
    expect(tellAt(w).out.whatsapp).toMatchObject({ s: 'gave_up' });
    expect(outlets(w)).toEqual(['bell', 'push', 'whatsapp']);
  });

  it('a lease write that lands between our read and our write makes ours read again, and nothing is lost', async () => {
    const w = world();
    put(w, row({ params: { ...row().params, _exec: { kind: 'agent-montage', v: 4, attempt: 1, maxAttempts: 2, owe: 'refund' } } }));
    let once = true;
    w.store.beforeCas = (id) => {
      if (!once) return;
      once = false;
      // The sweep clears the paid refund (jobLease.settled): _exec.v moves.
      const r = w.store.rows.get(id)!;
      const exec = { ...(r.params._exec as Record<string, unknown>), v: 5 };
      delete exec.owe;
      r.params = { ...r.params, _exec: exec };
    };
    expect((await deliver(w.deps, 'job-1')).outcome).toBe('delivered');
    const p = w.store.rows.get('job-1')!.params;
    expect((p._exec as Record<string, unknown>).owe).toBeUndefined();
    expect(tellOf(p)!.done).toBe(true);
    expect(w.sent).toHaveLength(3);
  });

  it('not eligible, missing: nothing written, nothing sent', async () => {
    const w = world();
    put(w, row({ params: { source: 'smart-assistant' } }));
    expect((await deliver(w.deps, 'job-1')).outcome).toBe('not_eligible');
    expect((await deliver(w.deps, 'nope')).outcome).toBe('missing');
    expect(w.store.writes).toBe(0);
  });
});

describe('sweepDeliveries', () => {
  it('tells every fresh eligible row once and reports what it did', async () => {
    const w = world();
    put(w, row({ id: 'a' }));
    put(w, runRow('completed'));
    put(w, row({ id: 'step', params: { _exec: { kind: 'agent-montage', v: 1, attempt: 1, maxAttempts: 2 }, _parent: 'run-1' } }));
    put(w, row({ id: 'browser', params: { prompt: 'x' } }));
    put(w, row({ id: 'old', updatedAt: T0 - FRESH_MS - 1 }));
    const r = await sweepDeliveries(w.deps);
    expect(r.outcomes).toEqual({ delivered: 2, not_eligible: 1 });
    expect(new Set(w.sent.map((s) => s.ev.title))).toEqual(new Set(['🎬 თქვენი ვიდეო მზადაა!', '✅ Agent G-მ დავალება შეასრულა']));
    expect(w.sent).toHaveLength(6);
    expect((await sweepDeliveries(w.deps)).outcomes).toEqual({ not_eligible: 1 });
  });
});
