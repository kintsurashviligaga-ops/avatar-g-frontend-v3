/**
 * Agent G's montage worker and its sweep, every effect faked (./testing/fakeMontageDeps): a job renders once under a
 * lease and lands in the row; a worker that dies is replaced once; a job that cannot finish is failed and its charge
 * paid back exactly once, by whoever gets there first; a cancel or a lost lease kills the render and delivers nothing.
 */
import { LEASE_MS } from '@/lib/orchestrator/jobLease';
import type { MontageOutcome } from '@/lib/services/montage/montagePipeline';
import { cancelMontageJob, enqueueMontageJob, quoteMontage } from './montageExec';
import { GAVE_UP, HOLD_ABANDONED, srcQcTimes, sweepMontageJobs, workMontageJob } from './montageWorker';
import { FILES, MASTER_URL, TRACK, USER, balance, clip, fake, type Fake, type RenderOpts } from './testing/fakeMontageDeps';
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
    expect(f.store.writes.progress).toBe(2); // the 'stitch' leg and the 'qc' check, written under the lease
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

describe('every clip of the manifest, before and after the render (owner, 2026-10-11)', () => {
  test('a delivered job carries the per-clip QC evidence: every video seen at its place in the output', async () => {
    const f = fake();
    const id = await queued(f);
    expect(await workMontageJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ outcome: 'delivered' });
    const qc = (f.store.rows.get(id)!.result as { qc: { clips: Array<Record<string, unknown>>; files: number; videos: number; ok: boolean; av: unknown } }).qc;
    expect(qc).toMatchObject({ files: 3, videos: 2, ok: true, av: { videoSec: 30, audioSec: 30 } });
    expect(qc.clips).toEqual([
      expect.objectContaining({ index: 0, name: 'a.mp4', diff: 0, ok: true }),
      expect.objectContaining({ index: 1, name: 'b.mp4', diff: 0, ok: true }),
    ]);
    // Provenance (Media Studio v2.0 §6): the outcome word, each source's share of the master, the audio clocks.
    const prov = (f.store.rows.get(id)!.result as { qc: { outcome: string; sources: Array<{ index: number; outputSec: number }>; audio: { sourceStartSec: number; targetSec: number; sourceAudio: string } } }).qc;
    expect(prov.outcome).toBe('PASS');
    expect(prov.sources.map((x) => x.index)).toEqual([0, 1]);
    expect(prov.sources.every((x) => x.outputSec > 0)).toBe(true);
    expect(prov.sources.reduce((sum, x) => sum + x.outputSec, 0)).toBeCloseTo(prov.audio.targetSec, 1);
    expect(prov.audio).toMatchObject({ timelineStartSec: 0, sourceAudio: 'remove', replacementAudio: 'replace' }); // no asked offset: the track starts on its first beat
    // One read of the master for all clips, one per source (conformed to the master's frame).
    expect(f.grabs.filter((g) => g.url === MASTER_URL)).toHaveLength(1);
    expect(f.grabs.filter((g) => g.url !== MASTER_URL).map((g) => g.fit)).toEqual([true, true]);
  });

  test('a photo among the clips (owner, 2026-10-11 11:37Z): one image shot, checked at its place like a clip, delivered', async () => {
    const PH = [`omni-uploads/${USER}/a.mp4`, `omni-uploads/${USER}/p.jpg`, `omni-uploads/${USER}/b.mp4`, `omni-uploads/${USER}/song.mp3`];
    const still = { ...clip(0.04), hasAudio: false, videoCodec: 'mjpeg', audioCodec: null };
    const f = fake({ files: { [PH[0]!]: clip(20), [PH[1]!]: still, [PH[2]!]: clip(20), [PH[3]!]: TRACK } });
    const q = await quoteMontage(f.deps, { userId: USER, files: PH, prompt: 'cut these to the music' });
    if (!q.ok) throw new Error(q.error);
    expect(q.quote).toMatchObject({ clips: 2, stills: 1 });
    expect(q.quote.manifest?.map((m) => [m.kind, m.durationSec])).toEqual([['video', 20], ['image', 0], ['video', 20], ['audio', 180]]);
    expect(q.request.shots.filter((s) => s.source === 1).map((s) => [s.kind, s.startSec])).toEqual([['image', 0]]);
    const r = await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    if (!r.ok) throw new Error(r.error);
    expect(await workMontageJob(f.deps, { jobId: q.quote.jobId, worker: 'w1' })).toMatchObject({ outcome: 'delivered' });
    const qc = (f.store.rows.get(q.quote.jobId)!.result as { qc: { clips: Array<{ index: number; ok: boolean; srcT: number }>; files: number; videos: number; stills: number; ok: boolean } }).qc;
    expect(qc).toMatchObject({ files: 4, videos: 2, stills: 1, ok: true });
    expect(qc.clips.map((c) => [c.index, c.ok])).toEqual([[0, true], [1, true], [2, true]]);
  });

  test('a master that does not show one clip is FAILED (clip_missing), never completed, with the evidence on the row', async () => {
    const f = fake({ omit: [1] });
    const id = await queued(f, 7);
    expect(await workMontageJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ ran: true, outcome: 'failed' });
    const row = f.store.rows.get(id)!;
    expect(row).toMatchObject({ status: 'failed', signedUrl: null });
    expect(row.error).toMatch(/^clip_missing: clip 2 "b\.mp4" is not in the output at /);
    const qc = (row.result as { qc: { clips: Array<{ index: number; ok: boolean; diff: number }>; ok: boolean } }).qc;
    expect(qc.ok).toBe(false);
    expect((qc as unknown as { outcome: string }).outcome).toBe('FAIL');
    expect(qc.clips.map((c) => [c.index, c.ok])).toEqual([[0, true], [1, false]]);
    expect(qc.clips[1]!.diff).toBeGreaterThan(12);
    expect(balance(f)).toBe(0); // the priced path still pays back what it charged
    expect(trail(f)).toContainEqual(expect.stringMatching(/^run:failed:qc: clip 2 "b\.mp4" is not in the output at /));
  });

  test('a clip that cannot be checked (its frame did not read) fails closed: not delivered', async () => {
    const f = fake();
    const id = await queued(f);
    const grab = f.deps.grabFrames;
    f.deps.grabFrames = async (url, t, o) => (url.endsWith('/b.mp4') ? null : grab(url, t, o));
    await workMontageJob(f.deps, { jobId: id, worker: 'w1' });
    expect(f.store.rows.get(id)).toMatchObject({ status: 'failed', signedUrl: null });
    expect(f.store.rows.get(id)!.error).toMatch(/^qc_failed: clip 2 "b\.mp4" could not be checked/);
  });

  test('srcQcTimes: the planned moment first, then out by half output frames to ±50 ms, never below 0; a photo only at 0', () => {
    expect(srcQcTimes(2.25)).toEqual([2.25, 2.233, 2.267, 2.217, 2.283, 2.2, 2.3]);
    expect(srcQcTimes(0.02)).toEqual([0.02, 0.003, 0.037, 0.053, 0.07]);
    expect(srcQcTimes(0)).toEqual([0]);
  });

  test('a clip the master shows half an output frame after its planned moment is seen there, and the moment is kept (Preview 12:34Z)', async () => {
    const f = fake();
    const id = await queued(f);
    const grab = f.deps.grabFrames;
    let planned = -1;
    f.deps.grabFrames = async (url, t, o) => {
      const real = await grab(url, t, o);
      if (!url.endsWith('/b.mp4') || !real) return real;
      planned = t[0]!;
      // Only the frame 1/60 s after the planned moment is the one in the master; every other read is a different picture.
      return real.map((fr, k) => (Math.abs(t[k]! - (planned + 1 / 60)) < 0.002 ? fr : new Uint8Array(fr!.length).fill(fr![0]! > 128 ? 0 : 255)));
    };
    expect(await workMontageJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ outcome: 'delivered' });
    const b = (f.store.rows.get(id)!.result as { qc: { clips: Array<{ index: number; diff: number; srcT: number; matchT?: number }> } }).qc.clips[1]!;
    expect(b).toMatchObject({ index: 1, diff: 0, srcT: planned });
    expect(b.matchT).toBeCloseTo(planned + 1 / 60, 2);
  });

  test('A/V: a soundtrack missing or ending away from the picture is not delivered', async () => {
    for (const streams of [{ videoSec: 30, audioSec: null }, { videoSec: 30, audioSec: 29.5 }, null]) {
      const f = fake({ streams });
      const id = await queued(f);
      await workMontageJob(f.deps, { jobId: id, worker: 'w1' });
      expect(f.store.rows.get(id)).toMatchObject({ status: 'failed', signedUrl: null });
      expect(f.store.rows.get(id)!.error).toMatch(/^qc_failed: /);
    }
    const f = fake({ streams: { videoSec: 30, audioSec: 30.1 } });
    const id = await queued(f);
    expect(await workMontageJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ outcome: 'delivered' });
  });

  test('before rendering: a stored plan missing a clip, or a stored manifest that is not the signed one, is failed unrendered', async () => {
    const cases: Array<(p: { request: { shots: Array<{ source: number }>; manifest: Array<{ name: string }> }; manifest: Array<{ name: string }> }) => unknown> = [
      (p) => ({ ...p, request: { ...p.request, shots: p.request.shots.filter((s) => s.source === 0) } }),
      (p) => ({ ...p, manifest: p.manifest.slice(1) }),
      (p) => ({ ...p, manifest: p.manifest.map((m, i) => (i === 0 ? { ...m, name: 'x.mp4' } : m)) }),
      (p) => ({ request: p.request }),
      (p) => ({ ...p, request: { ...p.request, manifest: undefined } }),
    ];
    for (const change of cases) {
      const f = fake();
      const id = await queued(f);
      const row = f.store.rows.get(id)!;
      row.params = { ...row.params, _job: change(row.params._job as never) };
      expect(await workMontageJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ outcome: 'failed' });
      expect(f.store.rows.get(id)!).toMatchObject({ status: 'failed', signedUrl: null });
      expect(f.store.rows.get(id)!.error).toMatch(/^manifest_invalid: /);
      expect(f.renders).toHaveLength(0);
    }
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
