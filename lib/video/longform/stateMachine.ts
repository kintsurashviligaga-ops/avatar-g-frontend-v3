/**
 * lib/video/longform/stateMachine.ts — the long-form render queue's rules, as PURE functions.
 *
 *   job:   planned → rendering → stitching → done
 *                  ↘ failed     ↘ failed
 *          (any non-terminal) → canceled
 *   scene: queued → submitted → rendering → delivered
 *                 ↘ (provable rejection: back to queued, with backoff)   ↘ failed
 *
 * Why a state machine and a cron tick (the breakpoint this removes): today a film dispatches every clip inside ONE
 * 300 s request and the BROWSER polls every 4 s — a closed tab or a killed function strands the film, and 30 clips
 * do not fit in one request. Here every scene is a ROW; a short tick (app/api/cron/longform-tick) reads a job's
 * rows, asks these functions what to do, does it, and writes the result. Nothing lives in memory between ticks, so
 * a tick that dies loses nothing but its own in-flight call.
 *
 * Rules (each one unit-tested exhaustively in stateMachine.test.ts):
 *   • CONCURRENCY — at most maxConcurrentPerJob scenes in flight (submitted + rendering) per job; earliest first.
 *   • NEVER TWICE — a scene is claimed atomically (DB claim function) before its submit; an `ambiguous` submit (a
 *     timeout/5xx — a billed job MAY exist) and a claim whose tick died before recording the operation both FAIL
 *     the scene rather than re-submit it (docs/VEO_ENGINE.md §4, the same rule lib/agent/videoQueue keeps).
 *   • RETRY ONLY THE PROVABLE — a 429/503 rejection (nothing was created) and a Veo `failed` verdict (the job is
 *     definitively over) re-queue with exponential backoff, up to maxAttempts submits. Safety filtering is final.
 *   • HOLD, DON'T BURN — a platform-wide refusal (budget guard, provider quota/auth/config, insufficient credits for
 *     the next act, ledger down) puts the JOB on hold instead of failing scenes one by one; the deadline ends it.
 *   • RESERVE PER ACT — credits are debited one act at a time, just ahead of need (reserveAct); only scenes of a
 *     reserved act are submitted.
 *   • TERMINAL RULE — the job fails as soon as more than maxFailedFraction of its scenes have failed (no point
 *     spending on the rest); otherwise it stitches the delivered scenes once every scene is terminal.
 *   • REFUND MARKERS — a failed scene is refunded as soon as it fails; terminal jobs refund per refundableScenes().
 *   • ACT CHAINING — a scene with dependsOn waits for that scene's delivery, then for its last frame (seedFrames);
 *     a dependency that failed, or a frame that could not be extracted, releases it (fail-open: text continuity).
 */
import type { VeoCreateOutcome } from '@/lib/veo/types';

export type JobStatus = 'planned' | 'rendering' | 'stitching' | 'done' | 'failed' | 'canceled';
export type SceneStatus = 'queued' | 'submitted' | 'rendering' | 'delivered' | 'failed';
export type HoldReason = 'insufficient_credits' | 'billing_unavailable' | 'platform_budget' | 'provider_unavailable';

export const JOB_STATUSES: readonly JobStatus[] = ['planned', 'rendering', 'stitching', 'done', 'failed', 'canceled'];
export const SCENE_STATUSES: readonly SceneStatus[] = ['queued', 'submitted', 'rendering', 'delivered', 'failed'];

export const isTerminalJob = (s: JobStatus): boolean => s === 'done' || s === 'failed' || s === 'canceled';
export const isTerminalScene = (s: SceneStatus): boolean => s === 'delivered' || s === 'failed';
const inFlight = (s: SceneStatus): boolean => s === 'submitted' || s === 'rendering';

