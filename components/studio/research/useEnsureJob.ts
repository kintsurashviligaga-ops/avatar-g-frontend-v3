'use client';

/**
 * useEnsureJob — a surface that names a job by id (a thread card after a reload, the viewer opened from a toast) needs that
 * job in the store. The list read the watcher makes covers the newest 20; this fetches ONE job that is not there yet, and
 * remembers a 404 so a card for a deleted job does not ask again on every render. A transient failure is retried at most
 * every 15 s (a later render, a re-open) — never in a tight loop.
 *
 * The result goes to the module store, not to this component, so it survives React Strict Mode's mount → unmount → mount.
 */
import { useEffect, useState } from 'react';
import { fetchJob } from './api';
import { researchActions, useResearchJob } from './store';

const inflight = new Set<string>();
const failedAt = new Map<string, number>();
const missing = new Set<string>();
const RETRY_MS = 15_000;

export const isJobMissing = (id: string): boolean => missing.has(id);

export function useEnsureJob(id: string | null | undefined, opts: { needReport?: boolean } = {}) {
  const job = useResearchJob(id);
  const [, bump] = useState(0);
  const hasReport = job?.report !== undefined && job?.report !== null;
  const need = !!id && !missing.has(id) && (!job || (opts.needReport === true && job.status === 'completed' && !hasReport));
  useEffect(() => {
    if (!id || !need) return;
    const key = `${id}:${opts.needReport ? 'full' : 'row'}`;
    if (inflight.has(key)) return;
    const last = failedAt.get(key);
    if (last && Date.now() - last < RETRY_MS) return;
    inflight.add(key);
    void fetchJob(id).then((r) => {
      inflight.delete(key);
      if (r.ok) researchActions.upsertJob(r.job);
      else if (r.notFound) missing.add(id);
      else failedAt.set(key, Date.now());
      bump((n) => n + 1);
    });
  }, [id, need, opts.needReport]);
  return { job, missing: !!id && missing.has(id) && !job };
}

/** Test hook. */
export function resetEnsureJobForTests(): void {
  inflight.clear();
  failedAt.clear();
  missing.clear();
}
