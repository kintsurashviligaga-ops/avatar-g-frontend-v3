/**
 * Agent G's montage worker and its sweep, every effect faked (./testing/fakeMontageDeps): a job renders once under a
 * lease and lands in the row; a worker that dies is replaced once; a job that cannot finish is failed and its charge
 * paid back exactly once, by whoever gets there first; a cancel or a lost lease kills the render and delivers nothing.
 */
import { LEASE_MS } from '@/lib/orchestrator/jobLease';
import type { MontageOutcome } from '@/lib/services/montage/montagePipeline';
import { cancelMontageJob, enqueueMontageJob, quoteMontage } from './montageExec';
import { GAVE_UP, HOLD_ABANDONED, sweepMontageJobs, workMontageJob } from './montageWorker';
import { FILES, MASTER_URL, USER, balance, clip, fake, type Fake, type RenderOpts } from './testing/fakeMontageDeps';
import { signQuote } from './quoteToken';
import { bodyFingerprint } from '@/lib/orchestrator/idemRef';

const OK = (req: { shots: unknown[]; aspect: string }): MontageOutcome => ({
  ok: true, result: { videoUrl: MASTER_URL, durationSec: 30, shots: req.shots.length, aspect: req.aspect, bridged: 0, hasMusic: true, stepsRun: ['resolve', 'stitch', 'music'] },
});

/** A render the test finishes by hand; it ends early (like the real lane) when its signal aborts. */
function heldRender() {
  const calls: Array<{ opts: RenderOpts; finish: (o?: MontageOutcome) => void }> = [];
  const render = (req: { shots: unknown[]; aspect: string }, opts: RenderOpts) => new Promise<MontageOutcome>((resolve) => {
    opts.signal.addEventListener('abort', () => resolve({ ok: false, step: 'stitch', error: 'cancelled' }));
    calls.push({ opts, finish: (o) => resolve(o ?? OK(req)) });
  });
  return { calls, render };
}

/** Quote → (priced?) → queued. Returns the job id. */
async function queued(f: Fake, credits = 0): Promise<string> {
  const q = await quoteMontage(f.deps, { userId: USER, files: FILES });
  if (!q.ok) throw new Error(q.error);
  const token = credits > 0 ? signQuote({ u: USER, j: q.quote.jobId, f: bodyFingerprint(q.request), c: credits, x: f.clock.now + 60_000 }, 'k')! : q.token;
  const r = await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token });
  if (!r.ok) throw new Error(r.error);
  return q.quote.jobId;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const trail = (f: Fake) => f.audits.filter((a) => a.phase !== 'quote').map((a) => `${a.phase}:${a.outcome}:${a.detail ?? ''}`);

describe('work: one job, rendered under a lease', () => {
  test('claims, reports its legs, QCs the master and delivers it into the row; the heartbeat ends with it', async () => {
    const f = fake();
    const id = await queued(f);
    const r = await workMontageJob(f.deps, { jobId: id, worker: 'w1' });
    expect(r).toEqual({ ran: true, outcome: 'delivered', videoUrl: MASTER_URL });
    expect(f.store.rows.get(id)).toMatchObject({
      status: 'completed', pct: 100, signedUrl: MASTER_URL,
      result: { videoUrl: MASTER_URL, subtype: 'montage', via: 'agent-g', durationSec: 30 },
      exec: { attempt: 1, owner: null, leaseUntil: null },
    });
    expect(f.store.writes.progress).toBe(1); // the 'stitch' leg, written under the lease
    expect(f.beating()).toBe(0);
    expect(trail(f)).toEqual(['run:ok:queued', 'run:ok:started', 'run:ok:delivered']);
  });

  test('a second worker on the same job renders nothing', async () => {
    const f = fake();
    const id = await queued(f);
    const held = heldRender();
    f.deps.render = held.render;
    const first = workMontageJob(f.deps, { jobId: id, worker: 'w1' });
    await flush();
    expect(await workMontageJob(f.deps, { jobId: id, worker: 'w2' })).toEqual({ ran: false, reason: 'leased' });
    held.calls[0]!.finish();
    expect(await first).toMatchObject({ outcome: 'delivered' });
    expect(f.renders).toHaveLength(0); // the held render replaced the counting one
    expect(held.calls).toHaveLength(1);
  });

  test('a render that fails on its own is final at once (no retry), and pays back what it charged', async () => {
    const f = fake({ render: async () => ({ ok: false, step: 'stitch', error: 'the shots could not be stitched together' }) });
    const id = await queued(f, 7);
    expect(balance(f)).toBe(-7);
    expect(await workMontageJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ ran: true, outcome: 'failed' });
    expect(f.store.rows.get(id)).toMatchObject({ status: 'failed', error: 'render_failed: stitch: the shots could not be stitched together' });
    expect(f.store.rows.get(id)!.exec!.owe).toBeUndefined();
    expect(balance(f)).toBe(0);
    expect(await sweepMontageJobs(f.deps, { worker: 's', work: true })).toMatchObject({ waiting: [], gaveUp: [] });
    expect(f.renders).toHaveLength(1);
  });

  test('QC: a master without sound, of the wrong length, or without the music is not delivered', async () => {
    for (const master of [{ ...clip(30), hasAudio: false }, { ...clip(30), durationSec: 12 }, null]) {
      const f = fake({ master });
      const id = await queued(f);
      expect(await workMontageJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ outcome: 'failed' });
      expect(f.store.rows.get(id)).toMatchObject({ status: 'failed', signedUrl: null });
      expect(f.store.rows.get(id)!.error).toMatch(/^qc_failed: /);
    }
    const f = fake({ render: async (req) => ({ ...OK(req), result: { ...(OK(req) as { result: object }).result, hasMusic: false } } as MontageOutcome) });
    const id = await queued(f);
    await workMontageJob(f.deps, { jobId: id, worker: 'w1' });
    expect(f.store.rows.get(id)!.error).toContain('the music did not mix');
  });

  test('a stored plan that does not validate is failed, never rendered', async () => {
    const f = fake();
    const id = await queued(f);
    const row = f.store.rows.get(id)!;
    row.params = { ...row.params, _job: { request: { shots: [] } } };
    expect(await workMontageJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ outcome: 'failed' });
    expect(f.store.rows.get(id)!.error).toMatch(/^invalid_request: /);
    expect(f.renders).toHaveLength(0);
  });
});

