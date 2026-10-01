/** @jest-environment node */
/**
 * tick.ts with an in-memory store, a scripted Veo engine, a fake ledger and a fake stitcher — no database, no
 * provider, no ffmpeg. Rules under test: a whole film driven tick by tick (act-by-act debits, the concurrency cap,
 * one submit per scene, the act-2 opener rendered from act 1's last frame, the stitch, completedAt); a thrown submit
 * is ambiguous (failed + refunded, never re-submitted); the budget guard and a provider quota HOLD the job; an
 * unaffordable act holds and then fails at the deadline with nothing charged; cancel; a missed refund is retried on a
 * later tick; stitch failures (retryable, final, deferred for time); the tick budget; and per-job error isolation.
 */
import { DEFAULT_MACHINE_CONFIG, type SceneState } from './stateMachine';
import { actChargeRef, runLongformTick, sceneRefundRef } from './tick';
import {
  harness,
  makeJob,
  makeScenes,
  MIN,
  T0,
  runUntilTerminal as runAll,
  TICK_OPTS as OPTS,
  type Harness,
} from './testing/tickFakes';

/** Every tick: never more than the concurrency cap in flight. */
const runUntilTerminal = (h: Harness, maxTicks = 60) =>
  runAll(h, {
    maxTicks,
    onTick: () => {
      const inFlight = h.store.scenes.get('j1')!.filter((s) => s.status === 'submitted' || s.status === 'rendering').length;
      expect(inFlight).toBeLessThanOrEqual(DEFAULT_MACHINE_CONFIG.maxConcurrentPerJob);
    },
  });

describe('a whole 13-scene film (acts 7 / 6), tick by tick', () => {
  test('debits act by act, one submit per scene, act 2 opens from act 1\'s last frame, stitches, done', async () => {
    const h = harness();
    h.store.add(makeJob(), makeScenes(13));
    const reports = await runUntilTerminal(h);

    const job = h.store.job();
    expect(job).toMatchObject({ status: 'done', outputUrl: 'https://cdn/film.mp4', errorCode: null });
    expect(h.store.jobPatches.find((p) => p.status === 'done')).toMatchObject({ outputPath: 'longform/j1/film.mp4', outputBytes: 40_000_000 });
    expect(typeof h.store.jobPatches.find((p) => p.status === 'done')?.completedAt).toBe('number');
    expect(h.debits).toEqual([{ ref: actChargeRef('j1', 0), credits: 7 * 39 }, { ref: actChargeRef('j1', 1), credits: 6 * 39 }]);
    expect(h.submits.map((s) => s.ordinal).sort((a, b) => a - b)).toEqual([...Array(13).keys()]);
    expect(h.refunds).toEqual([]);
    expect(h.stitchCalls).toEqual([{ ordinals: [...Array(13).keys()], budgetMs: expect.any(Number) }]);

    // Every scene: charged with the act ref and per-scene credits, delivered with its bytes and path.
    for (const s of h.store.scenes.get('j1')!) {
      expect(s).toMatchObject({ status: 'delivered', chargeRef: actChargeRef('j1', s.act), chargeCredits: 39, outputBytes: 4_000_000, outputPath: `longform/j1/${s.ordinal}.mp4` });
    }
    // The engine request: the compiled bible subject, 8 s, the film's seed and session; scene 7 from scene 6's frame.
    const s0 = h.submits.find((s) => s.ordinal === 0)!.input;
    expect(s0).toMatchObject({ tier: 'fast', sessionId: 'longform-j1', ordinal: 0, request: { aspect: '16:9', durationSec: 8, seed: 77, resolution: '1080p', generateAudio: true } });
    expect(s0.request.prompt).toContain('woman in a red coat');
    expect(s0.request.startImage).toBeUndefined();
    const s7 = h.submits.find((s) => s.ordinal === 7)!.input;
    expect(s7.request.startImage).toEqual({ kind: 'url', url: 'https://cdn/6-last.jpg' });
    expect(s7.request.prompt).not.toContain('woman in a red coat'); // i2v: motion only
    expect(h.store.scene(7).seedFrameUrl).toBe('https://cdn/6-last.jpg');

    expect(reports.reduce((s, r) => s + r.submitted, 0)).toBe(13);
    expect(reports.reduce((s, r) => s + r.delivered, 0)).toBe(13);
    expect(reports.every((r) => r.errors === 0)).toBe(true);
    // The lease is always released.
    expect(h.store.jobs.get('j1')!.leaseUntil).toBeNull();
  });

  test('reference images turn chaining into a no-op request-wise (Veo: references exclude a first frame)', async () => {
    const h = harness();
    h.store.add(makeJob({ options: { referenceImageUrls: ['https://cdn/me.jpg'] } }), makeScenes(13));
    await runUntilTerminal(h);
    const s7 = h.submits.find((s) => s.ordinal === 7)!.input;
    expect(s7.request.startImage).toBeUndefined();
    expect(s7.request.referenceImages).toEqual([{ kind: 'url', url: 'https://cdn/me.jpg' }]);
  });
});

