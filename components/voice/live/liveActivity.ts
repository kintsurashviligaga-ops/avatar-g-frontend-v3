/**
 * liveActivity — what Agent G is DOING during a Live voice call, as a short feed the call screen shows while it
 * happens: a web search (the queries, then the pages the answer stands on) and each tool step (prepare a studio, put
 * code on screen, open a studio), running → done / failed / cancelled.
 *
 * A voice call used to show only the orb and the captions: a search or a tool call was a few seconds of silence with
 * nothing on screen. Pure reducer + helpers (no React), so the order rules are unit-tested.
 */
import type { LiveSource } from '@/lib/voice/geminiLive';

export type LiveActivityState = 'running' | 'done' | 'failed' | 'cancelled';

export interface LiveActivityItem {
  /** Tool items: the function-call id. Search items: `search:<n>`. */
  id: string;
  kind: 'search' | 'tool';
  state: LiveActivityState;
  /** The function name (tool items). */
  name?: string;
  /** What was searched (search items). */
  queries?: string[];
  /** The pages the answer stands on (search items, once grounding arrives). */
  sources?: LiveSource[];
  /** Search items: the answer it belonged to has ended — a later grounding frame starts a new step. */
  closed?: boolean;
}

export type LiveActivityAction =
  | { type: 'searchStart'; queries: string[] }
  | { type: 'grounding'; queries: string[]; sources: LiveSource[] }
  | { type: 'toolStart'; calls: Array<{ id: string; name: string }> }
  | { type: 'toolDone'; results: Array<{ id: string; ok: boolean }> }
  | { type: 'toolCancel'; ids: string[] }
  /** The model finished (or was interrupted): a search still marked running is over. */
  | { type: 'turnEnd' }
  | { type: 'reset' };

/** The feed keeps the newest few; the screen shows them newest first. */
export const MAX_ACTIVITY = 4;

const merge = (a: readonly string[] = [], b: readonly string[] = []): string[] => [...new Set([...a, ...b])].slice(0, 4);
const mergeSources = (a: readonly LiveSource[] = [], b: readonly LiveSource[] = []): LiveSource[] => {
  const out = [...a];
  for (const s of b) if (!out.some((x) => x.uri === s.uri)) out.push(s);
  return out.slice(0, 6);
};

/** Newest LAST in state (append order); `newestFirst` flips it for display. */
export function liveActivityReducer(state: readonly LiveActivityItem[], action: LiveActivityAction): LiveActivityItem[] {
  switch (action.type) {
    case 'searchStart': {
      const last = state[state.length - 1];
      // One search step per answer: more queries for the step that is still running join it.
      if (last?.kind === 'search' && last.state === 'running') {
        return [...state.slice(0, -1), { ...last, queries: merge(last.queries, action.queries) }];
      }
      return cap([...state, { id: nextSearchId(state), kind: 'search', state: 'running', queries: merge([], action.queries) }]);
    }
    case 'grounding': {
      // The grounding of the open search step (or, with no searchStart seen, a fresh step that is already done).
      const idx = findLastIndex(state, (it) => it.kind === 'search' && it.state === 'running');
      if (idx >= 0) {
        const it = state[idx]!;
        const next = [...state];
        next[idx] = { ...it, state: 'done', queries: merge(it.queries, action.queries), sources: mergeSources(it.sources, action.sources) };
        return next;
      }
      const last = state[state.length - 1];
      // Grounding often arrives in several frames of the same answer: they join the step they belong to.
      if (last?.kind === 'search' && last.state === 'done' && !last.closed) {
        return [...state.slice(0, -1), { ...last, queries: merge(last.queries, action.queries), sources: mergeSources(last.sources, action.sources) }];
      }
      return cap([...state, { id: nextSearchId(state), kind: 'search', state: 'done', queries: merge([], action.queries), sources: mergeSources([], action.sources) }]);
    }
    case 'toolStart': {
      const fresh = action.calls
        .filter((c) => c.name && !state.some((it) => it.id === c.id && it.kind === 'tool'))
        .map((c): LiveActivityItem => ({ id: c.id, kind: 'tool', state: 'running', name: c.name }));
      return fresh.length ? cap([...state, ...fresh]) : [...state];
    }
    case 'toolDone':
      return state.map((it) => {
        const r = it.kind === 'tool' && it.state === 'running' ? action.results.find((x) => x.id === it.id) : undefined;
        return r ? { ...it, state: r.ok ? 'done' : 'failed' } : it;
      });
    case 'toolCancel':
      return state.map((it) => (it.kind === 'tool' && it.state === 'running' && action.ids.includes(it.id) ? { ...it, state: 'cancelled' } : it));
    case 'turnEnd':
      return state.map((it) => (it.kind === 'search' && !it.closed ? { ...it, state: it.state === 'running' ? 'done' : it.state, closed: true } : it));
    case 'reset':
      return [];
    default:
      return [...state];
  }
}

/** `search:<n>`, one past the highest still in the feed (ids only need to be unique within it — they are React keys). */
function nextSearchId(state: readonly LiveActivityItem[]): string {
  let max = 0;
  for (const it of state) {
    const n = it.kind === 'search' ? Number(it.id.slice('search:'.length)) : 0;
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `search:${max + 1}`;
}

function findLastIndex<T>(arr: readonly T[], pred: (v: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i]!)) return i;
  return -1;
}

function cap(items: LiveActivityItem[]): LiveActivityItem[] {
  return items.length > MAX_ACTIVITY ? items.slice(items.length - MAX_ACTIVITY) : items;
}

export function newestFirst(items: readonly LiveActivityItem[]): LiveActivityItem[] {
  return [...items].reverse();
}

/** "www.bbc.com/news/…" → "bbc.com". Never throws. */
export function sourceHost(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Grounding links from Google point at vertexaisearch.cloud.google.com redirects whose host says nothing; the title
 * Google sends is the publisher's domain then. Show the title when the URL host is that redirector.
 */
export function sourceLabel(s: LiveSource): string {
  const host = sourceHost(s.uri);
  if (!host || /(^|\.)vertexaisearch\.cloud\.google\.com$/.test(host)) return s.title || host || 'source';
  return host;
}