/** One scene row, as the machine sees it. Times are epoch milliseconds. */
export interface SceneState {
  ordinal: number;
  act: number;
  status: SceneStatus;
  /** Submits made (incremented by the claim). */
  attempts: number;
  operation: string | null;
  /** Not before this time: the next submit (queued) or the next poll (rendering). Null = now. */
  nextAttemptAt: number | null;
  /** When the current claim / submit happened. */
  submittedAt: number | null;
  /** The ordinal whose LAST FRAME seeds this scene (act chaining), or null. */
  dependsOn: number | null;
  seedFrameUrl: string | null;
  /** The act reservation's ledger ref; null until the act is reserved. */
  chargeRef: string | null;
  chargeCredits: number;
  refunded: boolean;
  outputUrl: string | null;
  error: string | null;
}

export interface JobState {
  status: JobStatus;
  cancelRequested: boolean;
  holdUntil: number | null;
  holdReason: HoldReason | null;
  stitchAttempts: number;
  /** After this, a job that is still planned/rendering fails (and refunds). */
  deadlineAt: number;
  errorCode: string | null;
  outputUrl: string | null;
}

export interface MachineConfig {
  maxConcurrentPerJob: number;
  /** Submits per scene, first try included. */
  maxAttempts: number;
  /** The job fails once failed scenes exceed floor(sceneCount × this). */
  maxFailedFraction: number;
  maxPollsPerTick: number;
  /** A claim with no operation older than this belongs to a tick that died mid-submit. */
  claimStaleMs: number;
  /** A clip still rendering after this is failed (never re-submitted: the operation may still bill). */
  renderTimeoutMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  /** Spacing between two polls of the same operation. */
  pollIntervalMs: number;
  holdMs: Readonly<Record<HoldReason, number>>;
  maxStitchAttempts: number;
  /**
   * A stitching job still unfinished this long after its deadline fails (and refunds everything). ⚠️ Without it a
   * stitch that is DEFERRED every tick (a tick budget too small for it — see the route) would hold the user's credits
   * forever: the deadline itself deliberately never cuts a stitch short.
   */
  stitchGraceMs: number;
}

const MIN = 60_000;

export const DEFAULT_MACHINE_CONFIG: MachineConfig = Object.freeze({
  maxConcurrentPerJob: 4,
  maxAttempts: 3,
  maxFailedFraction: 0.1,
  maxPollsPerTick: 12,
  claimStaleMs: 10 * MIN,
  // Veo renders an 8 s clip in ~1–6 min; 20 min is well past any healthy render.
  renderTimeoutMs: 20 * MIN,
  backoffBaseMs: 30_000,
  backoffMaxMs: 10 * MIN,
  pollIntervalMs: 15_000,
  holdMs: Object.freeze({ insufficient_credits: 30 * MIN, billing_unavailable: 15 * MIN, platform_budget: 30 * MIN, provider_unavailable: 15 * MIN }),
  maxStitchAttempts: 2,
  stitchGraceMs: 6 * 60 * MIN,
});

/** Exponential: base · 2^(attempts−1), capped. Deterministic (no jitter) so every rule is testable. */
export function backoffMs(attempts: number, cfg: MachineConfig = DEFAULT_MACHINE_CONFIG): number {
  const n = Number.isFinite(attempts) ? Math.max(1, Math.floor(attempts)) : 1;
  return Math.min(cfg.backoffMaxMs, cfg.backoffBaseMs * 2 ** Math.min(n - 1, 30));
}

/** How many scenes may fail before the job is abandoned: floor(n × fraction) — 0 for films under 10 scenes. */
export function allowedFailures(sceneCount: number, cfg: MachineConfig = DEFAULT_MACHINE_CONFIG): number {
  const f = Number.isFinite(cfg.maxFailedFraction) ? Math.min(1, Math.max(0, cfg.maxFailedFraction)) : 0;
  return Math.floor(Math.max(0, sceneCount) * f);
}

const isCharged = (s: SceneState): boolean => s.chargeRef !== null && s.chargeCredits > 0;

// ── Scene transitions ────────────────────────────────────────────────────────────────────────────────────────