describe('failure handling', () => {
  test('a THROWN submit is ambiguous: the scene fails and is refunded under its own ref, never re-submitted', async () => {
    const h = harness({ submit: (o) => (o === 2 ? new Error('socket hang up') : (undefined as never)) });
    h.store.add(makeJob(), makeScenes(13));
    await runUntilTerminal(h);
    expect(h.submits.filter((s) => s.ordinal === 2)).toHaveLength(1);
    expect(h.store.scene(2)).toMatchObject({ status: 'failed', error: 'ambiguous_submit', refunded: true });
    const ref = actChargeRef('j1', 0);
    expect(h.refunds).toEqual([{ ref: sceneRefundRef(ref, 2), credits: 39, chargeRef: ref }]);
    expect(sceneRefundRef(ref, 2).startsWith(`${ref}:`)).toBe(true); // counted against the act debit by the ledger
    // 1 failure of 13 is within the 10 % budget: the film is stitched from the other 12.
    expect(h.store.job().status).toBe('done');
    expect(h.stitchCalls[0]?.ordinals).not.toContain(2);
  });

  test('a provable 503 is retried with backoff; a Veo "failed" verdict is re-submitted; both within maxAttempts', async () => {
    let failedOnce = false;
    const h = harness({
      submit: (o, n) => (o === 0 && n === 1 ? { report: { kind: 'outcome', outcome: { ok: false, reason: 'unavailable', retryable: true } } } : (undefined as never)),
      poll: (o, n) => {
        if (o === 1 && !failedOnce) {
          failedOnce = true;
          return { state: 'failed', reason: 'internal' };
        }
        return n >= 2 ? { state: 'delivered', url: `https://cdn/${o}.mp4` } : { state: 'processing' };
      },
    });
    h.store.add(makeJob(), makeScenes(13));
    await runUntilTerminal(h);
    expect(h.submits.filter((s) => s.ordinal === 0)).toHaveLength(2);
    expect(h.submits.filter((s) => s.ordinal === 1)).toHaveLength(2);
    expect(h.store.scene(0).attempts).toBe(2);
    expect(h.store.job().status).toBe('done');
    expect(h.refunds).toEqual([]);
  });

  test('the budget guard refusing HOLDS the job (attempt given back) and stops submitting for this tick', async () => {
    let refuse = true;
    const h = harness({ submit: () => (refuse ? { report: { kind: 'budget_refused', reason: 'daily_limit' } } : (undefined as never)) });
    h.store.add(makeJob(), makeScenes(13));
    h.clock.t += MIN;
    const r = await runLongformTick(h.deps, OPTS);
    expect(r).toMatchObject({ holds: 1, submitted: 0 });
    expect(h.submits).toHaveLength(1); // the first refusal stops the rest
    expect(h.store.job()).toMatchObject({ status: 'rendering', holdReason: 'platform_budget', holdUntil: h.clock.t + 30 * MIN });
    expect(h.store.scene(0)).toMatchObject({ status: 'queued', attempts: 0, nextAttemptAt: h.clock.t + 30 * MIN });
    // While held: no submits at all.
    h.clock.t += 10 * MIN;
    await runLongformTick(h.deps, OPTS);
    expect(h.submits).toHaveLength(1);
    // After the hold: the film proceeds.
    refuse = false;
    h.clock.t += 21 * MIN;
    await runUntilTerminal(h);
    expect(h.store.job().status).toBe('done');
  });

  test('a provider quota outcome holds the job as provider_unavailable', async () => {
    const h = harness({ submit: () => ({ report: { kind: 'outcome', outcome: { ok: false, reason: 'quota', retryable: false } } }) });
    h.store.add(makeJob(), makeScenes(13));
    h.clock.t += MIN;
    await runLongformTick(h.deps, OPTS);
    expect(h.store.job()).toMatchObject({ holdReason: 'provider_unavailable', holdUntil: h.clock.t + 15 * MIN });
    expect(h.store.scene(0).status).toBe('queued');
  });

  test('an unaffordable act holds the job; at the deadline it fails with nothing charged or refunded', async () => {
    const h = harness({ reserve: () => 'insufficient' });
    h.store.add(makeJob({ deadlineAt: T0 + 90 * MIN }), makeScenes(13));
    h.clock.t += MIN;
    const r = await runLongformTick(h.deps, OPTS);
    expect(r).toMatchObject({ holds: 1, reserved: 0, submitted: 0 });
    expect(h.store.job()).toMatchObject({ status: 'rendering', holdReason: 'insufficient_credits' });
    h.clock.t = T0 + 91 * MIN;
    await runLongformTick(h.deps, OPTS);
    expect(h.store.job()).toMatchObject({ status: 'failed', errorCode: 'deadline_insufficient_credits' });
    expect(h.submits).toHaveLength(0);
    expect(h.debits).toHaveLength(0);
    expect(h.refunds).toHaveLength(0);
    expect(h.store.scenes.get('j1')!.every((s) => s.status === 'failed')).toBe(true);
  });

  test('cancel: in-flight work abandoned, undelivered charges refunded, delivered clips stay paid', async () => {
    const h = harness();
    h.store.add(makeJob(), makeScenes(13));
    for (let i = 0; i < 3; i++) { h.clock.t += MIN; await runLongformTick(h.deps, OPTS); }
    const delivered = h.store.scenes.get('j1')!.filter((s) => s.status === 'delivered').map((s) => s.ordinal);
    expect(delivered.length).toBeGreaterThan(0);
    h.store.job().cancelRequested = true;
    h.clock.t += MIN;
    await runLongformTick(h.deps, OPTS);
    expect(h.store.job()).toMatchObject({ status: 'canceled', errorCode: 'canceled_by_user' });
    const charged = h.store.scenes.get('j1')!.filter((s) => s.chargeRef);
    const refundedOrdinals = h.refunds.map((r) => Number(/:s(\d+):refund$/.exec(r.ref)![1])).sort((a, b) => a - b);
    expect(refundedOrdinals).toEqual(charged.filter((s) => !delivered.includes(s.ordinal)).map((s) => s.ordinal));
    expect(h.store.scenes.get('j1')!.filter((s) => !delivered.includes(s.ordinal)).every((s) => s.status === 'failed')).toBe(true);
  });

  test('a refund that misses keeps the job claimable (refundsPending) until a later tick lands it', async () => {
    const h = harness({ submit: (o) => (o === 0 ? new Error('boom') : (undefined as never)), refund: (_ref, attempt) => attempt > 1 });
    h.store.add(makeJob(), makeScenes(13));
    h.clock.t += MIN;
    const r1 = await runLongformTick(h.deps, OPTS);
    expect(r1.refundMisses).toBe(1);
    expect(h.store.job().refundsPending).toBe(true);
    expect(h.store.scene(0).refunded).toBe(false);
    h.clock.t += MIN;
    await runLongformTick(h.deps, OPTS);
    expect(h.store.scene(0).refunded).toBe(true);
    expect(h.store.job().refundsPending).toBe(false);
    expect(h.refunds.map((x) => x.ref)).toEqual([sceneRefundRef(actChargeRef('j1', 0), 0)]);
  });

  test('a terminal job claimed only for a pending refund is settled and released, nothing else runs', async () => {
    const h = harness();
    const scenes = makeScenes(2, 7, (i) => ({ status: 'failed', chargeRef: actChargeRef('j1', 0), chargeCredits: 39, error: i ? 'x' : 'y' }));
    h.store.add(makeJob({ status: 'failed', errorCode: 'too_many_scene_failures', refundsPending: true, sceneCount: 2 }), scenes);
    h.clock.t += MIN;
    const r = await runLongformTick(h.deps, OPTS);
    expect(r).toMatchObject({ jobs: 1, refunded: 2, submitted: 0, polled: 0 });
    expect(h.store.job().refundsPending).toBe(false);
  });
});

