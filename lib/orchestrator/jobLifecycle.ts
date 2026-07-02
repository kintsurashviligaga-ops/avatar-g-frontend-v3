/**
 * Job lifecycle runner — STEP 2.4 guardrail.
 *
 * Wraps a heavy render (Kling clips → TTS → assemble) so the `generation_jobs` row ALWAYS
 * reaches a terminal state: queued → processing → completed | failed. The load-bearing
 * guarantee is that a failed/throwing render is marked `failed` after bounded retry —
 * NEVER left in `processing` (which would hang the dashboard poll forever).
 *
 * The job-state writers are injected so this is unit-testable without a DB and so the
 * caller decides which store (generation_jobs) + ids to use. Every writer call is
 * fail-soft (a telemetry write must never mask the render outcome), but the terminal
 * `markFailed` is still attempted on every non-completed path.
 */
export interface JobLifecycleDeps {
  markProcessing: (stage: string, pct: number) => Promise<void>;
  markCompleted: (result: unknown) => Promise<void>;
  markFailed: (error: string) => Promise<void>;
}

export interface JobRunOptions {
  /** Total attempts including the first (default 3). */
  maxAttempts?: number;
  /** Linear backoff base; attempt N waits baseDelayMs*N (default 1000). */
  baseDelayMs?: number;
  /** Only retry when this returns true (default: retry all). A non-retryable error fails now. */
  isRetryable?: (err: unknown) => boolean;
  /** Injectable sleep (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type JobOutcome<T> = { ok: true; result: T } | { ok: false; error: string; attempts: number };

/**
 * Run `work` under the job lifecycle. Marks processing, retries transient failures up to
 * maxAttempts, then commits a terminal state. Resolves (never rejects) so the caller/route
 * can return immediately; the terminal write has already happened.
 */
export async function runJobWithLifecycle<T>(
  work: (attempt: number) => Promise<T>,
  deps: JobLifecycleDeps,
  opts: JobRunOptions = {},
): Promise<JobOutcome<T>> {
  const maxAttempts = Math.max(1, Math.floor(opts.maxAttempts ?? 3));
  const baseDelayMs = Math.max(0, opts.baseDelayMs ?? 1000);
  const isRetryable = opts.isRetryable ?? (() => true);
  const sleep = opts.sleep ?? defaultSleep;

  await deps.markProcessing('processing', 5).catch(() => {});

  let lastError = 'unknown error';
  let attempts = 0;
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt;
      try {
        const result = await work(attempt);
        await deps.markCompleted(result).catch(() => {});
        return { ok: true, result };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt >= maxAttempts || !isRetryable(err)) break;
        await sleep(baseDelayMs * attempt).catch(() => {});
      }
    }
  } catch (fatal) {
    // Anything outside `work` (a rogue throw) still lands here → terminal `failed` below.
    lastError = fatal instanceof Error ? fatal.message : String(fatal);
  }

  // GUARANTEE: every non-completed path marks the job failed — no stuck `processing`.
  await deps.markFailed(lastError.slice(0, 300)).catch(() => {});
  return { ok: false, error: lastError, attempts };
}
