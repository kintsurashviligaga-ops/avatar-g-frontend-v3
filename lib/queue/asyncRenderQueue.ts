/**
 * asyncRenderQueue — the PURE lifecycle brain of the background render worker.
 *
 * The commercial's real assets (music, Georgian VO, Kling/Hailuo video) take MINUTES to render —
 * far past a 45s browser eval or a synchronous serverless request. This models each asset as a
 * decoupled job that is SUBMITTED to an external provider (returns a task id), then RESOLVED later
 * by a poll OR a signed webhook, so a server-side worker (node/cron — NOT a blocking request) can
 * hold across multi-minute durations until the real asset URL lands.
 *
 * This module is PURE + deterministic (no I/O, no Date.now — `now` is always injected) so the whole
 * state machine is unit-testable. The impure provider calls + the worker loop live in
 * renderProviders.ts / runRenderQueue.ts and are driven BY this brain.
 */

export type RenderJobKind = 'music' | 'voiceover' | 'video';
export type RenderJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface RenderJob {
  readonly id: string;
  readonly kind: RenderJobKind;
  /** Manifest shot id (e.g. 'S10') or a named asset key (e.g. 'music', 'vo'). */
  readonly slot: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly status: RenderJobStatus;
  /** The external provider's task/prediction id, once submitted. */
  readonly providerTaskId: string | null;
  /** The delivered asset URL (mp4/wav), once completed. */
  readonly assetUrl: string | null;
  readonly error: string | null;
  /** SUBMIT attempts (a submit can transiently fail + retry). */
  readonly attempts: number;
  /** POLL count (observability). */
  readonly polls: number;
  readonly createdAt: number;
  readonly submittedAt: number | null;
  readonly updatedAt: number;
}

export interface QueueConfig {
  /** Max submit attempts before a job is declared failed. */
  readonly maxSubmitAttempts: number;
  /** Minimum gap between polls of one processing job. */
  readonly pollIntervalMs: number;
  /** Wall-clock ceiling for a single job (submit → done); past this it's timed out. */
  readonly jobTimeoutMs: number;
}

export const DEFAULT_CONFIG: QueueConfig = {
  maxSubmitAttempts: 3,
  pollIntervalMs: 5_000,
  jobTimeoutMs: 8 * 60_000, // 8 min — comfortably past a slow Kling/MusicGen render
};

/** A provider outcome, from EITHER a poll response OR a (verified) webhook payload. */
export interface ProviderResolution {
  readonly status: 'processing' | 'completed' | 'failed';
  readonly url?: string;
  readonly error?: string;
}

// ── constructors + transitions (all pure; return a NEW job) ──────────────────

export function createJob(
  id: string,
  kind: RenderJobKind,
  slot: string,
  params: Record<string, unknown>,
  now: number,
): RenderJob {
  return {
    id, kind, slot, params,
    status: 'queued',
    providerTaskId: null,
    assetUrl: null,
    error: null,
    attempts: 0,
    polls: 0,
    createdAt: now,
    submittedAt: null,
    updatedAt: now,
  };
}

/** A submit succeeded → the provider gave us a task id; job is now processing. */
export function markSubmitted(job: RenderJob, providerTaskId: string, now: number): RenderJob {
  return { ...job, status: 'processing', providerTaskId, attempts: job.attempts + 1, submittedAt: now, updatedAt: now };
}

/** A submit call failed (transient). Retry while under the cap, else fail permanently. */
export function markSubmitError(job: RenderJob, error: string, now: number, cfg: QueueConfig = DEFAULT_CONFIG): RenderJob {
  const attempts = job.attempts + 1;
  if (attempts >= cfg.maxSubmitAttempts) {
    return { ...job, status: 'failed', attempts, error: error || 'submit failed', updatedAt: now };
  }
  return { ...job, status: 'queued', attempts, error, updatedAt: now };
}

/** Apply a provider resolution (poll response OR webhook). Only affects a processing job. */
export function applyResolution(job: RenderJob, res: ProviderResolution, now: number): RenderJob {
  if (job.status !== 'processing') return job; // ignore late/duplicate resolutions on a terminal job
  if (res.status === 'completed' && res.url) {
    return { ...job, status: 'completed', assetUrl: res.url, error: null, polls: job.polls + 1, updatedAt: now };
  }
  if (res.status === 'failed') {
    return { ...job, status: 'failed', error: res.error || 'provider reported failure', polls: job.polls + 1, updatedAt: now };
  }
  // still processing — bump the poll clock so pollDue() spaces the next check.
  return { ...job, polls: job.polls + 1, updatedAt: now };
}

/** Force a job to failed (e.g. a hard timeout from the worker). */
export function markTimedOut(job: RenderJob, now: number): RenderJob {
  if (isTerminal(job)) return job;
  return { ...job, status: 'failed', error: `timed out after ${now - job.createdAt}ms`, updatedAt: now };
}

// ── predicates ───────────────────────────────────────────────────────────────

export function isTerminal(job: RenderJob): boolean {
  return job.status === 'completed' || job.status === 'failed';
}

export function isTimedOut(job: RenderJob, now: number, cfg: QueueConfig = DEFAULT_CONFIG): boolean {
  return !isTerminal(job) && now - job.createdAt > cfg.jobTimeoutMs;
}

/** A processing job is due for a poll when the interval has elapsed since its last update. */
export function pollDue(job: RenderJob, now: number, cfg: QueueConfig = DEFAULT_CONFIG): boolean {
  return job.status === 'processing' && now - job.updatedAt >= cfg.pollIntervalMs;
}

// ── the scheduler: what should the worker DO with this job right now? ─────────

export type NextAction = 'submit' | 'poll' | 'wait' | 'timeout' | 'done';

export function nextAction(job: RenderJob, now: number, cfg: QueueConfig = DEFAULT_CONFIG): NextAction {
  if (isTerminal(job)) return 'done';
  if (isTimedOut(job, now, cfg)) return 'timeout';
  if (job.status === 'queued') return 'submit';
  // processing:
  return pollDue(job, now, cfg) ? 'poll' : 'wait';
}

// ── aggregates ───────────────────────────────────────────────────────────────

export interface QueueSummary {
  total: number; queued: number; processing: number; completed: number; failed: number;
}

export function summarize(jobs: readonly RenderJob[]): QueueSummary {
  const s: QueueSummary = { total: jobs.length, queued: 0, processing: 0, completed: 0, failed: 0 };
  for (const j of jobs) s[j.status] += 1;
  return s;
}

export function allTerminal(jobs: readonly RenderJob[]): boolean {
  return jobs.every(isTerminal);
}
