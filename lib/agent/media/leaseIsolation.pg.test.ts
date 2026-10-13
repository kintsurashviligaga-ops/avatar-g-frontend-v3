/** @jest-environment node */
/**
 * Crash recovery (E), retry exhaustion (F) and the refund (G) of Agent G's lease queue, against a REAL database:
 * a throwaway local Postgres with the Production shape of generation_jobs, credit_ledger, profiles and the
 * deduct_credits / refund_credits functions (scripts/lease-isolation/schema.sql), served by a real PostgREST.
 *
 * Everything the workers write goes through the live code: supabaseLeaseStore (the compare-and-set is a filtered PATCH
 * on params->_exec->>v), the ledger (lib/orchestrator/ledger: deduct_credits, refund_credits, netDebitedForRef) and
 * the live montage / audio billing. Only the render, the probe, the clock and the heartbeat timer are the test's.
 * Agent G's edit too: its stored request read back from the real JSONB column (DEFECT_REGISTER_FINAL row 39).
 *
 * Opt-in: runs only when LEASE_PG_REST_URL and LEASE_PG_JWT_SECRET are set (scripts/lease-isolation/run.sh sets
 * them up). It never points at Production: the run script refuses any URL that is not on this machine.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';

const REST = process.env.LEASE_PG_REST_URL ?? '';
const SECRET = process.env.LEASE_PG_JWT_SECRET ?? '';
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(REST);
const suite = REST && SECRET && local ? describe : describe.skip;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function serviceJwt(): string {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ role: 'service_role', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
const jwt = REST && SECRET ? serviceJwt() : '';
const db = new PostgrestClient(REST || 'http://127.0.0.1:1', { headers: { apikey: jwt, Authorization: `Bearer ${jwt}` } });

jest.mock('server-only', () => ({}));
const storeErrors: unknown[] = [];
jest.mock('../../observability/report-error', () => ({ reportError: (e: unknown) => { storeErrors.push(e); } }));
// The live code's service-role client is this local PostgREST, nothing else.
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => db, createSupabaseServerClient: () => db }));

import { LEASE_MS, HOLD_MS, claim, enqueue } from '@/lib/orchestrator/jobLease';
import { bodyFingerprint, produceRef } from '@/lib/orchestrator/idemRef';
import { liveMontageDeps } from './montageLive';
import { liveAudioDeps } from './audioLive';
import { cancelMontageJob, enqueueMontageJob, quoteMontage, MONTAGE_KIND, type MontageExecDeps } from './montageExec';
import { GAVE_UP, HOLD_ABANDONED, sweepMontageJobs, workMontageJob } from './montageWorker';
import { enqueueAudioJob, quoteAudioExtract } from './audioExtract';
import { AUDIO_GAVE_UP, sweepAudioJobs, workAudioJob } from './audioWorker';
import { signQuote } from './quoteToken';
import { FILES, MASTER_URL, fake, frameOf, shotSourceAt, type Fake } from './testing/fakeMontageDeps';
import { AUDIO_URL, LINK, fakeAudio, type FakeAudio } from './testing/fakeAudioDeps';
import { enqueueEditJob, quoteEdit } from './editExec';
import { workEditJob } from './editWorker';
import { SOURCE as EDIT_SOURCE, UPLOAD as EDIT_UPLOAD, fakeEdit } from './testing/fakeEditDeps';
import type { MontageOutcome } from '@/lib/services/montage/montagePipeline';

const A = '0e000000-0000-4000-8000-00000000000a';
const B = '0e000000-0000-4000-8000-00000000000b';
const START = 100;

/** The fake montage deps, with the queue and the billing swapped for the live ones on the local database. */
function liveQueue(): Fake {
  const f = fake();
  const live = liveMontageDeps();
  f.clock.now = Date.now();
  f.deps.store = live.store;
  f.deps.billing = live.billing;
  f.deps.newId = () => randomUUID();
  // Per-clip QC samples the master (5d32689). The fake reads the montage being rendered from its in-memory store, which
  // this suite replaced with the live one — so the master is sampled from the processing row in the REAL database.
  const grab = f.deps.grabFrames;
  f.deps.grabFrames = async (url, timesSec, o) => {
    if (url !== MASTER_URL) return grab(url, timesSec, o);
    const { data } = await db.from('generation_jobs').select('params').eq('status', 'processing');
    type Row = { params?: { _job?: { request?: { shots?: Array<{ url: string; source: number; startSec: number; endSec: number }> } } } };
    const shots = ((data ?? []) as Row[]).map((r) => r.params?._job?.request?.shots).find(Array.isArray) ?? [];
    return timesSec.map((t) => { const src = shotSourceAt(shots, t); return src ? frameOf(src, o.size) : null; });
  };
  return f;
}
function liveAudioQueue(): FakeAudio {
  const f = fakeAudio();
  const live = liveAudioDeps();
  f.clock.now = Date.now();
  f.deps.store = live.store;
  f.deps.newId = () => randomUUID();
  return f;
}

