import 'server-only';

/**
 * Ad render job orchestration — STEP 2.4.
 *
 * Binds the terminal-guaranteed lifecycle runner to the real `generation_jobs` writers.
 * Split so the HTTP handler can return IMMEDIATELY: `startAdRenderJob` inserts a `queued`
 * row and hands back the id; the heavy render runs under `processAdRenderJob`, which marks
 * processing → completed | failed. A failed Kling render is marked `failed` after bounded
 * retry — the job is NEVER left in `processing` (which would hang the dashboard poll).
 */
import { randomUUID } from 'node:crypto';
import { createJob, updateJobStage, completeJob, failJob } from '@/lib/orchestrator/jobs';
import { runJobWithLifecycle, type JobOutcome } from '@/lib/orchestrator/jobLifecycle';

export interface AdRenderResult {
  url: string;
  result?: Record<string, unknown>;
}

/** Errors that must NOT be retried (deterministic — retrying only wastes budget/time). */
const NON_RETRYABLE = /insufficient|top-?up|invalid|unsupported|too large|at most|budget/i;

/**
 * Create the ad render job (status `queued`) and return its id immediately. The caller
 * returns this to the client so the request thread never blocks on the render. Returns
 * null if the job store is unavailable (caller falls back to a synchronous error).
 */
export async function startAdRenderJob(userId: string, params: Record<string, unknown>): Promise<string | null> {
  const id = randomUUID();
  // 'film' is the ProduceKind for a multi-scene video/ad composite (the Library reads
  // service_type='film' for playable video); there is no separate 'video' kind.
  const ok = await createJob({ id, userId, serviceType: 'film', params });
  return ok ? id : null;
}

/**
 * Run the render under the full lifecycle. Agent G stays the sole job creator (this only
 * advances an already-created job). Resolves (never rejects) with the terminal outcome.
 */
export async function processAdRenderJob(
  jobId: string,
  work: (attempt: number) => Promise<AdRenderResult>,
  opts?: { maxAttempts?: number },
): Promise<JobOutcome<AdRenderResult>> {
  return runJobWithLifecycle(
    work,
    {
      markProcessing: (stage, pct) => updateJobStage(jobId, stage, pct),
      markCompleted: (r) => {
        const res = (r ?? {}) as AdRenderResult;
        return completeJob(jobId, { signedUrl: res.url ?? null, result: res.result ?? { url: res.url } });
      },
      markFailed: (error) => failJob(jobId, error),
    },
    {
      maxAttempts: opts?.maxAttempts ?? 3,
      isRetryable: (e) => !NON_RETRYABLE.test(e instanceof Error ? e.message : String(e)),
    },
  );
}
