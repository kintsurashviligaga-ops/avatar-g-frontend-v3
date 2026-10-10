/**
 * lib/tasks/statusModel.ts — ONE status vocabulary for every store a task lives in (Agent G PART 2, gap T2).
 *
 * The stores disagree (docs/handoffs/agent-g/part-0-report.md §5):
 *   · generation_jobs:            pending · processing · completed · failed, and a stop is stored as failed with an
 *                                 error that starts with „cancel" (the table has no cancelled status);
 *   · the studio's client queue:  queued · rendering · done · failed · canceled (lib/jobs/jobQueue);
 *   · older tables and providers: waiting · running · succeeded · success · canceled · partial · error · …;
 *   · Agent G runs:               lib/agent/contracts RunStatus (planned … partially_completed).
 *
 * Everything that SHOWS a task speaks the canonical set below. This file is the only place that translates, so a new
 * store or a provider's own word is added here once and every surface reads it the same way. Pure, isomorphic.
 */

/** The canonical task status. A run's own planning states fold into these (planned → queued, blocked → waiting on a person). */
export type TaskStatus = 'queued' | 'awaiting_approval' | 'running' | 'completed' | 'partially_completed' | 'failed' | 'cancelled';

export const TASK_STATUSES: readonly TaskStatus[] = ['queued', 'awaiting_approval', 'running', 'completed', 'partially_completed', 'failed', 'cancelled'];

const WORDS: Readonly<Record<string, TaskStatus>> = {
  // waiting for a worker or a slot
  pending: 'queued', queued: 'queued', waiting: 'queued', planned: 'queued', created: 'queued', scheduled: 'queued', submitted: 'queued',
  // waiting for a person: an approval, or (a run's `blocked`) something only the owner or the user can change
  awaiting_approval: 'awaiting_approval', blocked: 'awaiting_approval', needs_approval: 'awaiting_approval',
  // a worker has it
  processing: 'running', running: 'running', rendering: 'running', in_progress: 'running', started: 'running', retrying: 'running', active: 'running',
  // delivered
  completed: 'completed', complete: 'completed', done: 'completed', succeeded: 'completed', success: 'completed', finished: 'completed',
  // some of a run's results delivered, the rest failed, were stopped or never ran
  partially_completed: 'partially_completed', partial: 'partially_completed',
  // ended without a result
  failed: 'failed', failure: 'failed', error: 'failed', errored: 'failed', timeout: 'failed', timed_out: 'failed', expired: 'failed',
  // stopped by its owner
  cancelled: 'cancelled', canceled: 'cancelled', aborted: 'cancelled', stopped: 'cancelled',
};

/** A stop written as a failure (generation_jobs has no cancelled status): its error says so. */
const CANCEL_ERROR = /^cancel/i;

/**
 * Any store's status word → the canonical status, or null for a word no store is known to use (the caller decides
 * what an unknown word means; nothing is guessed here). `error` is the row's error text: a failure whose error starts
 * with „cancel" was a stop.
 */
export function normalizeStatus(raw: unknown, error?: string | null): TaskStatus | null {
  if (typeof raw !== 'string') return null;
  const s = WORDS[raw.trim().toLowerCase().replace(/[\s-]+/g, '_')];
  if (!s) return null;
  return s === 'failed' && CANCEL_ERROR.test(error ?? '') ? 'cancelled' : s;
}

/** Nothing more will change. */
export const isFinalStatus = (s: TaskStatus): boolean =>
  s === 'completed' || s === 'partially_completed' || s === 'failed' || s === 'cancelled';

/** Still going, or waiting for a worker or a person. */
export const isLiveStatus = (s: TaskStatus): boolean => !isFinalStatus(s);

/** Delivered at least one result. */
export const deliveredStatus = (s: TaskStatus): boolean => s === 'completed' || s === 'partially_completed';