describe('cancel: the heartbeat stops the render', () => {
  test('the owner cancels mid-render: the next heartbeat aborts it, nothing is delivered, the charge comes back once', async () => {
    const f = fake();
    const id = await queued(f, 7);
    const held = heldRender();
    f.deps.render = held.render;
    const run = workMontageJob(f.deps, { jobId: id, worker: 'w1' });
    await flush();
    expect(await cancelMontageJob(f.deps, { userId: USER, jobId: id })).toEqual({ ok: true });
    expect(held.calls[0]!.opts.signal.aborted).toBe(false);
    await f.beat(); // the next heartbeat hears it…
    expect(held.calls[0]!.opts.signal.aborted).toBe(true); // …and kills the render (the live lane's ffmpeg dies here)
    expect(await run).toEqual({ ran: true, outcome: 'stopped' });
    expect(f.store.rows.get(id)).toMatchObject({ status: 'failed', error: 'cancelled by the user', signedUrl: null });
    expect(balance(f)).toBe(0);
    expect(f.ledger.filter((l) => l.delta > 0)).toHaveLength(1);
    expect(f.beating()).toBe(0);
  });

  test('a cancel that lands after the render but before delivery still wins: no video, refunded', async () => {
    const f = fake();
    const id = await queued(f, 7);
    f.deps.probe = (async () => {
      await cancelMontageJob(f.deps, { userId: USER, jobId: id }); // the owner presses Stop during QC
      return { ...clip(30), durationSec: 30 };
    }) as typeof f.deps.probe;
    expect(await workMontageJob(f.deps, { jobId: id, worker: 'w1' })).toEqual({ ran: true, outcome: 'stopped' });
    expect(f.store.rows.get(id)).toMatchObject({ status: 'failed', signedUrl: null });
    expect(balance(f)).toBe(0);
  });
});