export type SceneEvent =
  /** The DB claim moved it queued → submitted (attempts + 1). */
  | { type: 'claimed'; at: number }
  | { type: 'submit_ok'; operation: string; at: number }
  /** A provable rejection (429 / 503): nothing was created; retry later. */
  | { type: 'submit_retry'; reason: string; at: number }
  /** A platform-wide refusal: the attempt does not count; the job is put on hold. */
  | { type: 'submit_hold'; until: number }
  | { type: 'submit_failed'; reason: string }
  | { type: 'poll_processing'; at: number }
  /** Veo finished but the clip could not be hosted yet — poll (and deliver) again later. */
  | { type: 'poll_undeliverable'; at: number }
  | { type: 'poll_delivered'; url: string; at: number }
  /** Veo reported the generation failed: the operation is over, so a fresh submit is safe. */
  | { type: 'poll_failed'; reason: string; at: number }
  | { type: 'poll_filtered'; reason: string }
  | { type: 'claim_lost' }
  | { type: 'render_timeout' }
  | { type: 'abandon'; reason: string }
  | { type: 'charged'; ref: string; credits: number }
  | { type: 'refunded' }
  /** The seed frame was extracted (url) or could not be (null → the dependency is dropped). */
  | { type: 'seed_frame'; url: string | null };

export type SceneTransition = { ok: true; scene: SceneState } | { ok: false; reason: string };

const illegal = (scene: SceneState, event: SceneEvent): SceneTransition => ({
  ok: false,
  reason: `illegal_transition: ${event.type} on a ${scene.status} scene`,
});

const failed = (scene: SceneState, error: string): SceneState => ({
  ...scene,
  status: 'failed',
  nextAttemptAt: null,
  error: error.slice(0, 300),
});

/** Back to the queue after a provable miss, unless the scene is out of attempts. */
function requeueOrFail(scene: SceneState, reason: string, at: number, cfg: MachineConfig): SceneState {
  if (scene.attempts >= cfg.maxAttempts) return failed(scene, `retries_exhausted: ${reason}`);
  return { ...scene, status: 'queued', operation: null, nextAttemptAt: at + backoffMs(scene.attempts, cfg), error: reason.slice(0, 300) };
}

/**
 * Apply one event. Never throws: an event that does not apply to the scene's status is refused with a reason
 * (the tick logs it and leaves the row untouched), so a stale or duplicated provider answer cannot corrupt a row.
 */
