/**
 * Worker Queue Operations
 * Atomic job claim, process, complete, and fail functions.
 * All functions use service role client exclusively.
 */

import { supabase } from './supabaseClient'
import { structuredLog } from './logger'
import type { JobRecord, AgentResult } from './types'

/**
 * claimNextJob
 * Atomically claims the next available job for this worker.
 * Uses the claim_next_job PostgreSQL function (FOR UPDATE SKIP LOCKED).
 */
export async function claimNextJob(
  workerId: string,
  supportedAgents: string[]
): Promise<JobRecord | null> {
  const { data, error } = await supabase.rpc('claim_next_job', {
    p_worker_id: workerId,
    p_agent_ids: supportedAgents,
  })

  if (error) {
    structuredLog('error', 'claim_next_job_failed', {
      error: error.message,
      workerId,
    })
    return null
  }

  return (data as JobRecord) ?? null
}

/**
 * processJob
 * Sets job to processing state, executes the agent function, handles result.
 * Includes timeout enforcement.
 */
export async function processJob(
  job: JobRecord,
  agentFn: (payload: Record<string, unknown>) => Promise<AgentResult>
): Promise<void> {
  // Mark processing
  await supabase
    .from('jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
    })
    .eq('id', job.id)

  // Update worker heartbeat
  await supabase
    .from('worker_heartbeat')
    .update({ status: 'busy', current_job_id: job.id })
    .eq('worker_id', job.worker_id)

  // Timeout wrapper
  const timeoutMs = job.timeout_seconds * 1000

  const result = await Promise.race([
    agentFn(job.payload),
    new Promise<AgentResult>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Job timed out after ${job.timeout_seconds}s`)),
        timeoutMs
      )
    ),
  ]).catch((err: unknown) => ({
    success: false,
    error: err instanceof Error ? err.message : 'Unknown error',
  } as AgentResult))

  // Clear busy status
  await supabase
    .from('worker_heartbeat')
    .update({ status: 'idle', current_job_id: null })
    .eq('worker_id', job.worker_id)

  if (result.success) {
    await markJobComplete(job.id, result)
  } else {
    await markJobFailed(
      job.id,
      result.error ?? 'Unknown error',
      job.attempt_count,
      job.max_attempts
    )
  }
}

/**
 * markJobComplete
 */
export async function markJobComplete(
  jobId: string,
  result: AgentResult
): Promise<void> {
  await supabase
    .from('jobs')
    .update({
      status: 'completed',
      result: result.data ?? {},
      completed_at: new Date().toISOString(),
      worker_id: null,
    })
    .eq('id', jobId)

  structuredLog('info', 'job_completed', { jobId })
}

/**
 * markJobFailed
 * Implements exponential backoff retry: 2^attempt * 30s
 * Moves to 'dead' if max_attempts reached.
 */
export async function markJobFailed(
  jobId: string,
  errorMessage: string,
  attemptCount: number,
  maxAttempts: number
): Promise<void> {
  const nextAttempt = attemptCount + 1
  const isDead = nextAttempt >= maxAttempts
  const nextRetryAt = isDead
    ? null
    : new Date(Date.now() + Math.pow(2, nextAttempt) * 30_000).toISOString()

  await supabase
    .from('jobs')
    .update({
      status: isDead ? 'dead' : 'failed',
      error_message: errorMessage,
      attempt_count: nextAttempt,
      next_retry_at: nextRetryAt,
      worker_id: null,
      completed_at: isDead ? new Date().toISOString() : null,
    })
    .eq('id', jobId)

  // Write to job_logs
  await supabase.from('job_logs').insert({
    job_id: jobId,
    level: 'error',
    message: isDead
      ? `Job moved to dead-letter: ${errorMessage}`
      : `Job failed (attempt ${nextAttempt}): ${errorMessage}`,
    data: { attemptCount: nextAttempt, isDead, nextRetryAt },
  })

  structuredLog('error', isDead ? 'job_dead' : 'job_failed', {
    jobId,
    errorMessage,
    nextAttempt,
    isDead,
  })
}
