/** @jest-environment node */
/**
 * tick.ts with an in-memory store, a scripted Veo engine, a fake ledger and a fake stitcher — no database, no
 * provider, no ffmpeg. Rules under test: a whole film driven tick by tick (act-by-act debits, the concurrency cap,
 * one submit per scene, the act-2 opener rendered from act 1's last frame, the stitch, completedAt); a thrown submit
 * is ambiguous (failed + refunded, never re-submitted); the budget guard and a provider quota HOLD the job; an
 * unaffordable act holds and then fails at the deadline with nothing charged; cancel; a missed refund is retried on a
 * later tick; stitch failures (retryable, final, deferred for time); the tick budget; and per-job error isolation.
 */
import type { CreateVeoClipInput } from '@/lib/veo/engine';
import { coerceBible, type LongformBible } from './director';
import { DEFAULT_MACHINE_CONFIG, type SceneState } from './stateMachine';
import {
  actChargeRef,
  runLongformTick,
  sceneRefundRef,
  type JobPatch,
  type LongformJobRecord,
  type LongformSceneRecord,
  type LongformStore,
  type LongformTickDeps,
  type PollResult,
  type ReserveOutcome,
  type ScenePatch,
  type StitchOutcome,
  type SubmitResult,
} from './tick';

const MIN = 60_000;
const T0 = 1_800_000_000_000;
const BIBLE = coerceBible({
  characters: [{ id: 'ana', name: 'Ana', description: 'a woman in a red coat' }],
  look: { colorGrade: 'neutral', negativePrompt: 'crowds' },
  arc: [{ summary: 'one' }, { summary: 'two' }],
}, 2) as LongformBible;

const shot = (ordinal: number) => ({
  ordinal, subject: 'a woman in a red coat', action: `does beat ${ordinal}`,
  camera: { move: 'static' as const, intensity: 5, shot: 'medium' as const, angle: 'eye_level' as const, lens: 'auto' as const },
  audio: { dialogue: [] }, hasStartImage: false, transitionOut: 'cut' as const,
});

function makeJob(o: Partial<LongformJobRecord> = {}): LongformJobRecord {
  return {
    id: 'j1', userId: 'u1', status: 'planned', cancelRequested: false, holdUntil: null, holdReason: null, stitchAttempts: 0,
    deadlineAt: T0 + 24 * 60 * MIN, errorCode: null, outputUrl: null, sceneCount: 13, tier: 'fast', format: '16:9',
    resolution: '1080p', generateAudio: true, bible: BIBLE, options: {}, seed: 77, creditsPerScene: 39, refundsPending: false, ...o,
  };
}
function makeScenes(n: number, firstOfAct2 = 7, o: (i: number) => Partial<LongformSceneRecord> = () => ({})): LongformSceneRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    ordinal: i, act: i < firstOfAct2 ? 0 : 1, status: 'queued', attempts: 0, operation: null, nextAttemptAt: null, submittedAt: null,
    dependsOn: i === firstOfAct2 ? firstOfAct2 - 1 : null, seedFrameUrl: null, chargeRef: null, chargeCredits: 0, refunded: false,
    outputUrl: null, error: null, spec: { shot: shot(i) }, outputBytes: null, ...o(i),
  }));
}

/** An in-memory store with the same semantics as the two claim functions. */
class MemoryStore implements LongformStore {
  jobs = new Map<string, LongformJobRecord & { leaseUntil: number | null }>();
  scenes = new Map<string, LongformSceneRecord[]>();
  jobPatches: JobPatch[] = [];
  scenePatches: Array<{ ordinal: number; patch: ScenePatch }> = [];
  claimCalls = 0;
  constructor(private clock: () => number) {}
  add(job: LongformJobRecord, scenes: LongformSceneRecord[]) {
    this.jobs.set(job.id, { ...job, leaseUntil: null });
    this.scenes.set(job.id, scenes.map((s) => ({ ...s })));
  }
  async claimJobs(limit: number, leaseSec: number) {
    const now = this.clock();
    const out = [...this.jobs.values()]
      .filter((j) => (['planned', 'rendering', 'stitching'].includes(j.status) || j.refundsPending) && (j.leaseUntil === null || j.leaseUntil < now))
      .slice(0, limit);
    out.forEach((j) => { j.leaseUntil = now + leaseSec * 1000; });
    return out.map(({ leaseUntil: _l, ...j }) => ({ ...j }));
  }
  async loadScenes(jobId: string) {
    return (this.scenes.get(jobId) ?? []).map((s) => ({ ...s }));
  }
  async claimScenes(jobId: string, ordinals: number[]) {
    this.claimCalls++;
    const now = this.clock();
    const out: Array<{ ordinal: number; attempts: number; submittedAt: number }> = [];
    for (const s of this.scenes.get(jobId) ?? []) {
      if (!ordinals.includes(s.ordinal) || s.status !== 'queued' || !s.chargeRef || (s.nextAttemptAt ?? 0) > now) continue;
      Object.assign(s, { status: 'submitted', attempts: s.attempts + 1, operation: null, submittedAt: now, nextAttemptAt: null, error: null });
      out.push({ ordinal: s.ordinal, attempts: s.attempts, submittedAt: now });
    }
    return out;
  }
  async patchScene(jobId: string, ordinal: number, patch: ScenePatch) {
    this.scenePatches.push({ ordinal, patch });
    const s = (this.scenes.get(jobId) ?? []).find((x) => x.ordinal === ordinal);
    if (s) Object.assign(s, patch);
  }
  async patchJob(jobId: string, patch: JobPatch) {
    this.jobPatches.push(patch);
    const j = this.jobs.get(jobId);
    if (j) Object.assign(j, patch);
  }
  async releaseJob(jobId: string) {
    const j = this.jobs.get(jobId);
    if (j) j.leaseUntil = null;
  }
  job(id = 'j1') { return this.jobs.get(id)!; }
  scene(o: number, id = 'j1') { return this.scenes.get(id)!.find((s) => s.ordinal === o)!; }
}

