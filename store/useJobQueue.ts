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
import { trackJobCreate, trackJobPosition } from '@/lib/jobs/trackJob';

/** The user-chosen concurrency cap: 3 render at once, overflow queues with a position. */
export const MAX_CONCURRENT_RENDERS = 3;

/**
 * DURABLE QUEUE POSITION (Task 6). The engine emits a fresh snapshot on every mutation; this
 * mirrors each LOCAL job's live `position` into its generation_jobs row so the queue layout
 * survives a reload. The create already writes the INITIAL position, so first-sight of a job is
 * only SEEDED (no redundant POST); thereafter a shift (#2→#1) or a promotion (queued→rendering,
 * position→null) fires one isolated `position` write. Terminal rows are left to trackJobSettle
 * (which nulls their position), so we never post for a job that's already done/failed/canceled.
 */
const lastSyncedPos = new Map<string, number | null>();
function syncQueuePositions(jobs: readonly Job[]): void {
  const alive = new Set<string>();
  for (const j of jobs) {
    alive.add(j.id);
    const pos = j.status === 'queued' ? (j.position ?? null) : null;
    if (!lastSyncedPos.has(j.id)) { lastSyncedPos.set(j.id, pos); continue; } // create wrote the initial position
    if (lastSyncedPos.get(j.id) !== pos) {
      lastSyncedPos.set(j.id, pos);
      // Only sync while the job is still queued/rendering; a terminal transition's position-null
      // is written by trackJobSettle, so we don't double-write here.
      if (j.status === 'queued' || j.status === 'rendering') trackJobPosition(j.id, pos);
    }
  }
  // Drop bookkeeping for jobs no longer in the tray (cleared / evicted) to avoid an unbounded map.
  for (const id of Array.from(lastSyncedPos.keys())) if (!alive.has(id)) lastSyncedPos.delete(id);
}

interface JobQueueState {
  jobs: Job[];
  /**
   * Server-OBSERVED jobs hydrated from `generation_jobs` (DURABLE PROGRESS). These are
   * renders that started server-side and survive a page reload — the hydration hook polls
   * GET /api/orchestrator/jobs and republishes them here so the tray shows live bars synced
   * to the DB `pct`/`current_stage`. They have no local runner (read-only in the tray).
   */
  durableJobs: Job[];
  submit: (input: SubmitInput) => string;
  cancel: (id: string) => void;
  clearFinished: () => void;
  setDurableJobs: (jobs: Job[]) => void;
  /** Active (rendering) + waiting (queued) count — for the composer's soft gate. */
  inFlight: () => number;
}

export const useJobQueue = create<JobQueueState>((set, get) => {
  const queue = new JobQueue({
    maxConcurrent: MAX_CONCURRENT_RENDERS,
    // Publish the snapshot to React AND mirror queue positions to the DB on every mutation.
    onChange: (jobs) => { set({ jobs }); syncQueuePositions(jobs); },
  });
  return {
    jobs: [],
    durableJobs: [],
    submit: (input) => {
      const id = queue.submit(input);
      // TASK 6 — CREATE THE DURABLE ROW AT THE FRONT-EDGE OF SUBMISSION (not at run-start), so a
      // job sitting in the queue survives a reload. onChange fired synchronously inside submit(),
      // so `jobs` already carries this job's admitted status + position.
      const job = get().jobs.find((j) => j.id === id);
      try { trackJobCreate(id, input.kind, input.createParams ?? {}, job?.stage ?? undefined, job?.pct ?? 0, job?.position ?? null); } catch { /* best-effort */ }
      return id;
    },
    cancel: (id) => queue.cancel(id),
    clearFinished: () => queue.clearFinished(),
    setDurableJobs: (durableJobs) => set({ durableJobs }),
    inFlight: () => get().jobs.filter((j) => j.status === 'rendering' || j.status === 'queued').length,
  };
});
