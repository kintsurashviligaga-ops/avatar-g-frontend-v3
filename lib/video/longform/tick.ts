/**
 * lib/video/longform/tick.ts — one cron tick of the long-form queue: lease jobs, apply the state machine, persist.
 *
 * Everything with a side effect is INJECTED (store, Veo engine, billing, stitcher, clock), so the whole tick is
 * unit-testable with in-memory fakes and the route stays a thin wrapper. runtime.ts wires the real implementations
 * (Supabase, lib/veo/engine, lib/orchestrator/ledger, ffmpeg-static).
 *
 * Per leased job, in this order:
 *   1. settle  — cancel / deadline / start / early abort / stitch decision; abandoned scenes persisted; refunds.
 *   2. work    — fail stale claims and timed-out renders → reserve the next act (debit) → extract seed frames →
 *                claim + submit due scenes (one claim per submit, so a tick that runs out of time strands nothing) →
 *                poll in-flight scenes (poll + delivery to our storage happen inside engine.poll).
 *   3. settle  — again, so a film whose last scene landed this tick moves to stitching (and stitches) now.
 *
 * ⚠️ A submit that THROWS is treated as `ambiguous` (the request may have reached Google and billed): the scene
 * fails and is refunded, never re-submitted — the same rule the engine's own outcome classification follows.
 * ⚠️ Persisted state is always the state machine's output: the tick writes diffState(prev, next), never a field it
 * computed on the side, so the row and the rules cannot drift apart.
 */
import type { CreateVeoClipInput } from '@/lib/veo/engine';
import type { OutputFormat, VeoResolution, VeoTier, VeoTransport } from '@/lib/veo/types';
import { buildSceneClipInput, type LongformBible, type LongformScene } from './director';
import {
  applyJobEvent,
  applySceneEvent,
  classifySubmit,
  DEFAULT_MACHINE_CONFIG,
  diffState,
  isTerminalJob,
  planWork,
  pollEvent,
  refundableScenes,
  settle,
  type HoldReason,
  type JobEvent,
  type JobState,
  type MachineConfig,
  type SceneEvent,
  type ScenePollReport,
  type SceneState,
  type SubmitReport,
} from './stateMachine';

// ── Records + deps ───────────────────────────────────────────────────────────────────────────────────────────

export interface LongformJobOptions {
  negativePrompt?: string;
  /** ≤ 3 identity references (https). When present, act chaining is off (Veo: references exclude a first frame). */
  referenceImageUrls?: string[];
  musicUrl?: string;
  musicDurationSec?: number;
}

export interface LongformJobRecord extends JobState {
  id: string;
  userId: string;
  sceneCount: number;
  tier: VeoTier;
  format: OutputFormat;
  resolution: VeoResolution;
  generateAudio: boolean;
  bible: LongformBible;
  options: LongformJobOptions;
  seed: number | null;
  creditsPerScene: number;
  refundsPending: boolean;
}

export interface LongformSceneRecord extends SceneState {
  /** The director's scene; only `shot` is needed to render. */
  spec: Pick<LongformScene, 'shot'> & Partial<LongformScene>;
  outputBytes: number | null;
}

/** Extra row fields the tick writes alongside a state transition. */
export interface SceneExtras {
  transport?: VeoTransport | null;
  model?: string | null;
  outputBytes?: number | null;
  outputPath?: string | null;
  deliveredAt?: number | null;
}
export type ScenePatch = Partial<SceneState> & SceneExtras;

export interface JobExtras {
  refundsPending?: boolean;
  outputPath?: string | null;
  outputBytes?: number | null;
  completedAt?: number | null;
  errorDetail?: string | null;
}
export type JobPatch = Partial<JobState> & JobExtras;

export interface LongformStore {
  /** Lease up to `limit` claimable jobs for `leaseSec` (claim_longform_jobs). */
  claimJobs(limit: number, leaseSec: number): Promise<LongformJobRecord[]>;
  loadScenes(jobId: string): Promise<LongformSceneRecord[]>;
  /** Atomically queued → submitted (claim_longform_scenes). Returns what was actually claimed. */
  claimScenes(jobId: string, ordinals: number[]): Promise<Array<{ ordinal: number; attempts: number; submittedAt: number }>>;
  patchScene(jobId: string, ordinal: number, patch: ScenePatch): Promise<void>;
  patchJob(jobId: string, patch: JobPatch): Promise<void>;
  releaseJob(jobId: string): Promise<void>;
}

