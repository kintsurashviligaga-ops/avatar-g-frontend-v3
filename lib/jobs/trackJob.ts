'use client';

/**
 * DURABLE PROGRESS — write-side client tracker.
 * =============================================
 *
 * Thin fire-and-forget POSTs to /api/orchestrator/jobs that persist a local composer job's
 * lifecycle into `generation_jobs` (row id === the tray jobId, so the hydration poll dedupes
 * it). Called at each state transition (create → update → complete|fail) so a mid-render
 * reload finds the correct baseline already in the DB.
 *
 * STRICTLY best-effort + additive: every call swallows its own errors and NEVER blocks or
 * throws into the render/billing path. `keepalive` lets a completion POST fired right before
 * navigation still flush.
 */

import type { JobKind } from './jobQueue';

type TrackOp = 'create' | 'update' | 'complete' | 'fail';

interface TrackPayload {
  op: TrackOp;
  id: string;
  kind?: JobKind;
  stage?: string;
  pct?: number;
  url?: string;
  error?: string;
  params?: Record<string, unknown>;
}

function post(payload: TrackPayload): void {
  try {
    void fetch('/api/orchestrator/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    /* never let telemetry break a render */
  }
}

/** Insert the placeholder row (pending) the instant a job is triggered. */
export function trackJobCreate(id: string, kind: JobKind, params?: Record<string, unknown>, stage?: string, pct?: number): void {
  post({ op: 'create', id, kind, params, stage, pct });
}

/** Sync a mid-flight progress change (→ processing). */
export function trackJobUpdate(id: string, stage: string | null | undefined, pct: number): void {
  post({ op: 'update', id, stage: stage ?? undefined, pct });
}

/** Mark the row completed (pct 100) + attach the final URL. */
export function trackJobComplete(id: string, url?: string | null): void {
  post({ op: 'complete', id, url: url ?? undefined });
}

/** Mark the row failed with a short reason. */
export function trackJobFail(id: string, error?: string): void {
  post({ op: 'fail', id, error: error ?? undefined });
}
