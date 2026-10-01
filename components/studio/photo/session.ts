/**
 * The culling session — the photos, their P / X / U status and grade, and what the assistant measured — held in a
 * small external store rather than in PhotoWorkspace's state.
 *
 * ⚠️ IT OUTLIVES THE WORKSPACE ON PURPOSE. OmniStudio unmounts the workspace whenever another tool is picked (the
 * sidebar, the „+" sheet, a deep link). Component state would throw away an hour of culling on one stray tap; a
 * module store keeps the session for the life of the page, and analysis that finishes while the workspace is closed
 * still lands. Nothing is persisted: a reload starts empty (the page warns before one while there are ratings or
 * grades that were never exported), because the photos are the user's files and never leave the device.
 *
 * ⚠️ BECAUSE IT OUTLIVES THE WORKSPACE, SO MUST ITS GUARDS (bindSessionToPage). The reload warning cannot live in a
 * PhotoWorkspace effect — back in the chat, with the workspace unmounted, a reload would silently drop the session
 * — and a sign-out must empty it, or the next person in the tab (a guest included) opens the previous user's shoot.
 */
import { groupBursts, verdict, type BurstInfo, type CullVerdict, type PhotoMetrics } from '@/lib/photo/cullMetrics';
import { NEUTRAL_GRADE, clampGrade, sameGrade, type Grade } from '@/lib/photo/grade';
import { SESSION_CLEARED_EVENT } from '@/lib/auth/sessionCleanup';
import { MAX_PHOTOS, MAX_PHOTO_BYTES, isAcceptedPhoto } from '@/lib/photo/exportPlan';
import { createCullClient, type CullClient } from './cullClient';

export type CullStatus = 'unrated' | 'pick' | 'reject';
export type CullFilter = 'all' | 'picks' | 'rejects' | 'unrated' | 'flagged';

export interface PhotoItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: CullStatus;
  grade: Grade;
  state: 'queued' | 'ready' | 'error';
  thumbUrl: string | null;
  metrics: PhotoMetrics | null;
  takenAt: number | null;
  width: number;
  height: number;
}

export interface SessionState {
  items: readonly PhotoItem[];
  selectedId: string | null;
  /** Ratings or grades changed since the last export — the reload warning reads it. */
  dirty: boolean;
}

export interface AddReport { added: number; skippedType: number; skippedSize: number; skippedLimit: number; duplicates: number }

export interface PhotoSession {
  get(): SessionState;
  subscribe(fn: () => void): () => void;
  addFiles(files: Iterable<File>): AddReport;
  setStatus(id: string, status: CullStatus): void;
  setGrade(id: string, grade: Grade): void;
  /** Copies one grade onto several photos (e.g. „apply to all picks"). */
  setGradeFor(ids: readonly string[], grade: Grade): void;
  select(id: string | null): void;
  markExported(): void;
  clear(): void;
  client(): CullClient;
}