async function row(id: string) {
  const { data, error } = await db.from('generation_jobs').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as { status: string; error: string | null; signed_url: string | null; result: Record<string, unknown> | null; params: { _exec: Record<string, unknown> } };
}
async function balance(user: string): Promise<number> {
  const { data } = await db.from('profiles').select('credits_balance').eq('id', user).single();
  return (data as { credits_balance: number }).credits_balance;
}
async function ledger(user: string) {
  const { data } = await db.from('credit_ledger').select('delta,reason,metadata').eq('user_id', user).order('created_at');
  return ((data ?? []) as Array<{ delta: number; reason: string; metadata: { ref: string } }>).map((l) => `${l.delta} ${l.reason} ${l.metadata.ref}`);
}

/** Quote → (priced?) → queued, as user A. A priced quote is charged for real by deduct_credits. */
async function queued(f: Fake, credits = 0, user = A): Promise<string> {
  const q = await quoteMontage(f.deps, { userId: user, files: FILES });
  if (!q.ok) throw new Error(q.error);
  const token = credits > 0 ? signQuote({ u: user, j: q.quote.jobId, f: bodyFingerprint(q.request), c: credits, x: f.clock.now + 60_000 }, 'k')! : q.token;
  const r = await enqueueMontageJob(f.deps, { userId: user, request: q.request, token });
  if (!r.ok) throw new Error(`${r.error}: ${r.message}`);
  return q.quote.jobId;
}

/** A render that never returns on its own: the worker that runs it "dies" (it stops renewing its lease). */
function deadRender(f: { deps: Pick<MontageExecDeps, 'render'> }) {
  const finish: Array<(o: MontageOutcome) => void> = [];
  f.deps.render = (req, opts) => new Promise<MontageOutcome>((resolve) => {
    opts.signal.addEventListener('abort', () => resolve({ ok: false, step: 'stitch', error: 'cancelled' }));
    finish.push(resolve);
    void req;
  });
  return finish;
}
const flush = () => new Promise((r) => setTimeout(r, 50));
const OK: MontageOutcome = { ok: true, result: { videoUrl: MASTER_URL, durationSec: 30, shots: 2, aspect: '16:9', bridged: 0, hasMusic: true, stepsRun: ['resolve', 'stitch', 'music'] } };

