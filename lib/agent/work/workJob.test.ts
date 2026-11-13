/** @jest-environment node */
/**
 * A work-mode step as a lease job (Phase 3.5c, prepared, not wired): queued once per quote, run once by the worker that
 * claims it, stopped by the owner through the heartbeat, a tool failure final at once, a stalled worker writes nothing.
 */
import { memoryLeaseStore } from '../../orchestrator/testing/memoryLeaseStore';
import { WORK_KIND, cancelWorkJob, enqueueWorkJob, workViewOf, workWorkJob, type WorkJobDeps, type WorkRunOutcome } from './workJob';

const USER = 'user-a';
const REQ = { steps: [{ op: 'open', url: 'https://example.com' }], workspaceId: 'ws_abc123' };

function world(run: (signal: AbortSignal) => Promise<WorkRunOutcome>) {
  const clock = { now: 1_000_000 };
  const store = memoryLeaseStore(() => clock.now);
  const beats: Array<() => Promise<void>> = [];
  const audits: Array<{ outcome: string; detail?: string }> = [];
  const calls: unknown[] = [];
  const deps: WorkJobDeps = {
    store, now: () => clock.now,
    async run(tool, input, signal) { calls.push({ tool, ...input }); return run(signal); },
    every(_ms, fn) { beats.push(fn); return () => { beats.splice(beats.indexOf(fn), 1); }; },
    async audit(ev) { audits.push(ev); },
  };
  return { deps, store, clock, beats, audits, calls };
}

const queue = (w: ReturnType<typeof world>, jobId = 'job-1') =>
  enqueueWorkJob(w.deps, { jobId, userId: USER, tool: 'browser', request: REQ, token: 'tok-1', parent: 'run-1' });

test('enqueue is once per quote; the worker runs it with the signed request and delivers workspace paths', async () => {
  const w = world(async () => ({ ok: true, outputs: ['browser/job1/steps.json', 'browser/job1/1.png'], summary: { hosts: ['example.com'] } }));
  const inserted: string[] = [];
  const insert = w.store.insert.bind(w.store);
  w.store.insert = async (r) => { inserted.push(r.serviceType); return insert(r); };
  expect(await queue(w)).toEqual({ ok: true });
  expect(await queue(w)).toEqual({ ok: true });
  expect(w.store.rows.size).toBe(1);
  const row = w.store.rows.get('job-1')!;
  expect(row.exec?.kind).toBe(WORK_KIND);
  expect(inserted).toEqual(['document', 'document']); // the kind production already accepts (migration 20261031a)
  expect(workViewOf(row)).toEqual({ status: 'queued', stage: 'queued', pct: 0 });

  const r = await workWorkJob(w.deps, { jobId: 'job-1', worker: 'w1' });
  expect(r).toEqual({ ran: true, outcome: 'delivered', outputs: ['browser/job1/steps.json', 'browser/job1/1.png'] });
  expect(w.calls).toEqual([{ tool: 'browser', userId: USER, request: REQ, token: 'tok-1' }]);
  expect(workViewOf(w.store.rows.get('job-1')!)).toEqual({ status: 'completed', tool: 'browser', outputs: ['browser/job1/steps.json', 'browser/job1/1.png'] });
  expect(w.store.rows.get('job-1')!.signedUrl).toBeNull(); // never a Library item by itself
  expect(w.beats).toHaveLength(0); // the heartbeat stopped
  expect(await workWorkJob(w.deps, { jobId: 'job-1', worker: 'w2' })).toMatchObject({ ran: false });
  expect(w.calls).toHaveLength(1);
});

test('a refused enqueue (bad tool, no token, store down) queues nothing', async () => {
  const w = world(async () => ({ ok: true, outputs: [] }));
  expect(await enqueueWorkJob(w.deps, { jobId: 'j', userId: USER, tool: 'shell' as never, request: REQ, token: 't', parent: 'r' })).toEqual({ ok: false, error: 'bad_input' });
  expect(await enqueueWorkJob(w.deps, { jobId: 'j', userId: USER, tool: 'code', request: REQ, token: '', parent: 'r' })).toEqual({ ok: false, error: 'bad_input' });
  w.store.down = true;
  expect(await queue(w)).toEqual({ ok: false, error: 'store_unavailable' });
  expect(w.store.rows.size).toBe(0);
});

test('a failure the tool reports is final at once, with its code', async () => {
  const w = world(async () => ({ ok: false, error: 'quote_used', message: 'This plan already ran.' }));
  await queue(w);
  expect(await workWorkJob(w.deps, { jobId: 'job-1', worker: 'w1' })).toEqual({ ran: true, outcome: 'failed', error: 'quote_used: This plan already ran.' });
  expect(workViewOf(w.store.rows.get('job-1')!)).toEqual({ status: 'failed', error: 'quote_used: This plan already ran.' });
});

test('a tool that throws is a failure, never an unhandled error', async () => {
  const w = world(async () => { throw new Error('sandbox exploded'); });
  await queue(w);
  expect(await workWorkJob(w.deps, { jobId: 'job-1', worker: 'w1' })).toEqual({ ran: true, outcome: 'failed', error: 'run_failed: sandbox exploded' });
});

test('the owner stops it mid-run: the heartbeat aborts the tool and nothing is delivered', async () => {
  let release: () => void = () => {};
  let aborted = false;
  const w = world((signal) => new Promise((resolve) => {
    signal.addEventListener('abort', () => { aborted = true; resolve({ ok: false, error: 'aborted' }); });
    release = () => resolve({ ok: true, outputs: ['code/x/out.txt'] });
  }));
  await queue(w);
  const running = workWorkJob(w.deps, { jobId: 'job-1', worker: 'w1' });
  await new Promise((r) => setImmediate(r));
  expect(workViewOf(w.store.rows.get('job-1')!)).toMatchObject({ status: 'running' });
  expect(await cancelWorkJob(w.deps, { userId: 'someone-else', jobId: 'job-1' })).toBe('not_found');
  expect(await cancelWorkJob(w.deps, { userId: USER, jobId: 'job-1' })).toBe('ok');
  w.clock.now += 15_000;
  await w.beats[0]!();
  expect(aborted).toBe(true);
  release();
  expect(await running).toEqual({ ran: true, outcome: 'stopped' });
  expect(workViewOf(w.store.rows.get('job-1')!)).toEqual({ status: 'cancelled' });
  expect(w.audits.map((a) => a.outcome)).toContain('cancelled');
  expect(await cancelWorkJob(w.deps, { userId: USER, jobId: 'job-1' })).toBe('not_running');
});

test('a worker that stalled past its lease writes nothing; the retry is a new attempt of the same quote', async () => {
  const pending: Array<() => void> = [];
  const w = world(() => new Promise((resolve) => { pending.push(() => resolve({ ok: true, outputs: ['code/x/out.txt'] })); }));
  await queue(w);
  const stalled = workWorkJob(w.deps, { jobId: 'job-1', worker: 'w1' });
  await new Promise((r) => setImmediate(r));
  w.clock.now += 200_000; // lease lapsed, no heartbeat ran
  const second = workWorkJob(w.deps, { jobId: 'job-1', worker: 'w2' });
  await new Promise((r) => setImmediate(r));
  pending.forEach((f) => f());
  expect(await stalled).toEqual({ ran: true, outcome: 'lost' });
  expect(await second).toMatchObject({ ran: true, outcome: 'delivered' });
  expect(w.calls).toHaveLength(2); // the tool's own one-time claim is what keeps a retry from running twice for real
});