describe('the stitch', () => {
  const allDelivered = () => makeScenes(13, 7, (i) => ({ status: 'delivered', outputUrl: `https://cdn/${i}.mp4`, outputBytes: 1000, chargeRef: actChargeRef('j1', i < 7 ? 0 : 1), chargeCredits: 39 }));

  test('a retryable failure is retried once more, then the job fails and refunds EVERYTHING (we could not assemble it)', async () => {
    const h = harness({ stitch: () => ({ ok: false, reason: 'ffmpeg exited 1', retryable: true }) });
    h.store.add(makeJob({ status: 'rendering' }), allDelivered());
    h.clock.t += MIN;
    await runLongformTick(h.deps, OPTS);
    expect(h.store.job()).toMatchObject({ status: 'stitching', stitchAttempts: 1 });
    h.clock.t += MIN;
    await runLongformTick(h.deps, OPTS);
    expect(h.store.job()).toMatchObject({ status: 'failed', errorCode: 'stitch_failed', stitchAttempts: 2 });
    expect(h.refunds).toHaveLength(13);
  });

  test('a final failure (needs_resumable_upload) fails at once', async () => {
    const h = harness({ stitch: () => ({ ok: false, reason: 'needs_resumable_upload', retryable: false }) });
    h.store.add(makeJob({ status: 'rendering' }), allDelivered());
    h.clock.t += MIN;
    await runLongformTick(h.deps, OPTS);
    expect(h.store.job()).toMatchObject({ status: 'failed', errorCode: 'stitch_failed' });
    expect(h.store.jobPatches.some((p) => p.errorDetail === 'needs_resumable_upload')).toBe(true);
    expect(h.stitchCalls).toHaveLength(1);
  });

  test('a stitch is deferred (not attempted) when the tick budget is too small for it', async () => {
    const h = harness();
    h.store.add(makeJob({ status: 'rendering' }), allDelivered());
    h.clock.t += MIN;
    const r = await runLongformTick(h.deps, { timeBudgetMs: 50_000, minStitchBudgetMs: 120_000 });
    expect(r.stitchDeferred).toBe(1);
    expect(h.stitchCalls).toHaveLength(0);
    expect(h.store.job()).toMatchObject({ status: 'stitching', stitchAttempts: 0 });
    expect(h.logs.some((l) => l.includes('stitch deferred'))).toBe(true);
  });
});