export function applySceneEvent(scene: SceneState, event: SceneEvent, cfg: MachineConfig = DEFAULT_MACHINE_CONFIG): SceneTransition {
  const ok = (next: SceneState): SceneTransition => ({ ok: true, scene: next });
  switch (event.type) {
    case 'claimed':
      if (scene.status !== 'queued') return illegal(scene, event);
      return ok({ ...scene, status: 'submitted', attempts: scene.attempts + 1, operation: null, submittedAt: event.at, nextAttemptAt: null, error: null });
    case 'submit_ok':
      if (scene.status !== 'submitted' || !event.operation) return illegal(scene, event);
      return ok({ ...scene, status: 'rendering', operation: event.operation, submittedAt: event.at, nextAttemptAt: null, error: null });
    case 'submit_retry':
      if (scene.status !== 'submitted') return illegal(scene, event);
      return ok(requeueOrFail(scene, event.reason, event.at, cfg));
    case 'submit_hold':
      if (scene.status !== 'submitted') return illegal(scene, event);
      // The claim counted an attempt for a submit the platform refused before reaching Google — give it back.
      return ok({ ...scene, status: 'queued', attempts: Math.max(0, scene.attempts - 1), operation: null, nextAttemptAt: event.until });
    case 'submit_failed':
      if (scene.status !== 'submitted') return illegal(scene, event);
      return ok(failed(scene, event.reason));
    case 'claim_lost':
      if (scene.status !== 'submitted') return illegal(scene, event);
      return ok(failed(scene, 'claim_lost: the tick that claimed this scene died before recording its operation'));
    case 'poll_processing':
      if (scene.status !== 'rendering') return illegal(scene, event);
      return ok({ ...scene, nextAttemptAt: event.at + cfg.pollIntervalMs });
    case 'poll_undeliverable':
      if (scene.status !== 'rendering') return illegal(scene, event);
      return ok({ ...scene, nextAttemptAt: event.at + cfg.pollIntervalMs * 2, error: 'undeliverable: retrying delivery' });
    case 'poll_delivered':
      if (scene.status !== 'rendering' || !event.url) return illegal(scene, event);
      return ok({ ...scene, status: 'delivered', outputUrl: event.url, nextAttemptAt: null, error: null });
    case 'poll_failed':
      if (scene.status !== 'rendering') return illegal(scene, event);
      return ok(requeueOrFail(scene, `generation_failed: ${event.reason}`, event.at, cfg));
    case 'poll_filtered':
      if (scene.status !== 'rendering') return illegal(scene, event);
      return ok(failed(scene, `filtered: ${event.reason}`));
    case 'render_timeout':
      if (scene.status !== 'rendering') return illegal(scene, event);
      return ok(failed(scene, 'render_timeout'));
    case 'abandon':
      if (isTerminalScene(scene.status)) return illegal(scene, event);
      return ok(failed(scene, event.reason));
    case 'charged':
      if (scene.chargeRef === event.ref && scene.chargeCredits === event.credits) return ok(scene); // idempotent
      if (scene.status !== 'queued' || scene.chargeRef !== null || !event.ref || !(event.credits >= 0)) return illegal(scene, event);
      return ok({ ...scene, chargeRef: event.ref, chargeCredits: Math.round(event.credits) });
    case 'refunded':
      if (!isTerminalScene(scene.status) || !isCharged(scene) || scene.refunded) return illegal(scene, event);
      return ok({ ...scene, refunded: true });
    case 'seed_frame':
      if (scene.status !== 'queued' || scene.dependsOn === null) return illegal(scene, event);
      return ok(event.url ? { ...scene, seedFrameUrl: event.url } : { ...scene, dependsOn: null });
    default: {
      const never: never = event;
      return { ok: false, reason: `unknown event ${String((never as { type?: unknown }).type)}` };
    }
  }
}

// ── Job transitions ──────────────────────────────────────────────────────────────────────────────────────────

export type JobEvent =
  | { type: 'start' }
  | { type: 'all_rendered' }
  | { type: 'stitch_ok'; url: string }
  | { type: 'stitch_failed' }
  | { type: 'fail'; code: string }
  | { type: 'cancel' }
  | { type: 'hold'; reason: HoldReason; until: number }
  | { type: 'release_hold' };

export type JobTransition = { ok: true; job: JobState } | { ok: false; reason: string };

export function applyJobEvent(job: JobState, event: JobEvent): JobTransition {
  const ok = (next: JobState): JobTransition => ({ ok: true, job: next });
  const bad = (): JobTransition => ({ ok: false, reason: `illegal_transition: ${event.type} on a ${job.status} job` });
  switch (event.type) {
    case 'start':
      return job.status === 'planned' ? ok({ ...job, status: 'rendering' }) : bad();
    case 'all_rendered':
      return job.status === 'rendering' ? ok({ ...job, status: 'stitching', holdUntil: null, holdReason: null }) : bad();
    case 'stitch_ok':
      return job.status === 'stitching' && event.url ? ok({ ...job, status: 'done', outputUrl: event.url, errorCode: null }) : bad();
    case 'stitch_failed':
      return job.status === 'stitching' ? ok({ ...job, stitchAttempts: job.stitchAttempts + 1 }) : bad();
    case 'fail':
      return isTerminalJob(job.status) ? bad() : ok({ ...job, status: 'failed', errorCode: event.code.slice(0, 120), holdUntil: null, holdReason: null });
    case 'cancel':
      return isTerminalJob(job.status) ? bad() : ok({ ...job, status: 'canceled', errorCode: 'canceled_by_user', holdUntil: null, holdReason: null });
    case 'hold':
      if (job.status !== 'planned' && job.status !== 'rendering') return bad();
      // Holds only extend: a short provider hold never cuts a longer budget hold short.
      return ok(job.holdUntil !== null && job.holdUntil >= event.until ? job : { ...job, holdUntil: event.until, holdReason: event.reason });
    case 'release_hold':
      return job.holdUntil === null ? bad() : ok({ ...job, holdUntil: null, holdReason: null });
    default: {
      const never: never = event;
      return { ok: false, reason: `unknown event ${String((never as { type?: unknown }).type)}` };
    }
  }
}

