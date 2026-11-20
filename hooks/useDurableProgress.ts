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
 * - Signed-out visitors: a 401 means nobody is signed in, so the next try waits 5 minutes instead of 20 seconds (every
 *   anonymous visitor used to cost one function call + one auth lookup every 20 s, forever). Focusing the window after
 *   a 401 tries again at once, so a fresh sign-in still hydrates the tray quickly.
 * - A hidden tab skips the request and keeps its schedule.
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
/** After a 401 (signed out): try again rarely; a window focus retries at once. */
export const POLL_SIGNED_OUT_MS = 5 * 60_000;

/** The wait before the next poll. Pure, for the test. */
export function nextPollDelay(o: { status: number | null; hadActive: boolean }): number {
  if (o.status === 401) return POLL_SIGNED_OUT_MS;
  return o.hadActive ? POLL_ACTIVE_MS : POLL_IDLE_MS;
}

export function useDurableProgress(locale: Lang = 'ka'): void {
  const setDurableJobs = useJobQueue((s) => s.setDurableJobs);
  // Keep the latest locale without re-subscribing the poll loop.
  const localeRef = useRef(locale);
  localeRef.current = locale;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastStatus: number | null = null;

    const schedule = (ms: number) => {
      if (!alive) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };

    const tick = async () => {
      let hadActive = false;
      // A background tab needs no fresh bars; keep the schedule and ask again when the timer fires.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        schedule(nextPollDelay({ status: lastStatus, hadActive: false }));
        return;
      }
      try {
        const res = await fetch(`${TASKS_ROUTE}?active=1&limit=20`, {
          credentials: 'include',
          cache: 'no-store',
        });
        lastStatus = res.status;
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
        schedule(nextPollDelay({ status: lastStatus, hadActive }));
      }
    };
    void tick();

    // Signed out on the last try → a sign-in (ChatChrome flips <html data-authed> to "1") or a window focus (back from
    // the Google popup) asks again now instead of in 5 minutes.
    const retryIfSignedOut = () => { if (lastStatus === 401) void tick(); };
    let mo: MutationObserver | null = null;
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', retryIfSignedOut);
      if (typeof MutationObserver !== 'undefined') {
        const el = document.documentElement;
        mo = new MutationObserver(() => { if (el.dataset.authed === '1') retryIfSignedOut(); });
        mo.observe(el, { attributes: true, attributeFilter: ['data-authed'] });
      }
    }

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      if (typeof window !== 'undefined') window.removeEventListener('focus', retryIfSignedOut);
      mo?.disconnect();
    };
  }, [setDurableJobs]);
}
