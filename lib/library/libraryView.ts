'use client';

/**
 * lib/library/libraryView — where a Library screen was left (MASTER TASK v3.1 §4.2.6): the /library page's tab, page and
 * search, the studio slide-over's filter, and how far each was scrolled. A return (back from Montage, the slide-over
 * opened again, a reload of the tab) finds the screen as it was, instead of on the first tab at the top.
 *
 * Kept in this browser tab's sessionStorage only, and filed under the account: another account in the same tab starts
 * fresh and never sees what the previous one searched for. Values are checked on the way back in (a stored view is
 * input like any other).
 */
import { type RefObject, useEffect, useRef } from 'react';

const STORE_KEY = 'myavatar:library-view';
const MAX_QUERY = 200;
const MAX_PAGE = 1000;
const MAX_SCROLL = 1_000_000;

export type LibraryScreen = 'page' | 'slideover';

export interface LibraryView {
  /** The tab (the page) or filter (the slide-over), as the screen names it. */
  tab?: string;
  /** The page of that tab, from 0. */
  page?: number;
  /** The search text. */
  q?: string;
  /** How far the screen's scroll box was scrolled, in px. */
  scroll?: number;
}

type Stored = Partial<Record<LibraryScreen, LibraryView & { owner: string }>>;

function readAll(): Stored {
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Stored) : {};
  } catch { return {}; }
}

const whole = (n: unknown, max: number) => (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max ? n : undefined);

/** Where `owner` left `screen` in this tab, or null (nothing kept, another account's, or unreadable). */
export function readLibraryView(screen: LibraryScreen, owner: string): LibraryView | null {
  if (typeof window === 'undefined' || !owner) return null;
  const v = readAll()[screen];
  if (!v || typeof v !== 'object' || v.owner !== owner) return null;
  return {
    tab: typeof v.tab === 'string' && v.tab.length <= 40 ? v.tab : undefined,
    page: whole(v.page, MAX_PAGE),
    q: typeof v.q === 'string' ? v.q.slice(0, MAX_QUERY) : undefined,
    scroll: whole(v.scroll, MAX_SCROLL),
  };
}

/** Remember `patch` for `owner` on `screen`; another account's view of the screen is replaced, not merged. */
export function saveLibraryView(screen: LibraryScreen, owner: string, patch: LibraryView): void {
  if (typeof window === 'undefined' || !owner) return;
  try {
    const all = readAll();
    const was = all[screen]?.owner === owner ? all[screen] : undefined;
    all[screen] = { ...was, ...patch, ...(patch.q !== undefined ? { q: patch.q.slice(0, MAX_QUERY) } : {}), owner };
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch { /* storage blocked or full: the screen simply starts fresh next time */ }
}

/** The box `el` scrolls in: its nearest ancestor that scrolls vertically, else the document. */
export function scrollParentOf(el: Element | null): HTMLElement | null {
  for (let at = el?.parentElement ?? null; at; at = at.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(at).overflowY)) return at;
  }
  return (typeof document !== 'undefined' ? document.scrollingElement : null) as HTMLElement | null;
}

/**
 * Keeps how far `root`'s scroll box is scrolled for `owner` on `screen`, and scrolls it back there once, as soon as the
 * screen has `settled` (its first read is on screen). Until then nothing is saved: the scroll to the top a route change
 * makes must not overwrite where the screen was left.
 */
export function useKeptScroll(root: RefObject<HTMLElement | null>, screen: LibraryScreen, owner: string | null, settled: boolean) {
  const left = useRef<{ owner: string; y: number } | null>(null);
  const done = useRef<string | null>(null);
  useEffect(() => {
    const box = scrollParentOf(root.current);
    if (!box || !owner) return;
    if (done.current !== owner) {
      const y = readLibraryView(screen, owner)?.scroll;
      left.current = y ? { owner, y } : null;
    }
    const target: HTMLElement | Window = box === document.scrollingElement ? window : box;
    let frame = 0;
    const onScroll = () => {
      if (frame || done.current !== owner) return;
      frame = requestAnimationFrame(() => { frame = 0; saveLibraryView(screen, owner, { scroll: Math.round(box.scrollTop) }); });
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => { target.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [root, screen, owner]);
  useEffect(() => {
    if (!settled || !owner || done.current === owner) return;
    done.current = owner;
    const at = left.current;
    left.current = null;
    const box = scrollParentOf(root.current);
    if (box && at?.owner === owner) box.scrollTop = at.y;
  }, [root, screen, owner, settled]);
}