// ── Refund markers ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Which charged, not-yet-refunded scenes are owed back — "you pay for the clips you receive":
 *   • a job in progress or done: every FAILED scene (it is not in the film);
 *   • canceled, or failed for any reason but the stitch: every scene that was NOT delivered — delivered clips stay
 *     the user's (their rows keep the URLs), so they stay paid for. ⚠️ Refunding them too would make "provoke a
 *     failure after the clips render" a way to get clips for free.
 *   • failed at the STITCH: everything — every clip rendered, and we could not assemble the film that was bought.
 */
export function refundableScenes(job: JobState, scenes: readonly SceneState[]): number[] {
  const owed = scenes.filter((s) => isCharged(s) && !s.refunded);
  let pick: (s: SceneState) => boolean;
  if (job.status === 'failed' && job.errorCode === 'stitch_failed') pick = () => true;
  else if (job.status === 'failed' || job.status === 'canceled') pick = (s) => s.status !== 'delivered';
  else pick = (s) => s.status === 'failed';
  // Only TERMINAL scenes are refunded: an in-flight scene of a terminal job is abandoned (→ failed) first.
  return owed.filter((s) => isTerminalScene(s.status) && pick(s)).map((s) => s.ordinal).sort((a, b) => a - b);
}

// ── Settle: job-level decisions ──────────────────────────────────────────────────────────────────────────────

export interface Settlement {
  job: JobState;
  scenes: SceneState[];
  /** Ordinals whose row changed (abandoned). */
  changed: number[];
  /** Charged scenes to refund now (after the transitions above). */
  refund: number[];
  /** True when the tick should run the stitch now. */
  stitch: boolean;
}

function mustJob(job: JobState, event: JobEvent): JobState {
  const t = applyJobEvent(job, event);
  return t.ok ? t.job : job;
}

/**
 * The job-level decision for this instant: cancel, deadline, start, early failure, stitch, hold expiry — then the
 * refund markers for the resulting state. Pure and idempotent: settling a settled job changes nothing.
 */
export function settle(job: JobState, scenes: readonly SceneState[], now: number, cfg: MachineConfig = DEFAULT_MACHINE_CONFIG): Settlement {
  let j = job;
  const next = scenes.map((s) => ({ ...s }));
  const changed: number[] = [];
  const abandonAll = (reason: string) => {
    next.forEach((s, i) => {
      const t = applySceneEvent(s, { type: 'abandon', reason }, cfg);
      if (t.ok) {
        next[i] = t.scene;
        changed.push(s.ordinal);
      }
    });
  };
  let stitch = false;

  if (!isTerminalJob(j.status)) {
    if (j.cancelRequested) {
      j = mustJob(j, { type: 'cancel' });
      abandonAll('canceled');
    } else if ((j.status === 'planned' || j.status === 'rendering') && now >= j.deadlineAt) {
      const code = j.holdReason === 'insufficient_credits' ? 'deadline_insufficient_credits' : 'deadline';
      j = mustJob(j, { type: 'fail', code });
      abandonAll(code);
    } else {
      if (j.status === 'planned') j = mustJob(j, { type: 'start' });
      if (j.status === 'rendering') {
        const failedCount = next.filter((s) => s.status === 'failed').length;
        const delivered = next.filter((s) => s.status === 'delivered').length;
        if (failedCount > allowedFailures(next.length, cfg)) {
          j = mustJob(j, { type: 'fail', code: 'too_many_scene_failures' });
          abandonAll('job_failed');
        } else if (next.length > 0 && next.every((s) => isTerminalScene(s.status))) {
          j = delivered > 0 ? mustJob(j, { type: 'all_rendered' }) : mustJob(j, { type: 'fail', code: 'nothing_delivered' });
        } else if (next.length === 0) {
          j = mustJob(j, { type: 'fail', code: 'no_scenes' });
        }
      }
      if (j.status === 'stitching') {
        if (j.stitchAttempts >= cfg.maxStitchAttempts || now >= j.deadlineAt + cfg.stitchGraceMs) {
          j = mustJob(j, { type: 'fail', code: 'stitch_failed' });
        } else stitch = true;
      }
      if (j.status === 'rendering' && j.holdUntil !== null && now >= j.holdUntil) j = mustJob(j, { type: 'release_hold' });
    }
  }

  return { job: j, scenes: next, changed, refund: refundableScenes(j, next), stitch };
}

