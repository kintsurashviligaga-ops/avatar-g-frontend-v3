/**
 * components/studio/research/store.ts — ONE module-level store for the whole Deep Research surface, read with
 * useSyncExternalStore. The composer's „+" sheet, the thread cards (OmniStudio), the host's sheets and toasts (ChatChrome)
 * and the sidebar row share no React provider, so they share this: the capability answer, the jobs the server reported, and
 * which sheet is open.
 *
 * THE SERVER IS THE SOURCE OF TRUTH. Nothing here persists a job: a reload re-reads GET /api/research. The only thing kept
 * in localStorage is the "already told you" id list (watcher.ts), so one finished job toasts once.
 *
 * `researchActions` are plain functions (callable from event handlers and from other modules); `useResearch*` are the hooks.
 */
import { useSyncExternalStore } from 'react';
import { isActiveResearchStatus, type ResearchJobPublic } from '@/lib/research/types';
import { fetchCapabilities, type ResearchCaps } from './api';
import { claimNotification, markNotified, mergeJob, planToasts } from './watcher';

export type ResearchToast =
  | { id: string; kind: 'ready' | 'failed'; jobId: string }
  | { id: string; kind: 'info'; key: 'started' | 'liveOff' };

export interface ResearchState {
  caps: ResearchCaps | null;
  capsLoaded: boolean;
  jobs: Record<string, ResearchJobPublic>;
  listLoaded: boolean;
  toasts: ResearchToast[];
  /** The start-confirmation sheet, with the question it opens on. */
  start: { prompt: string } | null;
  /** The job whose report is open. */
  viewer: string | null;
  list: boolean;
  connectors: boolean;
  /** A Live call about this report is open. */
  live: { id: string; returnToViewer: boolean } | null;
}

const INITIAL: ResearchState = {
  caps: null,
  capsLoaded: false,
  jobs: {},
  listLoaded: false,
  toasts: [],
  start: null,
  viewer: null,
  list: false,
  connectors: false,
  live: null,
};

let state: ResearchState = INITIAL;
const listeners = new Set<() => void>();
const seen = new Set<string>();
let toastSeq = 0;
let capsPromise: Promise<void> | null = null;
let capsFailedAt = 0;

const emit = () => listeners.forEach((l) => l());
function set(patch: Partial<ResearchState> | ((s: ResearchState) => Partial<ResearchState>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  emit();
}

export const getResearchState = (): ResearchState => state;
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};
/** For non-React readers (the watcher) — same subscription the hooks use. */
export const subscribeResearch = subscribe;

/** Read a slice. The selector must return a primitive or a reference that only changes when the slice does. */
export function useResearchSelector<T>(sel: (s: ResearchState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(INITIAL));
}
export const useResearchState = (): ResearchState => useSyncExternalStore(subscribe, () => state, () => INITIAL);
/** True only when the server said Deep Research is usable here. Unknown / off / failed → false: nothing is shown. */
export const useResearchAvailable = (): boolean => useResearchSelector((s) => s.caps?.available === true);
export const useResearchJob = (id: string | null | undefined): ResearchJobPublic | undefined => useResearchSelector((s) => (id ? s.jobs[id] : undefined));

const RETRY_CAPS_MS = 60_000;