export interface SubmitResult {
  report: SubmitReport;
  transport?: VeoTransport | null;
  model?: string | null;
}

export type PollResult = ScenePollReport & { bytes?: number | null; path?: string | null };

export interface LongformEngine {
  /** createVeoClip inside the platform budget guard. Must not retry; may throw (→ treated as ambiguous). */
  submit(input: CreateVeoClipInput, ctx: { userId: string; jobId: string; ordinal: number }): Promise<SubmitResult>;
  /** pollVeoClip + host a finished clip in our storage. */
  poll(operation: string, ctx: { userId: string; jobId: string; ordinal: number }): Promise<PollResult>;
  /** The last frame of a delivered clip, hosted; null when it cannot be produced (the dependency is then dropped). */
  extractLastFrame(clipUrl: string, ctx: { jobId: string; ordinal: number }): Promise<string | null>;
}

export type ReserveOutcome = 'ok' | 'insufficient' | 'unavailable';

export interface LongformBilling {
  /** Debit `credits` under `ref` (idempotent on ref). */
  reserveAct(userId: string, ref: string, credits: number): Promise<ReserveOutcome>;
  /** Give back one scene's share of an act debit, under its own idempotent ref, capped by the ledger. */
  refundScene(userId: string, chargeRef: string, credits: number, refundRef: string): Promise<boolean>;
}

export type StitchOutcome =
  | { ok: true; url: string; path?: string | null; bytes?: number | null }
  | { ok: false; reason: string; retryable: boolean };

export interface LongformStitcher {
  stitch(job: LongformJobRecord, clips: Array<{ ordinal: number; url: string; bytes: number | null }>, budgetMs: number): Promise<StitchOutcome>;
}

export interface LongformTickDeps {
  store: LongformStore;
  engine: LongformEngine;
  billing: LongformBilling;
  stitcher: LongformStitcher;
  now: () => number;
  log?: (line: string) => void;
}

export interface LongformTickOptions {
  maxJobs?: number;
  leaseSec?: number;
  /** Wall-clock budget for the whole tick; keep it under the function's maxDuration. */
  timeBudgetMs?: number;
  /** A stitch is only started with at least this much budget left (it is the long step). */
  minStitchBudgetMs?: number;
  config?: MachineConfig;
}

export interface TickReport {
  jobs: number;
  submitted: number;
  polled: number;
  delivered: number;
  failedScenes: number;
  reserved: number;
  holds: number;
  refunded: number;
  refundMisses: number;
  stitched: number;
  stitchDeferred: number;
  timeBudgetExhausted: boolean;
  errors: number;
}

// ── Refs ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The act reservation's ledger ref — one debit per act, idempotent on this ref. */
export const actChargeRef = (jobId: string, act: number): string => `longform:${jobId}:act:${act}`;
/**
 * A scene's refund ref. ⚠️ It MUST start with `${chargeRef}:` — ledger.netDebitedForRef counts credit-backs under that
 * prefix, so the sum of an act's scene refunds can never exceed what the act debit took.
 */
export const sceneRefundRef = (chargeRef: string, ordinal: number): string => `${chargeRef}:s${ordinal}:refund`;

// ── The tick ─────────────────────────────────────────────────────────────────────────────────────────────────

const DEFAULTS = { maxJobs: 5, leaseSec: 120, timeBudgetMs: 50_000, minStitchBudgetMs: 120_000 } as const;