// ── Plan work: scene-level decisions ─────────────────────────────────────────────────────────────────────────

export interface WorkPlan {
  /** Scenes to fail without a provider call. */
  fail: Array<{ ordinal: number; event: 'claim_lost' | 'render_timeout' }>;
  /** Rendering scenes to poll, oldest due first. */
  poll: number[];
  /** Dependent scenes whose dependency is delivered and whose seed frame should be extracted now. */
  seedFrames: Array<{ ordinal: number; fromOrdinal: number }>;
  /** The one act to reserve credits for this tick, or null. */
  reserveAct: number | null;
  /** Queued, reserved, due, unblocked scenes to claim and submit, earliest first, within the concurrency cap. */
  submit: number[];
}

/**
 * What to do for a RENDERING job right now. Polling and housekeeping continue during a hold (clips already in
 * flight still need collecting); reserving and submitting do not.
 */
export function planWork(job: JobState, scenes: readonly SceneState[], now: number, cfg: MachineConfig = DEFAULT_MACHINE_CONFIG): WorkPlan {
  if (job.status !== 'rendering') return { fail: [], poll: [], seedFrames: [], reserveAct: null, submit: [] };
  const byOrdinal = new Map(scenes.map((s) => [s.ordinal, s]));
  const due = (s: SceneState) => (s.nextAttemptAt ?? 0) <= now;

  const fail: WorkPlan['fail'] = [];
  for (const s of scenes) {
    if (s.status === 'submitted' && s.operation === null && (s.submittedAt === null || now - s.submittedAt >= cfg.claimStaleMs)) {
      fail.push({ ordinal: s.ordinal, event: 'claim_lost' });
    } else if (s.status === 'rendering' && s.submittedAt !== null && now - s.submittedAt >= cfg.renderTimeoutMs) {
      fail.push({ ordinal: s.ordinal, event: 'render_timeout' });
    }
  }
  const failing = new Set(fail.map((f) => f.ordinal));

  const poll = scenes
    .filter((s) => s.status === 'rendering' && !failing.has(s.ordinal) && !!s.operation && due(s))
    .sort((a, b) => (a.nextAttemptAt ?? 0) - (b.nextAttemptAt ?? 0) || a.ordinal - b.ordinal)
    .slice(0, Math.max(0, cfg.maxPollsPerTick))
    .map((s) => s.ordinal);

  const seedFrames: WorkPlan['seedFrames'] = [];
  for (const s of scenes) {
    if (s.status !== 'queued' || s.dependsOn === null || s.seedFrameUrl !== null) continue;
    const dep = byOrdinal.get(s.dependsOn);
    if (dep?.status === 'delivered' && dep.outputUrl) seedFrames.push({ ordinal: s.ordinal, fromOrdinal: dep.ordinal });
  }

  const held = job.holdUntil !== null && now < job.holdUntil;
  if (held) return { fail, poll, seedFrames, reserveAct: null, submit: [] };

  const unblocked = (s: SceneState): boolean => {
    if (s.dependsOn === null || s.seedFrameUrl !== null) return true;
    const dep = byOrdinal.get(s.dependsOn);
    return !dep || dep.status === 'failed'; // fail-open: a missing or failed dependency releases the scene
  };
  const busy = scenes.filter((s) => inFlight(s.status) && !failing.has(s.ordinal)).length;
  const free = Math.max(0, cfg.maxConcurrentPerJob - busy);
  const submit = scenes
    // Reserved = its act's debit landed (chargeRef set). A zero-credit reservation (a promo) still counts.
    .filter((s) => s.status === 'queued' && s.chargeRef !== null && due(s) && unblocked(s))
    .sort((a, b) => a.ordinal - b.ordinal)
    .slice(0, free)
    .map((s) => s.ordinal);

  // Reserve the next act just ahead of need: only when slots would otherwise sit idle, lowest act first.
  let reserveAct: number | null = null;
  if (free > submit.length) {
    const unreserved = scenes.filter((s) => s.status === 'queued' && s.chargeRef === null).map((s) => s.act);
    if (unreserved.length) reserveAct = Math.min(...unreserved);
  }

  return { fail, poll, seedFrames, reserveAct, submit };
}