suite('lease queue on a real Postgres + PostgREST (local, isolated)', () => {
  jest.setTimeout(30_000);

  beforeEach(async () => {
    storeErrors.length = 0;
    await db.from('generation_jobs').delete().in('user_id', [A, B]);
    await db.from('credit_ledger').delete().in('user_id', [A, B]);
    const up = await db.from('profiles').upsert([{ id: A, email: 'a@local.test', credits_balance: START }, { id: B, email: 'b@local.test', credits_balance: START }]);
    if (up.error) throw new Error(up.error.message);
  });
  afterEach(() => {
    expect(storeErrors).toEqual([]);
  });

  test('E: a worker dies mid-render; once its lease lapses the sweep takes the job over as attempt 2 and delivers it, charged once', async () => {
    const f = liveQueue();
    const id = await queued(f, 7);
    expect(await balance(A)).toBe(START - 7);

    const finishDead = deadRender(f);
    const dead = workMontageJob(f.deps, { jobId: id, worker: 'w-dies' });
    await flush();
    expect((await row(id)).params._exec).toMatchObject({ attempt: 1, owner: 'w-dies' });
    // Still leased: the sweep leaves it alone.
    const early = await sweepMontageJobs(f.deps, { worker: 'sweep-1', work: true });
    expect(early).toMatchObject({ waiting: [], gaveUp: [] });
    expect(early.worked).toBeUndefined();

    f.clock.now += LEASE_MS + 1; // no heartbeat came: the worker is gone
    f.deps.render = async () => OK;
    const swept = await sweepMontageJobs(f.deps, { worker: 'sweep-2', work: true });
    expect(swept).toMatchObject({ waiting: [id], gaveUp: [], worked: { jobId: id, result: { ran: true, outcome: 'delivered' } } });
    const done = await row(id);
    expect(done).toMatchObject({ status: 'completed', signed_url: MASTER_URL, error: null });
    expect(done.params._exec).toMatchObject({ attempt: 2, owner: null, leaseUntil: null });

    // The first worker wakes up late: its render returns, but every write it tries is fenced off.
    finishDead[0]!(OK);
    expect(await dead).toEqual({ ran: true, outcome: 'lost' });
    expect((await row(id)).params._exec).toMatchObject({ attempt: 2 });
    expect(await ledger(A)).toEqual([`-7 commit ${produceRef('agent-montage', id)}`]);
    expect(await balance(A)).toBe(START - 7);
    expect(f.audits.map((a) => `${a.phase}:${a.outcome}:${a.attempt ?? ''}`)).toEqual(expect.arrayContaining(['run:retried:2', 'run:ok:2', 'run:lost:1']));
  });

  test('F: the job dies twice; the sweep gives it up, refunds the charge once, and a second sweep pays nothing more', async () => {
    const f = liveQueue();
    const id = await queued(f, 7);
    deadRender(f);
    void workMontageJob(f.deps, { jobId: id, worker: 'w1' });
    await flush();
    f.clock.now += LEASE_MS + 1;
    deadRender(f);
    void workMontageJob(f.deps, { jobId: id, worker: 'w2' }); // attempt 2 dies too
    await flush();
    expect((await row(id)).params._exec).toMatchObject({ attempt: 2, owner: 'w2' });
    f.clock.now += LEASE_MS + 1;

    const swept = await sweepMontageJobs(f.deps, { worker: 'sweep', work: true });
    expect(swept).toMatchObject({ gaveUp: [id], paid: [id], waiting: [] });
    const gone = await row(id);
    expect(gone).toMatchObject({ status: 'failed', error: GAVE_UP, signed_url: null });
    expect(gone.params._exec).toMatchObject({ attempt: 2, lastError: 'lease expired' });
    expect(gone.params._exec.owe).toBeUndefined();
    const ref = produceRef('agent-montage', id);
    expect(await ledger(A)).toEqual([`-7 commit ${ref}`, `7 refund ${ref}:refund`]);
    expect(await balance(A)).toBe(START);

    expect(await sweepMontageJobs(f.deps, { worker: 'sweep-again', work: true })).toMatchObject({ gaveUp: [], paid: [], waiting: [] });
    expect(await claim(f.deps.store, id, 'late', f.clock.now)).toEqual({ ok: false, reason: 'final' });
    expect(await balance(A)).toBe(START);
  });

  test('a debt left on a failed row (the refund did not land) is paid by the next sweep, once', async () => {
    const f = liveQueue();
    const id = await queued(f, 5);
    const realRefund = f.deps.billing.refund;
    f.deps.billing.refund = async () => 'error';
    f.deps.render = async () => ({ ok: false, step: 'stitch', error: 'bad shot' });
    expect(await workMontageJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ outcome: 'failed' });
    expect((await row(id)).params._exec).toMatchObject({ owe: 'refund' });
    expect(await balance(A)).toBe(START - 5);

    f.deps.billing.refund = realRefund;
    expect(await sweepMontageJobs(f.deps, { worker: 'sweep', work: false })).toMatchObject({ paid: [id] });
    expect((await row(id)).params._exec.owe).toBeUndefined();
    expect(await balance(A)).toBe(START);
    expect(await sweepMontageJobs(f.deps, { worker: 'sweep', work: false })).toMatchObject({ paid: [] });
    expect(await balance(A)).toBe(START);
  });

  test('the owner stops a running job: the worker hears it on its heartbeat, delivers nothing, and the charge comes back once', async () => {
    const f = liveQueue();
    const id = await queued(f, 7);
    deadRender(f);
    const running = workMontageJob(f.deps, { jobId: id, worker: 'w1' });
    await flush();
    expect(await cancelMontageJob(f.deps, { userId: B, jobId: id })).toMatchObject({ ok: false, error: 'not_found' });
    expect(await cancelMontageJob(f.deps, { userId: A, jobId: id })).toEqual({ ok: true });
    await f.beat();
    expect(await running).toEqual({ ran: true, outcome: 'stopped' });
    expect(await row(id)).toMatchObject({ status: 'failed', signed_url: null });
    expect(await balance(A)).toBe(START);
    expect((await ledger(A)).filter((l) => l.startsWith('7 refund'))).toHaveLength(1);
  });

  test('the CI E2E recovery path on the real JSONB column: heartbeats renew, a stolen lease is heard, the sweep\'s attempt 2 keeps its lease and delivers', async () => {
    const f = liveQueue();
    const id = await queued(f);
    const finish = deadRender(f);
    const first = workMontageJob(f.deps, { jobId: id, worker: 'w1' });
    await flush();
    const v1 = (await row(id)).params._exec.v as number;
    await f.beat();
    expect((await row(id)).params._exec).toMatchObject({ owner: 'w1', attempt: 1, v: v1 + 1 });

    // tests/video-core-live/recovery.spec.ts: the whole params written back with the lease taken and lapsed.
    const before = await row(id);
    const exec = before.params._exec as { v: number };
    const stolen = await db.from('generation_jobs')
      .update({ params: { ...before.params, _exec: { ...exec, owner: 'dead', leaseUntil: f.clock.now - 1_000, v: exec.v + 1 } } })
      .eq('id', id).eq('status', 'processing').eq('params->_exec->>v', String(exec.v)).select('id');
    expect(stolen.data).toHaveLength(1);

    const swept = sweepMontageJobs(f.deps, { worker: 'sweep', work: true });
    for (let i = 0; i < 40 && (await row(id)).params._exec.attempt !== 2; i++) await flush();
    const v2 = (await row(id)).params._exec.v as number;
    expect((await row(id)).params._exec).toMatchObject({ owner: 'sweep', attempt: 2 });

    await f.beat(); // both workers beat: w1 hears it lost the lease, the sweep's renews
    expect(await first).toEqual({ ran: true, outcome: 'lost' });
    expect((await row(id)).params._exec).toMatchObject({ owner: 'sweep', attempt: 2, v: v2 + 1 });
    await f.beat();
    expect((await row(id)).params._exec).toMatchObject({ owner: 'sweep', v: v2 + 2 });

    finish[1]!(OK);
    expect(await swept).toMatchObject({ worked: { jobId: id, result: { ran: true, outcome: 'delivered' } } });
    expect(await row(id)).toMatchObject({ status: 'completed', signed_url: MASTER_URL });
  });

  test('a charge whose request died before it lifted the hold is failed after HOLD_MS and paid back', async () => {
    const f = liveQueue();
    const jobId = randomUUID();
    const ref = produceRef('agent-montage', jobId);
    const q = await quoteMontage(f.deps, { userId: A, files: FILES });
    if (!q.ok) throw new Error(q.error);
    expect(await enqueue(f.deps.store, {
      id: jobId, userId: A, serviceType: 'film', kind: MONTAGE_KIND, hold: true,
      params: { subtype: 'montage', _job: { request: q.request }, _reserve: { ref, credits: 4 } },
    })).toBe('inserted');
    expect(await f.deps.billing.reserve(A, 4, ref)).toMatchObject({ proceed: true, charged: true });
    // …and the request dies here, before release(). No worker may take a held row.
    expect(await workMontageJob(f.deps, { jobId, worker: 'w1' })).toEqual({ ran: false, reason: 'held' });
    f.clock.now = Date.now() + HOLD_MS + 1_000;
    expect(await sweepMontageJobs(f.deps, { worker: 'sweep', work: true })).toMatchObject({ gaveUp: [jobId], paid: [jobId] });
    expect(await row(jobId)).toMatchObject({ status: 'failed', error: HOLD_ABANDONED });
    expect(await balance(A)).toBe(START);
  });

  test('eight workers race for one queued job through PostgREST: exactly one gets it', async () => {
    const f = liveQueue();
    const id = await queued(f);
    const claims = await Promise.all(Array.from({ length: 8 }, (_, i) => claim(f.deps.store, id, `racer-${i}`, f.clock.now)));
    const won = claims.filter((c) => c.ok);
    expect(won).toHaveLength(1);
    expect(claims.filter((c) => !c.ok).map((c) => (c.ok ? '' : c.reason)).every((r) => r === 'raced' || r === 'leased')).toBe(true);
    expect((await row(id)).params._exec).toMatchObject({ attempt: 1, v: 1 });
  });

  test('E/F for the URL-to-Audio worker: a dead extraction is retried once and delivered; two deaths are given up', async () => {
    const f = liveAudioQueue();
    const q = await quoteAudioExtract(f.deps, { userId: A, url: LINK });
    if (!q.ok) throw new Error(q.error);
    expect(await enqueueAudioJob(f.deps, { userId: A, request: q.request, token: q.token })).toMatchObject({ ok: true });
    const id = q.quote.jobId;
    const realExtract = f.deps.extract;
    f.deps.extract = () => new Promise(() => undefined); // dies
    void workAudioJob(f.deps, { jobId: id, worker: 'w1' });
    await flush();
    f.clock.now += LEASE_MS + 1;
    f.deps.extract = realExtract;
    expect(await sweepAudioJobs(f.deps, { worker: 'sweep', work: true })).toMatchObject({ worked: { jobId: id, result: { outcome: 'delivered' } } });
    expect(await row(id)).toMatchObject({ status: 'completed', signed_url: null, result: expect.objectContaining({ audioUrl: AUDIO_URL }) });
    expect((await row(id)).params._exec).toMatchObject({ attempt: 2 });

    const q2 = await quoteAudioExtract(f.deps, { userId: A, url: `${LINK}?take=2` });
    if (!q2.ok) throw new Error(q2.error);
    await enqueueAudioJob(f.deps, { userId: A, request: q2.request, token: q2.token });
    f.deps.extract = () => new Promise(() => undefined);
    void workAudioJob(f.deps, { jobId: q2.quote.jobId, worker: 'w1' });
    await flush();
    f.clock.now += LEASE_MS + 1;
    void workAudioJob(f.deps, { jobId: q2.quote.jobId, worker: 'w2' });
    await flush();
    f.clock.now += LEASE_MS + 1;
    expect(await sweepAudioJobs(f.deps, { worker: 'sweep', work: true })).toMatchObject({ gaveUp: [q2.quote.jobId] });
    expect(await row(q2.quote.jobId)).toMatchObject({ status: 'failed', error: AUDIO_GAVE_UP });
    expect(await ledger(A)).toEqual([]); // URL-to-Audio is free: nothing charged, nothing to pay back
  });

  // DEFECT_REGISTER_FINAL row 39 (CI E2E): the worker reads the edit's request back from params, a JSONB column, which
  // returns an object's keys shorter-first. The stored-plan check compared the edits as strings in the order written,
  // so a trim (`{ op, fromSec, toSec }` → `{ op, toSec, fromSec }`), a volume, an adjust, an erase or a layer was
  // refused at the worker as `invalid_request`; 2× (`{ op, factor }`) kept its order and passed.
  test('an edit read back from the real JSONB column is the worker\'s to run: trim, volume and adjust are delivered', async () => {
    for (const edits of [[{ op: 'trim', fromSec: 1, toSec: 4 }], [{ op: 'volume', db: 3 }], [{ op: 'adjust', brightness: 25, warmth: 40 }]]) {
      const f = fakeEdit({
        render: async (_url, request) => ({
          ok: true, bytes: Buffer.alloc(2_400_000, 1), input: EDIT_SOURCE,
          output: { ...EDIT_SOURCE, durationSec: request.plan.durationSec, width: request.plan.width, height: request.plan.height },
        }),
      });
      f.clock.now = Date.now();
      f.deps.store = liveMontageDeps().store;
      f.deps.newId = () => randomUUID();
      const q = await quoteEdit(f.deps, { userId: A, file: EDIT_UPLOAD, edits });
      if (!q.ok) throw new Error(`${q.error}: ${q.message}`);
      const queuedEdit = await enqueueEditJob(f.deps, { userId: A, request: q.request, token: q.token });
      if (!queuedEdit.ok) throw new Error(`${queuedEdit.error}: ${queuedEdit.message}`);
      const stored = (await row(queuedEdit.jobId)).params as unknown as { _job: { request: { edits: Array<Record<string, unknown>> } } };
      if (edits[0]!.op === 'trim') expect(Object.keys(stored._job.request.edits[0]!)).toEqual(['op', 'toSec', 'fromSec']); // JSONB's order
      expect({ edits, out: await workEditJob(f.deps, { jobId: queuedEdit.jobId, worker: 'w-edit' }) }).toEqual({ edits, out: expect.objectContaining({ ran: true, outcome: 'delivered' }) });
      expect(await row(queuedEdit.jobId)).toMatchObject({ status: 'completed', error: null });
      expect(f.renders).toHaveLength(1);
    }
    expect(await ledger(A)).toEqual([]); // Agent G's edit is free
  });
});
