'use client';

/**
 * DURABLE PROGRESS hook — cross-reload hydration of the JobTray.
 * =============================================================
 *
 * On mount (and on a self-scheduling interval) this reads the signed-in user's LIVE tasks from the one task route,
 * GET /api/tasks?active=1 (lib/tasks: every generation_jobs row in one shape, whatever runs it), and republishes them
 * as OBSERVED jobs in the queue store. So a page reload re-hydrates every in-flight server-side job, a studio render
 * or an Agent G montage / audio extraction alike, with a live bar synced to the task's stage and percent.
 *
 * - Read-only + free: no paid render, no writes — just a polled GET. (Reading a lease job is also what wakes a
 *   worker for it when none holds it, server-side and only while AGENT_G_MEDIA_EXEC is open.)
 * - Adaptive cadence: polls fast while jobs are live, idles slow when there are none
 *   (so it still notices a job that starts in another tab / on another device).
 * - Fail-open: a network/HTTP miss (a signed-out 401, a 429) keeps the last known observed jobs (never clobbers the
 *   tray with an error); a clean empty response clears them.
 */

import { useEffect, useRef } from 'react';
import { useJobQueue } from '@/store/useJobQueue';
import { mapActiveTasks } from '@/lib/jobs/durableJobs';
import { TASKS_ROUTE } from '@/lib/agent/media/jobFollow';
import type { TaskView } from '@/lib/tasks/taskView';

type Lang = 'ka' | 'en' | 'ru';

/** Poll cadence: brisk while jobs are running, relaxed when idle. */
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
        const res = await fetch(`${TASKS_ROUTE}?active=1&limit=20`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; tasks?: TaskView[] };
        if (alive && j.ok === true && Array.isArray(j.tasks)) {
          const observed = mapActiveTasks(j.tasks, localeRef.current);
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
