'use client';

/**
 * The browser half of the studio saga (brief D5): estimate → the user sees the price → confirm → start →
 * progress → result / refund. One hook the studio UI (Phase 3) and Agent G's plan cards (Phase 4) share, so
 * every surface follows the same money rules:
 *
 *   - `start()` refuses to run without a price the user has seen, and sends THAT price as `confirmedGel`.
 *     If the server's fresh quote differs, it answers 409 price_changed with the new price — the hook shows
 *     it and waits for another confirmation. It never retries with the new price on its own.
 *   - An estimate is superseded by the next one: a slow, older answer can never overwrite a newer price.
 *   - Polling backs off (2 s → 10 s) and stops on a terminal status or unmount.
 *
 * Error codes are the saga's machine codes; render them with describeServiceError (components/studio/ui).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface StudioPrice {
  credits: number;
  gel: number;
  display: string;
}

export interface StudioJobView {
  id: string;
  status: string;
  service: string;
  modelId: string;
  priceGel: number;
  credits: number;
  refunded: boolean;
  errorCode: string | null;
  promptOriginal: string | null;
  promptSent: string | null;
  outputUrls: string[];
  createdAt: string;
  completedAt: string | null;
}

export type GenerationPhase = 'idle' | 'estimating' | 'priced' | 'starting' | 'running' | 'done' | 'failed' | 'canceled';

export interface GenerationState {
  phase: GenerationPhase;
  price: StudioPrice | null;
  job: StudioJobView | null;
  errorCode: string | null;
  issues: Array<{ path: string; message: string }>;
}

const INITIAL: GenerationState = { phase: 'idle', price: null, job: null, errorCode: null, issues: [] };
const TERMINAL = new Set(['completed', 'failed', 'nsfw', 'canceled']);

export interface UseStudioGenerationOptions {
  fetchImpl?: typeof fetch;
  /** First poll delay; doubles up to maxPollMs. */
  pollMs?: number;
  maxPollMs?: number;
}

type Json = Record<string, unknown>;

export function useStudioGeneration(opts: UseStudioGenerationOptions = {}) {
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const pollMs = opts.pollMs ?? 2_000;
  const maxPollMs = opts.maxPollMs ?? 10_000;

  const [state, setState] = useState<GenerationState>(INITIAL);
  const estimateSeq = useRef(0);
  const estimateAbort = useRef<AbortController | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      estimateAbort.current?.abort();
    };
  }, []);

  const set = useCallback((patch: Partial<GenerationState>) => {
    if (mounted.current) setState((s) => ({ ...s, ...patch }));
  }, []);

  const readJson = async (res: Response): Promise<Json> => {
    try { return (await res.json()) as Json; } catch { return {}; }
  };
  const errorOf = (j: Json, fallback: string) => (typeof j.error === 'string' ? j.error : fallback);
  const issuesOf = (j: Json) => (Array.isArray(j.issues) ? (j.issues as GenerationState['issues']) : []);

  /** Price for these params. Supersedes any estimate still in flight. */
  const estimate = useCallback(async (modelId: string, params: Json): Promise<StudioPrice | null> => {
    const seq = ++estimateSeq.current;
    estimateAbort.current?.abort();
    const ac = new AbortController();
    estimateAbort.current = ac;
    set({ phase: 'estimating', errorCode: null, issues: [] });
    try {
      const res = await doFetch('/api/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, params }),
        signal: ac.signal,
      });
      const j = await readJson(res);
      if (seq !== estimateSeq.current) return null; // a newer estimate owns the screen
      if (!res.ok) {
        set({ phase: 'idle', price: null, errorCode: errorOf(j, 'provider_unavailable'), issues: issuesOf(j) });
        return null;
      }
      const price = j.price as StudioPrice;
      set({ phase: 'priced', price });
      return price;
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError' || seq !== estimateSeq.current) return null;
      set({ phase: 'idle', price: null, errorCode: 'provider_unavailable' });
      return null;
    }
  }, [doFetch, set]);

  const poll = useCallback((jobId: string, delay: number) => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(async () => {
      if (!mounted.current) return;
      let next = Math.min(delay * 2, maxPollMs);
      try {
        const res = await doFetch(`/api/generate/${jobId}`, { cache: 'no-store' });
        const j = await readJson(res);
        if (res.ok && j.job) {
          const job = j.job as StudioJobView;
          if (TERMINAL.has(job.status)) {
            set({
              job,
              phase: job.status === 'completed' ? 'done' : job.status === 'canceled' ? 'canceled' : 'failed',
              errorCode: job.status === 'completed' ? null : job.errorCode ?? 'generation_failed',
            });
            return;
          }
          set({ job, phase: 'running' });
        } else if (res.status === 404 || res.status === 401) {
          set({ phase: 'failed', errorCode: errorOf(j, 'not_found') });
          return;
        }
      } catch {
        next = Math.min(delay * 2, maxPollMs); // a network blip: keep polling, a little slower
      }
      poll(jobId, next);
    }, delay);
  }, [doFetch, maxPollMs, set]);

  /**
   * Start a generation at the price the user saw. Resolves to the job, or null when the server needs a new
   * confirmation (price_changed) or refused (insufficient credits, invalid input…) — see `state`.
   */
  const start = useCallback(async (modelId: string, params: Json, promptOriginal?: string): Promise<StudioJobView | null> => {
    const confirmed = state.price;
    if (!confirmed) {
      set({ errorCode: 'confirmation_required' });
      return null;
    }
    set({ phase: 'starting', errorCode: null, issues: [] });
    try {
      const res = await doFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, params, confirmedGel: confirmed.gel, promptOriginal }),
      });
      const j = await readJson(res);
      if (res.status === 202 && j.job) {
        const job = j.job as StudioJobView;
        set({ phase: TERMINAL.has(job.status) ? (job.status === 'completed' ? 'done' : 'failed') : 'running', job, errorCode: job.errorCode });
        if (!TERMINAL.has(job.status)) poll(job.id, pollMs);
        return job;
      }
      const code = errorOf(j, 'provider_unavailable');
      // price_changed / confirmation_required: show the NEW price and wait for the user — never auto-accept.
      const newPrice = (j.price as StudioPrice | undefined) ?? null;
      set({
        phase: newPrice ? 'priced' : 'idle',
        price: code === 'price_changed' || code === 'confirmation_required' ? newPrice : state.price,
        errorCode: code,
        issues: issuesOf(j),
      });
      return null;
    } catch {
      // The request may or may not have reached the server. Never re-send it from here — a retry could
      // charge twice. The job (if it exists) appears in the Library / job list.
      set({ phase: 'failed', errorCode: 'provider_unavailable' });
      return null;
    }
  }, [doFetch, poll, pollMs, set, state.price]);

  /** Cancel while the provider has not started. */
  const cancel = useCallback(async (): Promise<boolean> => {
    const id = state.job?.id;
    if (!id) return false;
    try {
      const res = await doFetch(`/api/generate/${id}`, { method: 'DELETE' });
      const j = await readJson(res);
      if (res.ok && j.job) {
        if (pollTimer.current) clearTimeout(pollTimer.current);
        set({ job: j.job as StudioJobView, phase: 'canceled', errorCode: null });
        return true;
      }
      set({ errorCode: errorOf(j, 'cannot_cancel') });
      return false;
    } catch {
      set({ errorCode: 'cannot_cancel' });
      return false;
    }
  }, [doFetch, set, state.job?.id]);

  const reset = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    estimateAbort.current?.abort();
    estimateSeq.current++;
    set(INITIAL);
  }, [set]);

  return { state, estimate, start, cancel, reset };
}
