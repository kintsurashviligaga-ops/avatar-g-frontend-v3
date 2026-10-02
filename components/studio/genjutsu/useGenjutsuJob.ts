'use client';

/**
 * useGenjutsuJob — one VFX job from "the server accepted it" to "the video is here" (or "it failed and here is what
 * happened to your credits"). It polls GET /api/genjutsu/status SEQUENTIALLY — each answer is awaited before the next
 * request goes out, so a slow finalizing poll never overlaps another — and it survives the panel unmounting:
 *
 * ⚠️ A PAID JOB MUST NOT VANISH WITH ITS PANEL. Switching to another tool unmounts this panel; the render carries on
 * server-side and lands in the Library, but a user who comes back to an empty panel would think the credits were lost.
 * The running job's id (an opaque, signed token — no secret) is kept in sessionStorage and resumed on mount. Storage is
 * a convenience: every access is wrapped, and the panel is correct without it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { describeGenerationFailure } from '@/components/studio/ui/serviceError';
import type { GenjutsuAspect, GenjutsuOp } from '@/lib/genjutsu/types';
import { fetchStatus } from './api';

export type JobView =
  | { phase: 'idle' }
  | { phase: 'running'; jobId: string; state: string; startedAt: number; op: GenjutsuOp; aspect: GenjutsuAspect | '16:9' | '9:16'; credits: number }
  | { phase: 'ready'; videoUrl: string; op: GenjutsuOp; aspect: string; credits: number }
  | { phase: 'failed'; message: string; refunded: boolean }
  | { phase: 'stalled' };

export interface JobMeta { jobId: string; op: GenjutsuOp; aspect: string; credits: number }

const KEY = 'myavatar-vfx-job';
/** Past this the client stops waiting (the server's own cap refunds or delivers independently). */
export const MAX_WAIT_MS = 25 * 60_000;
const FIRST_POLL_MS = 2_500;
const POLL_MS: Record<GenjutsuOp, number> = { scene: 4_000, motion: 6_000, swap: 6_000 };

interface Saved { jobId: string; op: GenjutsuOp; aspect: string; credits: number; startedAt: number }

const store = {
  read(): Saved | null {
    try {
      const raw = window.sessionStorage.getItem(KEY);
      const v = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
      if (!v || typeof v.jobId !== 'string' || (v.op !== 'scene' && v.op !== 'motion' && v.op !== 'swap') || typeof v.startedAt !== 'number') return null;
      return Date.now() - v.startedAt < MAX_WAIT_MS ? { jobId: v.jobId, op: v.op, aspect: String(v.aspect ?? '16:9'), credits: Number(v.credits) || 0, startedAt: v.startedAt } : null;
    } catch {
      return null;
    }
  },
  write(s: Saved | null) {
    try {
      if (s) window.sessionStorage.setItem(KEY, JSON.stringify(s));
      else window.sessionStorage.removeItem(KEY);
    } catch {
      /* private mode / blocked storage — the job still runs and lands in the Library */
    }
  },
};

export function useGenjutsuJob(locale: string, onSettled?: () => void) {
  const [job, setJob] = useState<JobView>({ phase: 'idle' });
  const settled = useRef(onSettled);
  settled.current = onSettled;

  // Resume a job this tab started before the panel unmounted.
  useEffect(() => {
    const s = store.read();
    if (s) setJob({ phase: 'running', jobId: s.jobId, state: 'processing', startedAt: s.startedAt, op: s.op, aspect: s.aspect as GenjutsuAspect, credits: s.credits });
  }, []);

  const begin = useCallback((m: JobMeta) => {
    const startedAt = Date.now();
    store.write({ ...m, startedAt });
    setJob({ phase: 'running', jobId: m.jobId, state: 'processing', startedAt, op: m.op, aspect: m.aspect as GenjutsuAspect, credits: m.credits });
  }, []);

  const reset = useCallback(() => {
    store.write(null);
    setJob({ phase: 'idle' });
  }, []);

  const runningId = job.phase === 'running' ? job.jobId : null;
  useEffect(() => {
    if (!runningId) return;
    const cur = job as Extract<JobView, { phase: 'running' }>;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const res = await fetchStatus(cur.jobId);
      if (cancelled) return;
      if (res.ok && res.done) {
        store.write(null);
        if (res.state === 'ready') setJob({ phase: 'ready', videoUrl: res.videoUrl, op: cur.op, aspect: cur.aspect, credits: cur.credits });
        else setJob({ phase: 'failed', message: describeGenerationFailure({ success: false, error: res.error ?? 'generation_failed', refunded: res.refunded }, locale, ''), refunded: res.refunded });
        settled.current?.();
        return;
      }
      // The job is not (or no longer) ours — a signed-out tab, a vanished row. Stop; never loop on a 401/404.
      if (!res.ok && (res.status === 401 || res.status === 404)) {
        store.write(null);
        setJob({ phase: 'failed', message: describeGenerationFailure({ error: res.status === 401 ? 'unauthorized' : 'generation_failed' }, locale, ''), refunded: false });
        return;
      }
      if (Date.now() - cur.startedAt > MAX_WAIT_MS) {
        store.write(null);
        setJob({ phase: 'stalled' });
        return;
      }
      // A network blip or a 5xx is not the job failing: the server carries on, so keep waiting.
      if (res.ok && !res.done) setJob((j) => (j.phase === 'running' && j.state !== res.state ? { ...j, state: res.state } : j));
      timer = setTimeout(tick, POLL_MS[cur.op]);
    };

    timer = setTimeout(tick, FIRST_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // The loop is keyed on the job id alone: a state label change must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningId, locale]);

  return { job, begin, reset };
}
