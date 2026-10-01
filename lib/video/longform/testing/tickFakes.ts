/**
 * lib/video/longform/testing/tickFakes.ts — TEST-ONLY fakes for the long-form tick: an in-memory store with the two
 * claim functions' semantics, a scripted Veo engine, a fake ledger, a fake stitcher and a fake finisher. Shared by
 * tick.test.ts and the route end-to-end test (app/api/video/longform/e2e.test.ts). Imported by no production code.
 */
import type { CreateVeoClipInput } from '@/lib/veo/engine';
import { coerceBible, type LongformBible } from '../director';
import {
  runLongformTick,
  type FinishedFilm,
  type JobPatch,
  type LongformJobRecord,
  type LongformSceneRecord,
  type LongformStore,
  type LongformTickDeps,
  type LongformTickOptions,
  type PollResult,
  type ReserveOutcome,
  type ScenePatch,
  type StitchOutcome,
  type SubmitResult,
  type TickReport,
} from '../tick';

export const MIN = 60_000;
export const T0 = 1_800_000_000_000;

export const FAKE_BIBLE = coerceBible({
  characters: [{ id: 'ana', name: 'Ana', description: 'a woman in a red coat' }],
  look: { colorGrade: 'neutral', negativePrompt: 'crowds' },
  arc: [{ summary: 'one' }, { summary: 'two' }],
}, 2) as LongformBible;

export const fakeShot = (ordinal: number) => ({
  ordinal, subject: 'a woman in a red coat', action: `does beat ${ordinal}`,
  camera: { move: 'static' as const, intensity: 5, shot: 'medium' as const, angle: 'eye_level' as const, lens: 'auto' as const },
  audio: { dialogue: [] }, hasStartImage: false, transitionOut: 'cut' as const,
});

export function makeJob(o: Partial<LongformJobRecord> = {}): LongformJobRecord {
  return {
    id: 'j1', userId: 'u1', status: 'planned', cancelRequested: false, holdUntil: null, holdReason: null, stitchAttempts: 0,
    deadlineAt: T0 + 24 * 60 * MIN, errorCode: null, outputUrl: null, sceneCount: 13, tier: 'fast', format: '16:9',
    resolution: '1080p', generateAudio: true, bible: FAKE_BIBLE, options: {}, seed: 77, creditsPerScene: 39, refundsPending: false, ...o,
  };
}

export function makeScenes(n: number, firstOfAct2 = 7, o: (i: number) => Partial<LongformSceneRecord> = () => ({})): LongformSceneRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    ordinal: i, act: i < firstOfAct2 ? 0 : 1, status: 'queued', attempts: 0, operation: null, nextAttemptAt: null, submittedAt: null,
    dependsOn: i === firstOfAct2 ? firstOfAct2 - 1 : null, seedFrameUrl: null, chargeRef: null, chargeCredits: 0, refunded: false,
    outputUrl: null, error: null, spec: { shot: fakeShot(i) }, outputBytes: null, ...o(i),
  }));
}