const collator = typeof Intl !== 'undefined' ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }) : null;
/** Camera order: IMG_9 before IMG_10. Stable, so the grid never reshuffles under the user's keys as analysis lands. */
const byName = (a: PhotoItem, b: PhotoItem) => (collator ? collator.compare(a.name, b.name) : a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const keyOf = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

const objectUrl = (b: Blob): string | null => {
  try { return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(b) : null; } catch { return null; }
};
const revoke = (u: string | null) => {
  if (!u) return;
  try { URL.revokeObjectURL(u); } catch { /* already gone */ }
};

export function createPhotoSession(makeClient: () => CullClient): PhotoSession {
  let state: SessionState = { items: [], selectedId: null, dirty: false };
  const listeners = new Set<() => void>();
  let clientInstance: CullClient | null = null;
  let nextId = 0;
  const client = () => (clientInstance ??= makeClient());

  const set = (next: SessionState) => {
    state = next;
    listeners.forEach((l) => l());
  };
  const patch = (id: string, p: Partial<PhotoItem>) => {
    if (!state.items.some((it) => it.id === id)) return; // cleared meanwhile
    set({ ...state, items: state.items.map((it) => (it.id === id ? { ...it, ...p } : it)) });
  };

  const analyze = (item: PhotoItem) => {
    client().analyze(item.file).then(
      (r) => {
        if (!state.items.some((it) => it.id === item.id)) return;
        patch(item.id, { state: 'ready', metrics: r.metrics, takenAt: r.takenAt, width: r.width, height: r.height, thumbUrl: objectUrl(r.thumb) });
      },
      (e: Error) => {
        if (e?.message === 'cancelled' || e?.message === 'disposed') return;
        patch(item.id, { state: 'error' });
      },
    );
  };

  return {
    get: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    addFiles(files) {
      const report: AddReport = { added: 0, skippedType: 0, skippedSize: 0, skippedLimit: 0, duplicates: 0 };
      const seen = new Set(state.items.map((it) => keyOf(it.file)));
      const fresh: PhotoItem[] = [];
      for (const file of files) {
        if (!isAcceptedPhoto(file)) { report.skippedType++; continue; }
        if (file.size > MAX_PHOTO_BYTES) { report.skippedSize++; continue; }
        if (seen.has(keyOf(file))) { report.duplicates++; continue; }
        if (state.items.length + fresh.length >= MAX_PHOTOS) { report.skippedLimit++; continue; }
        seen.add(keyOf(file));
        fresh.push({
          id: `ph${++nextId}`, file, name: file.name, size: file.size, type: file.type, status: 'unrated',
          grade: { ...NEUTRAL_GRADE }, state: 'queued', thumbUrl: null, metrics: null, takenAt: null, width: 0, height: 0,
        });
      }
      report.added = fresh.length;
      if (!fresh.length) return report;
      const items = [...state.items, ...fresh].sort(byName);
      set({ ...state, items, selectedId: state.selectedId ?? items[0]?.id ?? null });
      // Analysis runs in grid order, so the frames the user looks at first are measured first.
      [...fresh].sort(byName).forEach(analyze);
      return report;
    },
    setStatus(id, status) {
      const it = state.items.find((x) => x.id === id);
      if (!it || it.status === status) return;
      set({ ...state, dirty: true, items: state.items.map((x) => (x.id === id ? { ...x, status } : x)) });
    },
    setGrade(id, grade) {
      const g = clampGrade(grade);
      const it = state.items.find((x) => x.id === id);
      if (!it || sameGrade(it.grade, g)) return;
      // A grade is work too: an hour spent grading with no rating changed must still be warned about on a reload.
      set({ ...state, dirty: true, items: state.items.map((x) => (x.id === id ? { ...x, grade: g } : x)) });
    },
    setGradeFor(ids, grade) {
      const g = clampGrade(grade);
      const want = new Set(ids);
      if (!state.items.some((it) => want.has(it.id) && !sameGrade(it.grade, g))) return;
      set({ ...state, dirty: true, items: state.items.map((it) => (want.has(it.id) ? { ...it, grade: { ...g } } : it)) });
    },
    select(id) {
      if (id !== null && !state.items.some((it) => it.id === id)) return;
      if (state.selectedId !== id) set({ ...state, selectedId: id });
    },
    markExported() {
      if (state.dirty) set({ ...state, dirty: false });
    },
    clear() {
      clientInstance?.cancelPending();
      state.items.forEach((it) => revoke(it.thumbUrl));
      set({ items: [], selectedId: null, dirty: false });
    },
    client,
  };
}

/** True while a reload would lose something: photos with ratings or grades that were never exported. */
export const hasUnsavedWork = (st: SessionState) => st.dirty && st.items.length > 0;

/**
 * Ties a session to the page it lives in, for as long as the page lives — not to the workspace, which comes and goes:
 *  · a reload or tab close asks first while there is unsaved work, whichever tool is on screen;
 *  · a sign-out (`signOutAndClear` → SESSION_CLEARED_EVENT) empties it, so the next person in this tab never sees
 *    the previous user's photos, ratings or grades.
 * Returns the undo (tests; the page's own session is bound once and never unbound).
 */
export function bindSessionToPage(session: PhotoSession, win: Window = window): () => void {
  const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
  let guarding = false;
  const sync = () => {
    const want = hasUnsavedWork(session.get());
    if (want === guarding) return;
    guarding = want;
    if (want) win.addEventListener('beforeunload', onUnload);
    else win.removeEventListener('beforeunload', onUnload);
  };
  const onCleared = () => session.clear();
  const off = session.subscribe(sync);
  win.addEventListener(SESSION_CLEARED_EVENT, onCleared);
  sync();
  return () => {
    off();
    win.removeEventListener(SESSION_CLEARED_EVENT, onCleared);
    if (guarding) win.removeEventListener('beforeunload', onUnload);
    guarding = false;
  };
}

let singleton: PhotoSession | null = null;
/** The page's one culling session. Its workers start with the first photo, not on import or on opening the tool. */
export function photoSession(): PhotoSession {
  if (!singleton) {
    singleton = createPhotoSession(() => createCullClient());
    if (typeof window !== 'undefined') bindSessionToPage(singleton, window);
  }
  return singleton;
}

// ── Derived views (pure) ───────────────────────────────────────────────────────────────────────────────────────

export interface CullInfo { burst: BurstInfo | null; verdict: CullVerdict | null }

/** Bursts (in grid order) and the assistant's verdict for every analysed photo. */
export function deriveCull(items: readonly PhotoItem[]): Map<string, CullInfo> {
  const bursts = groupBursts(items.map((it) => ({
    id: it.id, hash: it.metrics?.hash ?? null, takenAt: it.takenAt, sharpness: it.metrics?.sharpness ?? null,
  })));
  const out = new Map<string, CullInfo>();
  for (const it of items) {
    const b = bursts.get(it.id) ?? null;
    out.set(it.id, { burst: b && b.size > 1 ? b : null, verdict: it.metrics ? verdict(it.metrics, b) : null });
  }
  return out;
}

export function filterItems(items: readonly PhotoItem[], filter: CullFilter, cull: Map<string, CullInfo>): PhotoItem[] {
  switch (filter) {
    case 'picks': return items.filter((it) => it.status === 'pick');
    case 'rejects': return items.filter((it) => it.status === 'reject');
    case 'unrated': return items.filter((it) => it.status === 'unrated');
    case 'flagged': return items.filter((it) => (cull.get(it.id)?.verdict?.flags.length ?? 0) > 0);
    default: return [...items];
  }
}

export type CullKeyAction = { type: 'status'; status: CullStatus } | { type: 'move'; by: 1 | -1 };

/** The culling keys by physical position — for layouts whose letters are not Latin (see cullKeyAction). */
const BY_CODE: Readonly<Record<string, CullKeyAction>> = {
  KeyP: { type: 'status', status: 'pick' },
  KeyX: { type: 'status', status: 'reject' },
  KeyU: { type: 'status', status: 'unrated' },
  KeyJ: { type: 'move', by: 1 },
  KeyK: { type: 'move', by: -1 },
};

/**
 * The culling keys: P pick · X reject · U unrated, ← → (and J / K) to move. Anything with Ctrl, ⌘ or Alt held is
 * left to the browser — ⌘P prints, and a culling app that ate it would be a bug.
 *
 * ⚠️ GEORGIAN AND RUSSIAN LAYOUTS. `key` is the character the active layout types: the P key gives „პ" on the
 * Georgian layout and „з" on the Russian one, so matching `key` alone left two of the studio's three languages with
 * dead culling keys. A non-Latin character therefore falls back to the physical key (`code`: KeyP → pick). A Latin
 * one does not — on Dvorak or AZERTY the letter the user typed is the one they meant.
 */
export function cullKeyAction(e: { key: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): CullKeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case 'p': case 'P': return { type: 'status', status: 'pick' };
    case 'x': case 'X': return { type: 'status', status: 'reject' };
    case 'u': case 'U': return { type: 'status', status: 'unrated' };
    case 'ArrowRight': case 'j': case 'J': return { type: 'move', by: 1 };
    case 'ArrowLeft': case 'k': case 'K': return { type: 'move', by: -1 };
    default: {
      const nonLatinChar = e.key.length === 1 && e.key.charCodeAt(0) > 0x7f;
      return nonLatinChar && e.code ? BY_CODE[e.code] ?? null : null;
    }
  }
}