describe('crash: a worker that dies is replaced once; then the job is given up and paid back', () => {
  test('worker 1 dies mid-render (stops renewing); after its lease the sweep retries; worker 1 waking up later changes nothing', async () => {
    const f = fake();
    const id = await queued(f, 7);
    const held = heldRender();
    f.deps.render = held.render;
    const dead = workMontageJob(f.deps, { jobId: id, worker: 'w1' }); // its function is frozen: no heartbeat ever fires
    await flush();

    f.clock.now += LEASE_MS;
    const sweep = sweepMontageJobs(f.deps, { worker: 'w2', work: true });
    await flush();
    expect(f.store.rows.get(id)).toMatchObject({ status: 'processing', stage: 'retrying', exec: { attempt: 2, owner: 'w2' } });
    held.calls[1]!.finish();
    expect(await sweep).toMatchObject({ waiting: [id], worked: { jobId: id, result: { outcome: 'delivered' } } });

    held.calls[0]!.finish(); // worker 1 comes back with its own master: it is no longer the owner
    expect(await dead).toEqual({ ran: true, outcome: 'lost' });
    expect(f.store.rows.get(id)).toMatchObject({ status: 'completed', exec: { owner: null, attempt: 2 } });
    expect(balance(f)).toBe(-7); // delivered once, charged once
    expect(trail(f)).toContain('run:retried:started');
  });

  test('both attempts die: the sweep fails the job and pays back the charge, once', async () => {
    const f = fake();
    const id = await queued(f, 7);
    const held = heldRender();
    f.deps.render = held.render;
    void workMontageJob(f.deps, { jobId: id, worker: 'w1' });
    await flush();
    f.clock.now += LEASE_MS;
    void workMontageJob(f.deps, { jobId: id, worker: 'w2' });
    await flush();
    f.clock.now += LEASE_MS;
    const r = await sweepMontageJobs(f.deps, { worker: 's', work: true });
    expect(r).toMatchObject({ gaveUp: [id], waiting: [] });
    expect(f.store.rows.get(id)).toMatchObject({ status: 'failed', error: GAVE_UP });
    expect(balance(f)).toBe(0);
    await sweepMontageJobs(f.deps, { worker: 's', work: true });
    expect(f.ledger.filter((l) => l.delta > 0)).toHaveLength(1);
    expect(held.calls).toHaveLength(2);
  });

  test('a refund that does not land stays owed on the row, and a later sweep pays it', async () => {
    const f = fake({ render: async () => ({ ok: false, step: 'music', error: 'boom' }), refundDown: true });
    const id = await queued(f, 7);
    await workMontageJob(f.deps, { jobId: id, worker: 'w1' });
    expect(f.store.rows.get(id)!.exec!.owe).toBe('refund');
    expect(balance(f)).toBe(-7);
    expect(f.audits.some((a) => a.phase === 'refund' && a.outcome === 'failed')).toBe(true);

    // The ledger is still down at the next sweep: the debt is reported as still owed (the sweep route alerts on it).
    expect(await sweepMontageJobs(f.deps, { worker: 's', work: false })).toMatchObject({ paid: [], stillOwed: [id] });

    f.flags.refundDown = false; // the ledger is back
    const r = await sweepMontageJobs(f.deps, { worker: 's', work: false });
    expect(r.paid).toEqual([id]);
    expect(r.stillOwed).toEqual([]);
    expect(f.store.rows.get(id)!.exec!.owe).toBeUndefined();
    expect(balance(f)).toBe(0);
    await sweepMontageJobs(f.deps, { worker: 's', work: false });
    expect(f.ledger.filter((l) => l.delta > 0)).toHaveLength(1);
  });

  test('a worker stalled past its lease (another took over) stops at its next heartbeat and writes nothing', async () => {
    const f = fake();
    const id = await queued(f);
    const held = heldRender();
    f.deps.render = held.render;
    const slow = workMontageJob(f.deps, { jobId: id, worker: 'w1' });
    await flush();
    f.clock.now += LEASE_MS;
    const other = workMontageJob(f.deps, { jobId: id, worker: 'w2' });
    await flush();
    await f.beat(); // w1's heartbeat finally runs: the row is w2's now
    expect(held.calls[0]!.opts.signal.aborted).toBe(true);
    expect(await slow).toEqual({ ran: true, outcome: 'lost' });
    held.calls[1]!.finish();
    expect(await other).toMatchObject({ outcome: 'delivered' });
  });
});

describe('sweep', () => {
  test('inert on an empty queue', async () => {
    expect(await sweepMontageJobs(fake().deps, { worker: 's', work: true })).toEqual({ gaveUp: [], paid: [], stillOwed: [], waiting: [] });
  });

  test('renders the oldest waiting job (its tab closed before a worker started), one per sweep', async () => {
    const f = fake();
    const a = await queued(f);
    f.clock.now += 1;
    const b = await queued(f);
    const r = await sweepMontageJobs(f.deps, { worker: 's1', work: true });
    expect(r).toMatchObject({ waiting: [a, b], worked: { jobId: a, result: { outcome: 'delivered' } } });
    expect(f.store.rows.get(b)!.status).toBe('pending');
    expect((await sweepMontageJobs(f.deps, { worker: 's2', work: true })).worked).toMatchObject({ jobId: b });
  });

  test('a charge whose request died mid-way (billing hold abandoned) is failed and paid back', async () => {
    const f = fake();
    const q = await quoteMontage(f.deps, { userId: USER, files: FILES });
    if (!q.ok) throw new Error(q.error);
    const token = signQuote({ u: USER, j: q.quote.jobId, f: bodyFingerprint(q.request), c: 7, x: f.clock.now + 60_000 }, 'k')!;
    // The request charged, then died before it could release the row to the workers.
    f.store.beforeCas = () => { f.store.down = true; };
    await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token });
    f.store.beforeCas = undefined;
    f.store.down = false;
    const id = q.quote.jobId;
    expect(f.store.rows.get(id)!.exec!.hold).toBe('billing');
    expect(balance(f)).toBe(-7);
    expect((await sweepMontageJobs(f.deps, { worker: 's', work: true })).gaveUp).toEqual([]);
    f.clock.now += 120_000;
    const r = await sweepMontageJobs(f.deps, { worker: 's', work: true });
    expect(r.gaveUp).toEqual([id]);
    expect(f.store.rows.get(id)).toMatchObject({ status: 'failed', error: HOLD_ABANDONED });
    expect(balance(f)).toBe(0);
    expect(f.renders).toHaveLength(0);
  });
});
