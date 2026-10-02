/**
 * components/studio/research/watcher.ts — the pure rules of the ResearchWatcher: when to ask the server again, which settled
 * jobs deserve a toast, and the "already told you" memory that keeps one job from toasting twice. No React, no fetch —
 * ResearchHost wires these to timers and the store, and watcher.test.ts pins them.
 *
 * THE SERVER OWNS THE JOB. Closing the tab or locking the phone loses nothing: the cron sweeper (/api/cron/research-sweep) polls
 * the provider and stores the report, and the first list read after the user comes back finds it. The watcher only has to be
 * sparing while someone is looking: poll while a job is active and the page is visible, back off on failure, sleep otherwise.
 */
import { isActiveResearchStatus, isTerminalResearchStatus, type ResearchJobPublic } from '@/lib/research/types';

/** Where the "already notified" ids live. Ids are UUIDs, so one browser's accounts cannot collide. */
export const NOTIFIED_KEY = 'myavatar:research:notified:v1';
/** A job that settled longer ago than this is history, not news: it never toasts (it is marked seen silently). */
export const TOAST_MAX_AGE_MS = 24 * 60 * 60_000;
const SEEN_MAX = 200;

export const POLL_FAST_MS = 20_000;
export const POLL_MID_MS = 30_000;
export const POLL_SLOW_MS = 60_000;
export const POLL_MAX_BACKOFF_MS = 5 * 60_000;
/** A page that comes back to the foreground re-reads at once — unless it just did. */
export const WAKE_MIN_GAP_MS = 3_000;

export const activeJobs = (jobs: readonly ResearchJobPublic[]): ResearchJobPublic[] => jobs.filter((j) => isActiveResearchStatus(j.status));

/**
 * Milliseconds until the next read, or `null` for "do not schedule one" (nothing is running, the page is hidden, or the
 * session is gone). The cadence follows the age of the OLDEST active job: a fresh job is likelier to finish in the next
 * minute than one that has run for forty. Each consecutive failure doubles the wait, up to five minutes.
 */
export function nextPollDelayMs(input: { jobs: readonly ResearchJobPublic[]; nowMs: number; failures: number; hidden: boolean; unauthorized?: boolean }): number | null {
  if (input.hidden || input.unauthorized) return null;
  const active = activeJobs(input.jobs);
  if (active.length === 0) return null;
  const oldest = Math.max(...active.map((j) => input.nowMs - (Date.parse(j.startedAt ?? j.createdAt) || input.nowMs)));
  const base = oldest < 5 * 60_000 ? POLL_FAST_MS : oldest < 20 * 60_000 ? POLL_MID_MS : POLL_SLOW_MS;
  const backoff = Math.min(POLL_MAX_BACKOFF_MS, base * 2 ** Math.max(0, Math.min(6, input.failures)));
  return Math.max(base, backoff);
}

/** Should a wake-up (focus, visibility, back online) read now? */
export function shouldWakeRead(input: { lastReadAtMs: number; nowMs: number; hidden: boolean; online: boolean }): boolean {
  return !input.hidden && input.online && input.nowMs - input.lastReadAtMs >= WAKE_MIN_GAP_MS;
}

// ─── the "already told you" memory ───────────────────────────────────────────────────────────────────────────

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const safeStorage = (): StorageLike | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export function loadNotified(storage: StorageLike | null = safeStorage()): string[] {
  try {
    const raw = storage?.getItem(NOTIFIED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(-SEEN_MAX) : [];
  } catch {
    return [];
  }
}

export function saveNotified(ids: readonly string[], storage: StorageLike | null = safeStorage()): void {
  try {
    storage?.setItem(NOTIFIED_KEY, JSON.stringify(ids.slice(-SEEN_MAX)));
  } catch {
    /* private mode / quota — the in-memory set still dedupes this session */
  }
}

/**
 * Claim the right to tell the user about `id`: true exactly once per id. It RE-READS storage, so a second tab that polled
 * a moment later finds the first tab's claim and stays quiet.
 */
export function claimNotification(id: string, memory: Set<string>, storage: StorageLike | null = safeStorage()): boolean {
  if (memory.has(id)) return false;
  const stored = loadNotified(storage);
  for (const s of stored) memory.add(s);
  if (memory.has(id)) return false;
  memory.add(id);
  saveNotified([...stored, id], storage);
  return true;
}

/** Mark an id seen without announcing it (the user opened the report themselves, or it is old news). */
export function markNotified(id: string, memory: Set<string>, storage: StorageLike | null = safeStorage()): void {
  if (memory.has(id)) return;
  memory.add(id);
  saveNotified([...loadNotified(storage).filter((x) => x !== id), id], storage);
}

export type ToastKind = 'ready' | 'failed';
export interface PlannedToast {
  jobId: string;
  kind: ToastKind;
}

/**
 * Which settled jobs should toast NOW. A completed job with a report → 'ready'; a failed one → 'failed'; a job the user
 * cancelled never toasts (they know). Jobs already claimed, and jobs older than TOAST_MAX_AGE_MS, are skipped; the old ones
 * come back in `silent` so the caller can mark them seen and never reconsider them.
 */
export function planToasts(
  jobs: readonly ResearchJobPublic[],
  isSeen: (id: string) => boolean,
  nowMs: number,
): { toasts: PlannedToast[]; silent: string[] } {
  const toasts: PlannedToast[] = [];
  const silent: string[] = [];
  for (const j of jobs) {
    if (!isTerminalResearchStatus(j.status) || isSeen(j.id)) continue;
    if (j.status === 'canceled') {
      silent.push(j.id);
      continue;
    }
    const settledAt = Date.parse(j.completedAt ?? j.createdAt);
    if (Number.isFinite(settledAt) && nowMs - settledAt > TOAST_MAX_AGE_MS) {
      silent.push(j.id);
      continue;
    }
    if (j.status === 'completed') {
      if (j.hasReport) toasts.push({ jobId: j.id, kind: 'ready' });
      else toasts.push({ jobId: j.id, kind: 'failed' });
    } else toasts.push({ jobId: j.id, kind: 'failed' });
  }
  return { toasts, silent };
}

/**
 * Merge a fresh job into what the store holds. The LIST omits the report and the sources; a job already read in full keeps
 * them, as long as it is still the same completed job.
 */
export function mergeJob(prev: ResearchJobPublic | undefined, next: ResearchJobPublic): ResearchJobPublic {
  if (!prev) return next;
  if (next.report === undefined && prev.report !== undefined && next.status === 'completed' && prev.status === 'completed') {
    return { ...next, report: prev.report, sources: next.sources ?? prev.sources };
  }
  return next;
}

/** Newest first. */
export function sortJobs(jobs: readonly ResearchJobPublic[]): ResearchJobPublic[] {
  return [...jobs].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}