// ── Provider outcomes → events ───────────────────────────────────────────────────────────────────────────────

export type SubmitVerdict =
  | { kind: 'ok'; operation: string }
  | { kind: 'retry'; reason: string }
  | { kind: 'hold'; reason: HoldReason; detail: string }
  | { kind: 'fail'; reason: string };

/** What the tick's submit dependency reports: the engine's outcome, or the platform budget's refusal. */
export type SubmitReport = { kind: 'outcome'; outcome: VeoCreateOutcome } | { kind: 'budget_refused'; reason: string };

/**
 * The engine's create outcome → what the queue does. ⚠️ `ambiguous` FAILS the scene — a job may exist and bill, and
 * re-POSTing risks paying twice for one scene. quota / auth / not_configured are platform-wide (every other scene
 * would fail the same way) → hold the job, not fail the scene.
 */
export function classifySubmit(report: SubmitReport): SubmitVerdict {
  if (report.kind === 'budget_refused') return { kind: 'hold', reason: 'platform_budget', detail: report.reason || 'budget' };
  const o = report.outcome;
  if (o.ok) return o.operation?.name ? { kind: 'ok', operation: o.operation.name } : { kind: 'fail', reason: 'no_operation_name' };
  switch (o.reason) {
    case 'rate_limited':
    case 'unavailable':
      return { kind: 'retry', reason: o.reason };
    case 'quota':
    case 'auth':
    case 'not_configured':
      return { kind: 'hold', reason: 'provider_unavailable', detail: o.reason };
    case 'ambiguous':
      return { kind: 'fail', reason: 'ambiguous_submit' };
    case 'invalid_request':
    case 'safety':
      return { kind: 'fail', reason: o.reason };
    default:
      return { kind: 'fail', reason: `unknown:${String(o.reason)}` };
  }
}

/** What the tick's poll dependency reports (poll + delivery to our storage, done by runtime.ts). */
export type ScenePollReport =
  | { state: 'processing' }
  | { state: 'delivered'; url: string }
  | { state: 'undeliverable' }
  | { state: 'filtered'; reason: string }
  | { state: 'failed'; reason: string };

export function pollEvent(report: ScenePollReport, at: number): SceneEvent {
  switch (report.state) {
    case 'delivered':
      return report.url ? { type: 'poll_delivered', url: report.url, at } : { type: 'poll_undeliverable', at };
    case 'undeliverable':
      return { type: 'poll_undeliverable', at };
    case 'filtered':
      return { type: 'poll_filtered', reason: report.reason || 'safety' };
    case 'failed':
      return { type: 'poll_failed', reason: report.reason || 'failed', at };
    case 'processing':
    default:
      return { type: 'poll_processing', at };
  }
}

// ── Diffs (what the tick persists) ───────────────────────────────────────────────────────────────────────────

/** The fields of `next` that differ from `prev` — the patch the tick writes. */
export function diffState<T extends object>(prev: T, next: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(next) as Array<keyof T>) {
    if (prev[k] !== next[k]) out[k] = next[k];
  }
  return out;
}