describe('tick mechanics', () => {
  test('the time budget: jobs left when it runs out are released untouched', async () => {
    const h = harness();
    h.store.add(makeJob({ id: 'j1' }), makeScenes(13));
    h.store.add(makeJob({ id: 'j2' }), makeScenes(13));
    const now = h.deps.now;
    h.deps.now = () => now() + (h.store.claimCalls > 0 ? 20 * MIN : 0); // time jumps once job 1 starts submitting
    h.clock.t += MIN;
    const r = await runLongformTick(h.deps, { timeBudgetMs: MIN, minStitchBudgetMs: 0 });
    expect(r.timeBudgetExhausted).toBe(true);
    expect(h.store.jobs.get('j2')!.leaseUntil).toBeNull();
    expect(h.store.job('j2').status).toBe('planned');
  });

  test('a scene another tick already claimed is skipped, not submitted', async () => {
    const h = harness();
    h.store.add(makeJob(), makeScenes(13));
    const realClaim = h.store.claimScenes.bind(h.store);
    h.store.claimScenes = async (jobId, ordinals) => (ordinals.includes(1) ? [] : realClaim(jobId, ordinals));
    h.clock.t += MIN;
    await runLongformTick(h.deps, OPTS); // reserves act 0
    expect(h.submits.map((s) => s.ordinal)).toEqual([0, 2, 3]);
  });

  test('claimJobs failing is reported; one job throwing does not stop the next', async () => {
    const h = harness();
    h.store.claimJobs = async () => { throw new Error('db down'); };
    expect(await runLongformTick(h.deps, OPTS)).toMatchObject({ errors: 1, jobs: 0 });

    const g = harness();
    g.store.add(makeJob({ id: 'bad' }), makeScenes(1));
    g.store.add(makeJob({ id: 'j1' }), makeScenes(13));
    const load = g.store.loadScenes.bind(g.store);
    g.store.loadScenes = async (id) => { if (id === 'bad') throw new Error('corrupt row'); return load(id); };
    g.clock.t += MIN;
    const r = await runLongformTick(g.deps, OPTS);
    expect(r).toMatchObject({ jobs: 2, errors: 1 });
    expect(g.store.job('j1').status).toBe('rendering');
    expect(g.store.jobs.get('bad')!.leaseUntil).toBeNull();
    expect(g.logs.some((l) => l.includes('job bad failed this tick: corrupt row'))).toBe(true);
  });

  test('a poll that throws reads as "still processing"; persisted patches are exactly the machine\'s diffs', async () => {
    const h = harness({ poll: () => { throw new Error('network'); } });
    h.store.add(makeJob(), makeScenes(13));
    h.clock.t += MIN;
    await runLongformTick(h.deps, OPTS);
    h.clock.t += MIN;
    await runLongformTick(h.deps, OPTS);
    expect(h.store.scene(0)).toMatchObject({ status: 'rendering', nextAttemptAt: h.clock.t + DEFAULT_MACHINE_CONFIG.pollIntervalMs });
    const allowed = new Set<keyof SceneState | 'transport' | 'model' | 'outputBytes' | 'outputPath' | 'deliveredAt'>([
      'status', 'attempts', 'operation', 'nextAttemptAt', 'submittedAt', 'dependsOn', 'seedFrameUrl', 'chargeRef', 'chargeCredits',
      'refunded', 'outputUrl', 'error', 'transport', 'model', 'outputBytes', 'outputPath', 'deliveredAt',
    ]);
    for (const { patch } of h.store.scenePatches) for (const k of Object.keys(patch)) expect(allowed.has(k as never)).toBe(true);
  });
});