const sceneState = (s: LongformSceneRecord): SceneState => ({
  ordinal: s.ordinal, act: s.act, status: s.status, attempts: s.attempts, operation: s.operation,
  nextAttemptAt: s.nextAttemptAt, submittedAt: s.submittedAt, dependsOn: s.dependsOn, seedFrameUrl: s.seedFrameUrl,
  chargeRef: s.chargeRef, chargeCredits: s.chargeCredits, refunded: s.refunded, outputUrl: s.outputUrl, error: s.error,
});
const jobState = (j: LongformJobRecord | JobState): JobState => ({
  status: j.status, cancelRequested: j.cancelRequested, holdUntil: j.holdUntil, holdReason: j.holdReason,
  stitchAttempts: j.stitchAttempts, deadlineAt: j.deadlineAt, errorCode: j.errorCode, outputUrl: j.outputUrl,
});

export function emptyReport(): TickReport {
  return { jobs: 0, submitted: 0, polled: 0, delivered: 0, failedScenes: 0, reserved: 0, holds: 0, refunded: 0, refundMisses: 0, stitched: 0, stitchDeferred: 0, timeBudgetExhausted: false, errors: 0 };
}

/** Advance every claimable job one step. Never throws; per-job errors are counted and the lease released. */
export async function runLongformTick(deps: LongformTickDeps, opts: LongformTickOptions = {}): Promise<TickReport> {
  const cfg = opts.config ?? DEFAULT_MACHINE_CONFIG;
  const started = deps.now();
  const budget = opts.timeBudgetMs ?? DEFAULTS.timeBudgetMs;
  const timeLeft = () => budget - (deps.now() - started);
  const report = emptyReport();
  const log = deps.log ?? (() => undefined);

  let jobs: LongformJobRecord[];
  try {
    jobs = await deps.store.claimJobs(opts.maxJobs ?? DEFAULTS.maxJobs, opts.leaseSec ?? DEFAULTS.leaseSec);
  } catch (e) {
    report.errors++;
    log(`[longform] claimJobs failed: ${e instanceof Error ? e.message : String(e)}`);
    return report;
  }

  for (const job of jobs) {
    if (timeLeft() <= 0) {
      report.timeBudgetExhausted = true;
      try {
        await deps.store.releaseJob(job.id);
      } catch {
        /* the lease expires on its own */
      }
      continue;
    }
    report.jobs++;
    try {
      await processJob(job, deps, cfg, report, timeLeft, opts.minStitchBudgetMs ?? DEFAULTS.minStitchBudgetMs);
    } catch (e) {
      report.errors++;
      log(`[longform] job ${job.id} failed this tick: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      try {
        await deps.store.releaseJob(job.id);
      } catch {
        /* the lease expires on its own */
      }
    }
  }
  return report;
}

async function processJob(
  job: LongformJobRecord,
  deps: LongformTickDeps,
  cfg: MachineConfig,
  report: TickReport,
  timeLeft: () => number,
  minStitchBudgetMs: number,
): Promise<void> {
  const { store, engine, billing, stitcher, now } = deps;
  const log = deps.log ?? (() => undefined);
  const records = new Map((await store.loadScenes(job.id)).map((s) => [s.ordinal, s]));
  let j: JobState = jobState(job);
  let refundsPending = job.refundsPending;

  const states = (): SceneState[] => [...records.values()].sort((a, b) => a.ordinal - b.ordinal).map(sceneState);

  /** Apply one event through the machine; persist exactly the diff (plus extras). False when refused. */
  const applyScene = async (ordinal: number, event: SceneEvent, extras: SceneExtras = {}, persist = true): Promise<boolean> => {
    const cur = records.get(ordinal);
    if (!cur) return false;
    const t = applySceneEvent(sceneState(cur), event, cfg);
    if (!t.ok) {
      log(`[longform] job ${job.id} scene ${ordinal}: ${t.reason}`);
      return false;
    }
    const patch: ScenePatch = { ...diffState(sceneState(cur), t.scene), ...extras };
    if (persist && Object.keys(patch).length) await store.patchScene(job.id, ordinal, patch);
    records.set(ordinal, { ...cur, ...t.scene, ...(extras.outputBytes !== undefined ? { outputBytes: extras.outputBytes } : {}) });
    if (t.scene.status === 'failed' && cur.status !== 'failed') report.failedScenes++;
    return true;
  };

  const setJob = async (next: JobState, extras: JobExtras = {}): Promise<void> => {
    const patch: JobPatch = { ...diffState(j, next), ...extras };
    if (isTerminalJob(next.status) && !isTerminalJob(j.status)) patch.completedAt = now();
    if (Object.keys(patch).length) await store.patchJob(job.id, patch);
    j = next;
  };

  const jobEvent = async (event: JobEvent, extras: JobExtras = {}): Promise<boolean> => {
    const t = applyJobEvent(j, event);
    if (!t.ok) {
      log(`[longform] job ${job.id}: ${t.reason}`);
      return false;
    }
    await setJob(t.job, extras);
    return true;
  };

  const hold = async (reason: HoldReason): Promise<void> => {
    if (await jobEvent({ type: 'hold', reason, until: now() + cfg.holdMs[reason] })) report.holds++;
  };

  const runRefunds = async (): Promise<void> => {
    let misses = 0;
    for (const ordinal of refundableScenes(j, states())) {
      const s = records.get(ordinal);
      if (!s?.chargeRef) continue;
      const ok = await billing.refundScene(job.userId, s.chargeRef, s.chargeCredits, sceneRefundRef(s.chargeRef, ordinal)).catch(() => false);
      if (ok && (await applyScene(ordinal, { type: 'refunded' }))) report.refunded++;
      else {
        misses++;
        report.refundMisses++;
      }
    }
    // ⚠️ A missed refund keeps the job claimable after it is terminal, so a later tick retries it (idempotent refs).
    const pending = misses > 0;
    if (pending !== refundsPending) {
      await store.patchJob(job.id, { refundsPending: pending });
      refundsPending = pending;
    }
  };

  const doSettle = async (): Promise<void> => {
    const s = settle(j, states(), now(), cfg);
    for (const ordinal of s.changed) {
      const next = s.scenes.find((x) => x.ordinal === ordinal);
      const cur = records.get(ordinal);
      if (!next || !cur) continue;
      const patch = diffState(sceneState(cur), next);
      if (Object.keys(patch).length) await store.patchScene(job.id, ordinal, patch);
      if (next.status === 'failed' && cur.status !== 'failed') report.failedScenes++;
      records.set(ordinal, { ...cur, ...next });
    }
    await setJob(s.job);

    if (s.stitch) {
      if (timeLeft() < minStitchBudgetMs) {
        report.stitchDeferred++;
        log(`[longform] job ${job.id}: stitch deferred — ${Math.max(0, Math.round(timeLeft() / 1000))} s left of the tick budget`);
      } else {
        const clips = [...records.values()]
          .filter((c) => c.status === 'delivered' && c.outputUrl)
          .sort((a, b) => a.ordinal - b.ordinal)
          .map((c) => ({ ordinal: c.ordinal, url: c.outputUrl as string, bytes: c.outputBytes }));
        const out = await stitcher.stitch(job, clips, timeLeft()).catch((e: unknown): StitchOutcome => ({ ok: false, reason: e instanceof Error ? e.message : 'stitch threw', retryable: true }));
        if (out.ok) {
          if (await jobEvent({ type: 'stitch_ok', url: out.url }, { outputPath: out.path ?? null, outputBytes: out.bytes ?? null })) report.stitched++;
        } else if (out.retryable) {
          await jobEvent({ type: 'stitch_failed' }, { errorDetail: out.reason.slice(0, 500) });
          // The attempt bound turns a repeatedly failing stitch into a terminal failure on the spot.
          if (j.status === 'stitching' && j.stitchAttempts >= cfg.maxStitchAttempts) await jobEvent({ type: 'fail', code: 'stitch_failed' });
        } else {
          await jobEvent({ type: 'fail', code: 'stitch_failed' }, { errorDetail: out.reason.slice(0, 500) });
        }
      }
    }
    await runRefunds();
  };

  // 1. Settle.
  await doSettle();
  if (j.status !== 'rendering') return;

  // 2. Work.
  const first = planWork(j, states(), now(), cfg);
  for (const f of first.fail) await applyScene(f.ordinal, { type: f.event });

  if (first.reserveAct !== null) {
    const act = first.reserveAct;
    const ref = actChargeRef(job.id, act);
    const due = [...records.values()].filter((s) => s.act === act && s.status === 'queued' && s.chargeRef === null);
    const credits = Math.max(0, Math.round(job.creditsPerScene)) * due.length;
    const outcome = await billing.reserveAct(job.userId, ref, credits).catch((): ReserveOutcome => 'unavailable');
    if (outcome === 'ok') {
      report.reserved++;
      for (const s of due) await applyScene(s.ordinal, { type: 'charged', ref, credits: Math.max(0, Math.round(job.creditsPerScene)) });
    } else {
      await hold(outcome === 'insufficient' ? 'insufficient_credits' : 'billing_unavailable');
    }
  }

  for (const sf of first.seedFrames) {
    if (timeLeft() <= 0) break;
    const dep = records.get(sf.fromOrdinal);
    const url = dep?.outputUrl ? await engine.extractLastFrame(dep.outputUrl, { jobId: job.id, ordinal: sf.ordinal }).catch(() => null) : null;
    await applyScene(sf.ordinal, { type: 'seed_frame', url });
  }

  // Re-plan: a reservation or a seed frame from just now may have unblocked scenes.
  const submitList = planWork(j, states(), now(), cfg).submit;
  for (const ordinal of submitList) {
    if (timeLeft() <= 0) {
      report.timeBudgetExhausted = true;
      break;
    }
    if (j.holdUntil !== null && now() < j.holdUntil) break;
    const claimed = (await store.claimScenes(job.id, [ordinal])).find((c) => c.ordinal === ordinal);
    if (!claimed) continue; // another tick has it, or it is not due after all
    // The DB already wrote the claim; mirror it in memory without writing it again.
    await applyScene(ordinal, { type: 'claimed', at: claimed.submittedAt }, {}, false);
    const rec = records.get(ordinal);
    if (!rec) continue;

    const input = buildSceneClipInput(
      { ordinal, shot: rec.spec.shot },
      {
        jobId: job.id, bible: job.bible, tier: job.tier, format: job.format, resolution: job.resolution,
        generateAudio: job.generateAudio, seed: job.seed, negativePrompt: job.options.negativePrompt ?? null,
        startImageUrl: rec.seedFrameUrl, referenceImageUrls: job.options.referenceImageUrls ?? [],
      },
    );
    let result: SubmitResult;
    try {
      result = await engine.submit(input, { userId: job.userId, jobId: job.id, ordinal });
    } catch {
      result = { report: { kind: 'outcome', outcome: { ok: false, reason: 'ambiguous', retryable: false, detail: 'submit threw' } } };
    }
    const verdict = classifySubmit(result.report);
    const at = now();
    if (verdict.kind === 'ok') {
      if (await applyScene(ordinal, { type: 'submit_ok', operation: verdict.operation, at }, { transport: result.transport ?? null, model: result.model ?? null })) report.submitted++;
    } else if (verdict.kind === 'retry') {
      await applyScene(ordinal, { type: 'submit_retry', reason: verdict.reason, at });
    } else if (verdict.kind === 'hold') {
      const until = at + cfg.holdMs[verdict.reason];
      await applyScene(ordinal, { type: 'submit_hold', until });
      await hold(verdict.reason);
      break; // platform-wide: every other submit this tick would be refused the same way
    } else {
      await applyScene(ordinal, { type: 'submit_failed', reason: verdict.reason });
    }
  }

  for (const ordinal of first.poll) {
    if (timeLeft() <= 0) {
      report.timeBudgetExhausted = true;
      break;
    }
    const rec = records.get(ordinal);
    if (!rec?.operation || rec.status !== 'rendering') continue;
    const r = await engine.poll(rec.operation, { userId: job.userId, jobId: job.id, ordinal }).catch((): PollResult => ({ state: 'processing' }));
    report.polled++;
    const at = now();
    const event = pollEvent(r, at);
    const extras: SceneExtras = event.type === 'poll_delivered' ? { outputBytes: r.bytes ?? null, outputPath: r.path ?? null, deliveredAt: at } : {};
    if ((await applyScene(ordinal, event, extras)) && event.type === 'poll_delivered') report.delivered++;
  }

  // 3. Settle again.
  await doSettle();
}
