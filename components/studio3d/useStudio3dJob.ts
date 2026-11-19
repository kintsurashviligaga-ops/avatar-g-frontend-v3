'use client';
/**
 * components/studio3d/useStudio3dJob.ts — create / poll / approve / cancel a 3D Studio job through /api/studio3d.
 * Polls every 3 s while the job is moving (2 s → 5 s back-off after a network miss), stops at done / failed /
 * awaiting_approval. `fetchImpl` is injectable for tests.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobView } from '@/lib/studio3d/server/service';

const MOVING = ['check', 'reference', 'queued', 'starting', 'shape', 'texture', 'export'];

export type Studio3dClientState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'job'; job: JobView }
  | { status: 'error'; code: string; message?: string };

type F = typeof fetch;

export function useStudio3dJob(initialJob?: JobView, fetchImpl: F = (...a) => fetch(...a), pollMs = 3000) {
  const [state, setState] = useState<Studio3dClientState>(initialJob ? { status: 'job', job: initialJob } : { status: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const handle = useCallback(async (res: Response) => {
    const body = (await res.json().catch(() => ({}))) as JobView & { error?: string; message?: string };
    if (!alive.current) return;
    if (!res.ok || !body.ok) setState({ status: 'error', code: body.error || `http_${res.status}`, ...(body.message ? { message: body.message } : {}) });
    else setState({ status: 'job', job: body });
  }, []);

  const create = useCallback(async (request: Record<string, unknown>) => {
    setState({ status: 'sending' });
    try {
      await handle(await fetchImpl('/api/studio3d', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) }));
    } catch {
      setState({ status: 'error', code: 'network' });
    }
  }, [fetchImpl, handle]);

  const act = useCallback(async (id: string, action: 'approve' | 'cancel') => {
    try {
      await handle(await fetchImpl(`/api/studio3d/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) }));
    } catch {
      setState({ status: 'error', code: 'network' });
    }
  }, [fetchImpl, handle]);

  const job = state.status === 'job' ? state.job : null;
  useEffect(() => {
    if (!job || !MOVING.includes(job.step)) return;
    let delay = pollMs;
    const tick = async () => {
      try {
        const res = await fetchImpl(`/api/studio3d/${job.id}`, { cache: 'no-store' });
        if (res.ok) return handle(res);
        delay = Math.min(delay * 2, 15_000);
      } catch {
        delay = Math.min(delay * 2, 15_000);
      }
      if (alive.current) timer.current = setTimeout(tick, delay);
    };
    timer.current = setTimeout(tick, delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [job, fetchImpl, handle, pollMs]);

  return { state, create, approve: (id: string) => act(id, 'approve'), cancel: (id: string) => act(id, 'cancel') };
}
