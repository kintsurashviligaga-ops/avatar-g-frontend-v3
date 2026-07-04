'use client';

/**
 * DURABLE PROGRESS hook — cross-reload hydration of the JobTray.
 * =============================================================
 *
 * On mount (and on a self-scheduling interval) this fetches the authenticated user's
 * ACTIVE `generation_jobs` from GET /api/orchestrator/jobs?status=active and republishes
 * them as OBSERVED jobs in the queue store. So a page reload re-hydrates every in-flight
 * server-side render with a live bar synced to the DB `pct` + `current_stage`.
 *
 * - Read-only + free: no paid render, no writes — just a polled GET.
 * - Adaptive cadence: polls fast while renders are active, idles slow when there are none
 *   (so it still notices a render that starts in another tab / on another device).
 * - Fail-open: a network/HTTP miss keeps the last known observed jobs (never clobbers the
 *   tray with an error); a clean empty response clears them.
 */

import { useEffect, useRef } from 'react';
import { useJobQueue } from '@/store/useJobQueue';
import { mapActiveDbJobs } from '@/lib/jobs/durableJobs';
import type { GenerationJobRow } from '@/lib/orchestrator/jobs';

type Lang = 'ka' | 'en' | 'ru';

/** Poll cadence: brisk while renders are running, relaxed when idle. */
const POLL_ACTIVE_MS = 7000;
const POLL_IDLE_MS = 20000;

export function useDurableProgress(locale: Lang = 'ka'): void {
  const setDurableJobs = useJobQueue((s) => s.setDurableJobs);
  // Keep the latest locale without re-subscribing the poll loop.
  const localeRef = useRef(locale);
  localeRef.current = locale;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      let hadActive = false;
      try {
        const res = await fetch('/api/orchestrator/jobs?status=active&limit=20', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json().catch(() => ({}))) as { jobs?: GenerationJobRow[] };
        if (alive && Array.isArray(j.jobs)) {
          const observed = mapActiveDbJobs(j.jobs, localeRef.current);
          hadActive = observed.length > 0;
          setDurableJobs(observed);
        }
      } catch {
        // fail-open: keep the last known observed jobs rather than clobbering with an error.
      } finally {
        if (alive) timer = setTimeout(tick, hadActive ? POLL_ACTIVE_MS : POLL_IDLE_MS);
      }
    };
    void tick();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [setDurableJobs]);
}