export const researchActions = {
  /** Ask the server once whether the feature exists here (cached; a failed probe is retried after a minute). */
  ensureCapabilities(): Promise<void> {
    if (state.capsLoaded) return Promise.resolve();
    if (capsPromise) return capsPromise;
    if (capsFailedAt && Date.now() - capsFailedAt < RETRY_CAPS_MS) return Promise.resolve();
    capsPromise = fetchCapabilities().then((caps) => {
      capsPromise = null;
      if (caps) { capsFailedAt = 0; set({ caps, capsLoaded: true }); }
      else capsFailedAt = Date.now();
    });
    return capsPromise;
  },

  /** The price changed under the user (409 price_changed): show the server's number from now on. */
  setCredits(credits: number): void {
    if (!state.caps || credits <= 0) return;
    set({ caps: { ...state.caps, credits } });
  },
  markUnavailable(): void {
    set({ caps: { available: false, credits: state.caps?.credits ?? 0, filesAvailable: false, maxActive: state.caps?.maxActive ?? 1 }, capsLoaded: true });
  },

  /** A different person is signed in (or nobody): nothing of the previous account may stay on screen or in memory. */
  resetUser(): void {
    set({ jobs: {}, listLoaded: false, toasts: [], start: null, viewer: null, list: false, connectors: false, live: null });
  },

  upsertJob(job: ResearchJobPublic): void {
    set((s) => ({ jobs: { ...s.jobs, [job.id]: mergeJob(s.jobs[job.id], job) } }));
  },

  /**
   * A list read arrived. Merge it, and — when `announce` — claim and queue a toast for each newly settled job.
   * A job that settled while nobody watched is announced on the first read after the user returns.
   */
  ingestList(items: ResearchJobPublic[], opts: { announce?: boolean } = {}): void {
    const nextJobs = { ...state.jobs };
    for (const j of items) nextJobs[j.id] = mergeJob(nextJobs[j.id], j);
    const patch: Partial<ResearchState> = { jobs: nextJobs, listLoaded: true };
    if (opts.announce) {
      const plan = planToasts(items, (id) => seen.has(id), Date.now());
      for (const id of plan.silent) markNotified(id, seen);
      const fresh = plan.toasts.filter((t) => claimNotification(t.jobId, seen));
      if (fresh.length > 0) {
        const added: ResearchToast[] = fresh.map((t) => ({ id: `t${++toastSeq}`, kind: t.kind, jobId: t.jobId }));
        patch.toasts = [...state.toasts, ...added].slice(-3);
      }
    }
    set(patch);
  },

  /** The user saw this job's outcome themselves (opened the report): it must not toast later. */
  noteSeen(id: string): void {
    markNotified(id, seen);
    const t = state.toasts.filter((x) => !('jobId' in x && x.jobId === id));
    if (t.length !== state.toasts.length) set({ toasts: t });
  },

  pushInfo(key: 'started' | 'liveOff'): void {
    set((s) => ({ toasts: [...s.toasts, { id: `t${++toastSeq}`, kind: 'info' as const, key }].slice(-3) }));
  },
  dismissToast(id: string): void {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  openStart(prompt = ''): void {
    set({ start: { prompt: prompt.slice(0, 4000) }, list: false });
  },
  closeStart(): void {
    set({ start: null });
  },
  openViewer(id: string): void {
    researchActions.noteSeen(id);
    set({ viewer: id, list: false });
  },
  closeViewer(): void {
    set({ viewer: null });
  },
  openList(): void {
    set({ list: true });
  },
  closeList(): void {
    set({ list: false });
  },
  openConnectors(): void {
    set({ connectors: true, list: false });
  },
  closeConnectors(): void {
    set({ connectors: false });
  },
  /** Open the Live call about a finished report. The report viewer steps aside (one dialog at a time) and returns after. */
  openLive(id: string): void {
    set((s) => ({ live: { id, returnToViewer: s.viewer === id }, viewer: null }));
  },
  closeLive(): void {
    set((s) => ({ live: null, viewer: s.live?.returnToViewer ? s.live.id : s.viewer }));
  },

  /** A start succeeded: remember the job, close the sheet, say so, and tell the thread (OmniStudio listens). */
  jobStarted(job: ResearchJobPublic, prompt: string): void {
    set((s) => ({ jobs: { ...s.jobs, [job.id]: mergeJob(s.jobs[job.id], job) }, start: null }));
    researchActions.pushInfo('started');
    try {
      window.dispatchEvent(new CustomEvent('research:started', { detail: { job, prompt } }));
    } catch {
      /* SSR */
    }
  },
};

export const hasActiveJob = (s: ResearchState = state): boolean => Object.values(s.jobs).some((j) => isActiveResearchStatus(j.status));

/** Test hook: back to a blank store. */
export function resetResearchStoreForTests(): void {
  state = INITIAL;
  seen.clear();
  toastSeq = 0;
  capsPromise = null;
  capsFailedAt = 0;
  emit();
}