/** An in-memory store with the same semantics as the two claim functions (migration 20261001b). */
export class MemoryStore implements LongformStore {
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
    const claimable = (j: LongformJobRecord) =>
      ['planned', 'rendering', 'stitching'].includes(j.status) || j.refundsPending || (j.status === 'directing' && j.deadlineAt < now);
    const out = [...this.jobs.values()].filter((j) => claimable(j) && (j.leaseUntil === null || j.leaseUntil < now)).slice(0, limit);
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

export interface Harness {
  deps: LongformTickDeps;
  store: MemoryStore;
  clock: { t: number };
  submits: Array<{ ordinal: number; input: CreateVeoClipInput }>;
  debits: Array<{ ref: string; credits: number }>;
  refunds: Array<{ ref: string; credits: number; chargeRef: string }>;
  stitchCalls: Array<{ ordinals: number[]; budgetMs: number }>;
  filed: Array<{ jobId: string; userId: string; film: FinishedFilm }>;
  removed: Array<{ jobId: string; clipPaths: string[]; seedOrdinals: number[]; filmPath: string | null }>;
  logs: string[];
}

export interface HarnessOptions {
  submit?: (ordinal: number, n: number) => SubmitResult | Error;
  poll?: (ordinal: number, n: number) => PollResult;
  reserve?: (ref: string) => ReserveOutcome;
  refund?: (refundRef: string, attempt: number) => boolean;
  stitch?: (n: number) => StitchOutcome;
  frame?: (url: string) => string | null;
  /** Library filing: true (default) lands; false misses; an Error throws. */
  file?: () => boolean | Error;
  /** Scene-media removal: undefined (default) succeeds; an Error throws. */
  remove?: () => Error | undefined;
  /** Leave deps.finisher out entirely (the queue must run without one). */
  noFinisher?: boolean;
  start?: number;
}

export function harness(o: HarnessOptions = {}): Harness {
  const clock = { t: o.start ?? T0 };
  const store = new MemoryStore(() => clock.t);
  const submits: Harness['submits'] = [];
  const debits: Harness['debits'] = [];
  const refunds: Harness['refunds'] = [];
  const stitchCalls: Harness['stitchCalls'] = [];
  const filed: Harness['filed'] = [];
  const removed: Harness['removed'] = [];
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
        const r = o.submit?.(ctx.ordinal, n) ?? { report: { kind: 'outcome', outcome: { ok: true, operation: { transport: 'gemini', name: `models/veo/operations/${ctx.jobId}-${ctx.ordinal}-${n}`, model: 'veo-3.1-fast-generate-preview' } } }, transport: 'gemini', model: 'veo-3.1-fast-generate-preview' } as SubmitResult;
        if (r instanceof Error) throw r;
        return r;
      },
      async poll(operation, ctx) {
        const n = (pollN.get(operation) ?? 0) + 1;
        pollN.set(operation, n);
        return o.poll?.(ctx.ordinal, n) ?? (n >= 2 ? { state: 'delivered', url: `https://cdn/${ctx.ordinal}.mp4`, bytes: 4_000_000, path: `longform/${ctx.jobId}/${ctx.ordinal}.mp4` } : { state: 'processing' });
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
      async stitch(job, clips, budgetMs) {
        stitchN++;
        stitchCalls.push({ ordinals: clips.map((c) => c.ordinal), budgetMs });
        return o.stitch?.(stitchN) ?? { ok: true, url: 'https://cdn/film.mp4', path: `longform/${job.id}/film.mp4`, bytes: 40_000_000 };
      },
    },
    ...(o.noFinisher
      ? {}
      : {
          finisher: {
            async fileFilm(job, film) {
              const r = o.file?.() ?? true;
              if (r instanceof Error) throw r;
              if (r) filed.push({ jobId: job.id, userId: job.userId, film });
              return r;
            },
            async removeSceneMedia(job, media) {
              const r = o.remove?.();
              if (r instanceof Error) throw r;
              removed.push({ jobId: job.id, ...media });
            },
          },
        }),
  };
  return { deps, store, clock, submits, debits, refunds, stitchCalls, filed, removed, logs };
}

export const TICK_OPTS: LongformTickOptions = { timeBudgetMs: 10 * MIN, minStitchBudgetMs: 0 };

/**
 * Tick once a (simulated) minute until the job is terminal with no refund owed, or maxTicks. `onTick` runs after
 * every tick (the tests assert invariants there — e.g. the concurrency cap).
 */
export async function runUntilTerminal(
  h: Harness,
  opts: { jobId?: string; maxTicks?: number; onTick?: (report: TickReport) => void } = {},
): Promise<TickReport[]> {
  const jobId = opts.jobId ?? 'j1';
  const reports: TickReport[] = [];
  for (let i = 0; i < (opts.maxTicks ?? 60); i++) {
    h.clock.t += MIN;
    const r = await runLongformTick(h.deps, TICK_OPTS);
    reports.push(r);
    opts.onTick?.(r);
    const job = h.store.job(jobId);
    if (['done', 'failed', 'canceled'].includes(job.status) && !job.refundsPending) break;
  }
  return reports;
}