describe('after the stitch: the Library and the scene media', () => {
  test('a done film is filed once and the clips + seed frames it was cut from are removed — never the film', async () => {
    const h = harness();
    h.store.add(makeJob(), makeScenes(13));
    const reports = await runUntilTerminal(h);
    expect(h.store.job().status).toBe('done');
    expect(h.filed).toEqual([{ jobId: 'j1', userId: 'u1', film: { url: 'https://cdn/film.mp4', path: 'longform/j1/film.mp4', bytes: 40_000_000 } }]);
    expect(h.removed).toHaveLength(1);
    expect(h.removed[0]!.clipPaths.slice().sort()).toEqual(Array.from({ length: 13 }, (_, i) => `longform/j1/${i}.mp4`).sort());
    expect(h.removed[0]!.seedOrdinals).toEqual([7]); // the act-2 opener's seed frame
    expect(h.removed[0]!.filmPath).toBe('longform/j1/film.mp4');
    expect(h.removed[0]!.clipPaths).not.toContain('longform/j1/film.mp4');
    expect(reports.reduce((s, r) => s + r.filed, 0)).toBe(1);
    expect(reports.every((r) => r.fileMisses === 0 && r.cleanupMisses === 0)).toBe(true);
  });

  test('ONLY after `done` is persisted: a failed done-write files nothing, removes nothing, and the next tick re-stitches', async () => {
    const h = harness();
    h.store.add(makeJob({ status: 'rendering' }), makeScenes(13, 7, (i) => ({ status: 'delivered', outputUrl: `https://cdn/${i}.mp4`, outputPath: `longform/j1/${i}.mp4`, chargeRef: actChargeRef('j1', i < 7 ? 0 : 1), chargeCredits: 39 })));
    const patchJob = h.store.patchJob.bind(h.store);
    let failDone = true;
    h.store.patchJob = async (id, patch) => {
      if (patch.status === 'done' && failDone) { failDone = false; throw new Error('db blip'); }
      return patchJob(id, patch);
    };
    h.clock.t += MIN;
    const r1 = await runLongformTick(h.deps, OPTS);
    expect(r1.errors).toBe(1);
    expect(h.store.job().status).toBe('stitching');
    expect(h.filed).toEqual([]);
    expect(h.removed).toEqual([]);
    h.clock.t += MIN;
    await runLongformTick(h.deps, OPTS);
    expect(h.store.job().status).toBe('done');
    expect(h.stitchCalls).toHaveLength(2);
    expect(h.filed).toHaveLength(1);
    expect(h.removed).toHaveLength(1);
  });

  test('a Library miss or a refused delete is counted and logged; the film is done either way', async () => {
    const h = harness({ file: () => false, remove: () => new Error('storage 500') });
    h.store.add(makeJob(), makeScenes(13));
    const reports = await runUntilTerminal(h);
    expect(h.store.job()).toMatchObject({ status: 'done', outputUrl: 'https://cdn/film.mp4' });
    expect(reports.reduce((s, r) => s + r.fileMisses, 0)).toBe(1);
    expect(reports.reduce((s, r) => s + r.cleanupMisses, 0)).toBe(1);
    expect(reports.every((r) => r.errors === 0)).toBe(true);
    expect(h.logs.some((l) => l.includes('not filed in the Library'))).toBe(true);
    expect(h.logs.some((l) => l.includes('scene media not removed: storage 500'))).toBe(true);
    const thrower = harness({ file: () => new Error('boom') });
    thrower.store.add(makeJob(), makeScenes(13));
    await runUntilTerminal(thrower);
    expect(thrower.store.job().status).toBe('done');
    expect(thrower.removed).toHaveLength(1);
  });

  test('a failed or canceled film keeps its delivered clips (they are the user\'s) and is not filed', async () => {
    const failed = harness({ stitch: () => ({ ok: false, reason: 'needs_resumable_upload', retryable: false }) });
    failed.store.add(makeJob(), makeScenes(13));
    await runUntilTerminal(failed);
    expect(failed.store.job().status).toBe('failed');
    const canceled = harness();
    canceled.store.add(makeJob(), makeScenes(13));
    for (let i = 0; i < 3; i++) { canceled.clock.t += MIN; await runLongformTick(canceled.deps, OPTS); }
    canceled.store.job().cancelRequested = true;
    await runUntilTerminal(canceled);
    expect(canceled.store.job().status).toBe('canceled');
    for (const h of [failed, canceled]) {
      expect(h.filed).toEqual([]);
      expect(h.removed).toEqual([]);
    }
  });

  test('the queue runs without a finisher (it is optional in deps)', async () => {
    const h = harness({ noFinisher: true });
    h.store.add(makeJob(), makeScenes(13));
    await runUntilTerminal(h);
    expect(h.store.job().status).toBe('done');
  });
});

describe('a `directing` job (the create route is still writing it)', () => {
  test('is not claimed before its deadline; after it, it is failed with nothing charged, submitted or refunded', async () => {
    const h = harness();
    h.store.add(makeJob({ status: 'directing', deadlineAt: T0 + 10 * MIN }), makeScenes(13));
    h.clock.t += MIN;
    expect(await runLongformTick(h.deps, OPTS)).toMatchObject({ jobs: 0 });
    h.clock.t = T0 + 11 * MIN;
    expect(await runLongformTick(h.deps, OPTS)).toMatchObject({ jobs: 1, reserved: 0, submitted: 0, refunded: 0 });
    expect(h.store.job()).toMatchObject({ status: 'failed', errorCode: 'directing_abandoned' });
    expect(h.store.scenes.get('j1')!.every((s) => s.status === 'failed')).toBe(true);
    expect(h.debits).toEqual([]);
    expect(h.submits).toEqual([]);
    expect(h.refunds).toEqual([]);
    // Terminal now: never claimed again.
    h.clock.t += MIN;
    expect(await runLongformTick(h.deps, OPTS)).toMatchObject({ jobs: 0 });
  });
});