interface Harness {
  deps: LongformTickDeps;
  store: MemoryStore;
  clock: { t: number };
  submits: Array<{ ordinal: number; input: CreateVeoClipInput }>;
  debits: Array<{ ref: string; credits: number }>;
  refunds: Array<{ ref: string; credits: number; chargeRef: string }>;
  stitchCalls: Array<{ ordinals: number[]; budgetMs: number }>;
  logs: string[];
}

function harness(o: {
  submit?: (ordinal: number, n: number) => SubmitResult | Error;
  poll?: (ordinal: number, n: number) => PollResult;
  reserve?: (ref: string) => ReserveOutcome;
  refund?: (refundRef: string, attempt: number) => boolean;
  stitch?: (n: number) => StitchOutcome;
  frame?: (url: string) => string | null;
  tickCost?: number;
} = {}): Harness {
  const clock = { t: T0 };
  const store = new MemoryStore(() => clock.t);
  const submits: Harness['submits'] = [];
  const debits: Harness['debits'] = [];
  const refunds: Harness['refunds'] = [];
  const stitchCalls: Harness['stitchCalls'] = [];
  const logs: string[] = [];
  const submitN = new Map<number, number>();
  const pollN = new Map<string, number>();
  const refundTries = new Map<string, number>();
  let stitchN = 0;
  const deps: LongformTickDeps = {
    store,
    now: () => clock.t,
    log: (l) => logs.push(l),
    engine: {
      async submit(input, ctx) {
        const n = (submitN.get(ctx.ordinal) ?? 0) + 1;
        submitN.set(ctx.ordinal, n);
        submits.push({ ordinal: ctx.ordinal, input });
        const r = o.submit?.(ctx.ordinal, n) ?? { report: { kind: 'outcome', outcome: { ok: true, operation: { transport: 'gemini', name: `models/veo/operations/${ctx.ordinal}-${n}`, model: 'veo-3.1-fast-generate-preview' } } }, transport: 'gemini', model: 'veo-3.1-fast-generate-preview' } as SubmitResult;
        if (r instanceof Error) throw r;
        return r;
      },
      async poll(operation, ctx) {
        const n = (pollN.get(operation) ?? 0) + 1;
        pollN.set(operation, n);
        return o.poll?.(ctx.ordinal, n) ?? (n >= 2 ? { state: 'delivered', url: `https://cdn/${ctx.ordinal}.mp4`, bytes: 4_000_000, path: `longform/j1/${ctx.ordinal}.mp4` } : { state: 'processing' });
      },
      async extractLastFrame(url) {
        return o.frame ? o.frame(url) : url.replace('.mp4', '-last.jpg');
      },
    },
    billing: {
      async reserveAct(_u, ref, credits) {
        const r = o.reserve?.(ref) ?? 'ok';
        if (r === 'ok') debits.push({ ref, credits });
        return r;
      },
      async refundScene(_u, chargeRef, credits, refundRef) {
        const attempt = (refundTries.get(refundRef) ?? 0) + 1;
        refundTries.set(refundRef, attempt);
        const ok = o.refund?.(refundRef, attempt) ?? true;
        if (ok) refunds.push({ ref: refundRef, credits, chargeRef });
        return ok;
      },
    },
    stitcher: {
      async stitch(_job, clips, budgetMs) {
        stitchN++;
        stitchCalls.push({ ordinals: clips.map((c) => c.ordinal), budgetMs });
        return o.stitch?.(stitchN) ?? { ok: true, url: 'https://cdn/film.mp4', path: 'longform/j1/film.mp4', bytes: 40_000_000 };
      },
    },
  };
  return { deps, store, clock, submits, debits, refunds, stitchCalls, logs };
}

const OPTS = { timeBudgetMs: 10 * MIN, minStitchBudgetMs: 0 };

async function runUntilTerminal(h: Harness, maxTicks = 60) {
  const reports = [];
  for (let i = 0; i < maxTicks; i++) {
    h.clock.t += MIN;
    reports.push(await runLongformTick(h.deps, OPTS));
    const inFlight = h.store.scenes.get('j1')!.filter((s) => s.status === 'submitted' || s.status === 'rendering').length;
    expect(inFlight).toBeLessThanOrEqual(DEFAULT_MACHINE_CONFIG.maxConcurrentPerJob);
    if (['done', 'failed', 'canceled'].includes(h.store.job().status) && !h.store.job().refundsPending) break;
  }
  return reports;
}

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
