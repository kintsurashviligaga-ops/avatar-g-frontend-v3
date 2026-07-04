'use client';

/**
 * React binding for the capped-parallel job queue engine.
 * ========================================================
 *
 * One process-wide JobQueue instance drives every generation the composer starts, so
 * up to MAX_CONCURRENT_RENDERS run at once and the rest wait with a live position.
 * The engine emits an immutable snapshot on each change → this store re-publishes it,
 * so the tray (and any consumer) re-renders reactively without touching internals.
 *
 * The engine holds no React/DOM/fetch, so the singleton is safe under Next.js fast-
 * refresh — we only ever read `jobs` and call `submit/cancel` through the store.
 */

import { create } from 'zustand';
import { JobQueue, type Job, type SubmitInput } from '@/lib/jobs/jobQueue';

/** The user-chosen concurrency cap: 3 render at once, overflow queues with a position. */
export const MAX_CONCURRENT_RENDERS = 3;

interface JobQueueState {
  jobs: Job[];
  submit: (input: SubmitInput) => string;
  cancel: (id: string) => void;
  clearFinished: () => void;
  /** Active (rendering) + waiting (queued) count — for the composer's soft gate. */
  inFlight: () => number;
}

export const useJobQueue = create<JobQueueState>((set, get) => {
  const queue = new JobQueue({
    maxConcurrent: MAX_CONCURRENT_RENDERS,
    onChange: (jobs) => set({ jobs }),
  });
  return {
    jobs: [],
    submit: (input) => queue.submit(input),
    cancel: (id) => queue.cancel(id),
    clearFinished: () => queue.clearFinished(),
    inFlight: () => get().jobs.filter((j) => j.status === 'rendering' || j.status === 'queued').length,
  };
});
