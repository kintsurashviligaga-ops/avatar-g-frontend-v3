'use client';

/**
 * lib/library/libraryQuery.ts — the one data layer for both Library surfaces (MASTER TASK v3.1 §4.2): the /library page
 * (components/library/LibraryGallery) and the studio's slide-over (components/studio/StudioLibraryGrid).
 *
 * Both read GET /api/studio/library through the React Query client the app already mounts (components/providers/
 * QueryProvider in app/[locale]/layout.tsx). A loaded tab stays on screen: going back to it shows it at once, and once it
 * is older than LIBRARY_STALE_MS it is refreshed behind the visible grid instead of being replaced by a spinner. A tab
 * that has never loaded still shows the spinner, because there is nothing true to show yet.
 *
 * ⚠️ PRIVATE BY ACCOUNT. Every key starts with ['library', owner], where owner is the signed-in user's id read from the
 * same cookie session the route reads (or 'guest'). When the session changes, every other owner's Library is dropped
 * from memory, so a shared device never shows one account's works to the next. The HTTP cache is not used at all: the
 * client fetches with `no-store` and the route answers `private, no-store`, because a browser cache keys by URL, not by
 * account, and the body carries signed links.
 *
 * Obsolete requests are still cancelled (#160): the fetch takes React Query's signal, and a query nobody is looking at
 * any more is aborted. A late answer can only land in its own tab's cache, never on the tab on screen.
 *
 * The route tells its answers apart (§4.2.7): a page of the caller's own works, the shared demo library for a signed-out
 * visitor (`demo`), a database it could not reach (503) and any other failure (500). A failure stays an error here
 * (libraryFailure says which), so neither screen can show it as „nothing created yet".
 *
 * Stars are the account's (§4.2.4): every signed-in item says whether it is starred, the Favorites tab is a page query of
 * the starred works (all of them, paged like any tab), and setLibraryFavorite changes one star on every loaded page at
 * once, puts it back if the server refuses, and tells the server. The stars one browser kept before (localStorage
 * `myavatar:favorites`, not tied to any account) move to the signed-in account once (migrateDeviceFavorites).
 *
 * A work's link is kept while it is good (§4.2.3, §4.2.5). Every answer signs its links afresh, but a refreshed page
 * keeps the link a work already had, for the same storage object, while it has more than EXPIRY_MARGIN_MS left: a film
 * on screen is not pointed at a new address and read again just because its page was refreshed. A link that failed to
 * load (forgetLibraryLink) is never kept, so the next answer's fresh one replaces it.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { type InfiniteData, type QueryClient, replaceEqualDeep, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@/lib/supabase/browser';
import type { RoomGeometry, StyleGuide } from '@/lib/orchestrator/interior';
import { releaseKeptVideosExcept } from '@/lib/library/videoPool';

export interface LibraryItem {
  id: string;
  kind: string; // film | avatar | image | interior | music | voice
  url: string;
  prompt: string | null;
  orientation: 'landscape' | 'vertical';
  createdAt: string;
  /** An interior 3D plan: `url` is the render it was made for. */
  plan?: { geometry: RoomGeometry; style: StyleGuide };
  /** When `url` stops working (ISO), if the route minted it. */
  expiresAt?: string;
  /** The signed-in owner starred it. Absent on the demo library (and when the stars could not be read). */
  favorite?: boolean;
}

export interface LibraryPage {
  items: LibraryItem[];
  /** The shared demo library a signed-out visitor is shown: examples, not anyone's works. */
  demo: boolean;
  /** Where the next page starts (the studio grid's endless list); null at the end. */
  nextCursor: string | null;
}

/** How long a loaded page counts as current. Within it, going back to a tab sends nothing. */
export const LIBRARY_STALE_MS = 30_000;

/** The event the studio dispatches after it saves a new file to the Library (OmniStudio, SurgicalEditor). */
export const LIBRARY_UPDATED_EVENT = 'myavatar:library-updated';

/** A non-2xx answer. It is an error, never cached as "no works". */
export class LibraryFetchError extends Error {
  constructor(readonly status: number) {
    super(`library ${status}`);
    this.name = 'LibraryFetchError';
  }
}

/** Why a read failed, for the screen: the Library could not be reached (503, or no answer at all), or it failed. */
export type LibraryFailure = 'unavailable' | 'failed';
export function libraryFailure(error: unknown): LibraryFailure {
  if (error instanceof LibraryFetchError) return error.status === 503 ? 'unavailable' : 'failed';
  return 'unavailable'; // the fetch itself threw: offline, or the route never answered
}

/** A loaded page whose links run out within this long counts as out of date, so the next look fetches fresh ones. */
const EXPIRY_MARGIN_MS = 10 * 60_000;
function expiresSoon(data: LibraryPage | InfiniteData<LibraryPage> | undefined, now = Date.now()): boolean {
  if (!data) return false;
  const pages = 'pages' in data ? data.pages : [data];
  return pages.some((p) => p.items.some((it) => !!it.expiresAt && Date.parse(it.expiresAt) - now < EXPIRY_MARGIN_MS));
}

// ── Links ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The storage object a link points at: the link without its token (query) and its media fragment. */
const objectOf = (url: string) => url.split('#')[0]!.split('?')[0]!;
// Links that failed to load in this tab; never kept over a fresh one. Bounded: the oldest are forgotten first.
const failedLinks = new Set<string>();
const MAX_FAILED_LINKS = 500;

/** A link would not load (expired, revoked, a broken object): the next answer's fresh link replaces it. */
export function forgetLibraryLink(url: string) {
  const link = url.split('#')[0]!;
  failedLinks.delete(link);
  failedLinks.add(link);
  if (failedLinks.size > MAX_FAILED_LINKS) failedLinks.delete(failedLinks.values().next().value!);
}

/**
 * `next` with each work's link from `old` kept: the same work, the same storage object, a link this route signed, still
 * good for more than EXPIRY_MARGIN_MS, and not one that failed. `next` itself when nothing was kept.
 */
export function keepLiveLinks<T extends LibraryPage | InfiniteData<LibraryPage>>(old: T | undefined, next: T, now = Date.now()): T {
  if (!old || !next) return next;
  const pagesOf = (d: LibraryPage | InfiniteData<LibraryPage>) => ('pages' in d ? d.pages : [d]);
  const live = new Map<string, LibraryItem>();
  for (const p of pagesOf(old)) {
    for (const it of p?.items ?? []) {
      if (it.expiresAt && Date.parse(it.expiresAt) - now > EXPIRY_MARGIN_MS && !failedLinks.has(it.url.split('#')[0]!)) live.set(it.id, it);
    }
  }
  if (live.size === 0) return next;
  let kept = false;
  const keep = (items: LibraryItem[]) => items.map((it) => {
    const was = live.get(it.id);
    if (!was || !it.expiresAt || was.url === it.url || objectOf(was.url) !== objectOf(it.url)) return it;
    kept = true;
    return { ...it, url: was.url, expiresAt: was.expiresAt };
  });
  const out = 'pages' in next
    ? { ...next, pages: next.pages.map((p) => ({ ...p, items: keep(p.items) })) }
    : { ...next, items: keep(next.items) };
  return kept ? (out as T) : next;
}

/** React Query's structural sharing, after the links still good are kept (so an unchanged page stays the same object). */
const shareKeepingLinks = (old: unknown, next: unknown) =>
  replaceEqualDeep(old, keepLiveLinks(old as LibraryPage | undefined, next as LibraryPage));

export const libraryKeys = {
  /** Everything of one owner's Library. */
  owner: (owner: string) => ['library', owner] as const,
  /** One page of one tab: `kind` is the API's comma list ('' = every kind); `favorites` only the starred works. */
  page: (owner: string, kind: string, limit: number, offset: number, favorites = false) =>
    ['library', owner, 'page', favorites ? { kind, limit, offset, favorites } : { kind, limit, offset }] as const,
  /** The studio grid's endless list, every kind. */
  feed: (owner: string, limit: number) => ['library', owner, 'feed', { limit }] as const,
};

/** `offset` left out asks for the newest `limit`; `before` continues after a cursor; `favorites` reads the starred works. */
export async function fetchLibraryPage(
  query: { kind?: string; limit: number; offset?: number; before?: string; favorites?: boolean },
  signal?: AbortSignal,
): Promise<LibraryPage> {
  const qs = new URLSearchParams();
  if (query.kind) qs.set('kind', query.kind);
  if (query.favorites) qs.set('favorite', '1');
  qs.set('limit', String(query.limit));
  if (query.offset !== undefined) qs.set('offset', String(query.offset));
  if (query.before) qs.set('before', query.before);
  const res = await fetch(`/api/studio/library?${qs.toString()}`, { cache: 'no-store', credentials: 'include', signal });
  if (!res.ok) throw new LibraryFetchError(res.status);
  const json = (await res.json()) as { items?: LibraryItem[]; demo?: unknown; nextCursor?: unknown };
  return {
    items: Array.isArray(json.items) ? json.items : [],
    demo: json.demo === true,
    nextCursor: typeof json.nextCursor === 'string' && json.nextCursor ? json.nextCursor : null,
  };
}

// ── Who owns the cache ────────────────────────────────────────────────────────────────────────────────────────────────
// One subscription for the whole tab. `undefined` until the session has been read once; then a user id or 'guest'.
let owner: string | undefined;
let started = false;
const listeners = new Set<() => void>();
function setOwner(next: string) {
  if (next === owner) return;
  owner = next;
  listeners.forEach((l) => l());
}
function startOwnerWatch() {
  if (started || typeof window === 'undefined') return;
  started = true;
  try {
    const auth = createBrowserClient().auth;
    // getSession reads the session cookie (no network unless the token needs a refresh): the same session the route sees.
    void auth.getSession().then(({ data }) => setOwner(data.session?.user?.id ?? 'guest'), () => setOwner('guest'));
    auth.onAuthStateChange((_event, session) => setOwner(session?.user?.id ?? 'guest'));
  } catch {
    setOwner('guest');
  }
}
function subscribeOwner(listener: () => void) {
  listeners.add(listener);
  startOwnerWatch();
  return () => { listeners.delete(listener); };
}

/** The signed-in user's id, 'guest', or null while the session has not been read yet. */
export function useLibraryOwner(): string | null {
  const current = useSyncExternalStore(subscribeOwner, () => owner, () => undefined);
  const queryClient = useQueryClient();
  // A different account (or a sign-out) never sees the previous one's works.
  useEffect(() => {
    if (!current) return;
    queryClient.removeQueries({ queryKey: ['library'], predicate: (q) => q.queryKey[1] !== current });
    releaseKeptVideosExcept(current); // and none of its films' <video> elements stays in memory either
  }, [current, queryClient]);
  return current ?? null;
}

/** Tests only: forget the session read (and this tab's failed links and kept films), so the next mount reads it again. */
export function resetLibraryOwnerForTests() {
  owner = undefined;
  started = false;
  listeners.clear();
  failedLinks.clear();
  releaseKeptVideosExcept(null);
}

/** One quiet retry for a server or network failure; a 4xx (signed out, refused) is final. */
const retryOnce = (failures: number, error: unknown) =>
  failures < 1 && !(error instanceof LibraryFetchError && error.status >= 400 && error.status < 500);

// ── Reads ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** One page of one tab (the /library page); `favorites` makes it a page of the starred works (the Favorites tab). */
export function useLibraryPage(kind: string, limit: number, offset?: number, favorites = false) {
  const who = useLibraryOwner();
  useLibraryUpdates(who);
  return useQuery({
    queryKey: libraryKeys.page(who ?? '', kind, limit, offset ?? -1, favorites),
    queryFn: ({ signal }) => fetchLibraryPage({ kind, limit, offset, favorites }, signal),
    enabled: who !== null,
    staleTime: (q) => (expiresSoon(q.state.data) ? 0 : LIBRARY_STALE_MS),
    structuralSharing: shareKeepingLinks,
    // Opening the page (a new mount) always checks behind what is shown; switching tabs on it does not.
    refetchOnMount: 'always',
    retry: retryOnce,
  });
}

/**
 * The studio grid's endless list of every kind, `limit` per page. Each page continues from the cursor the one before
 * it ended on, so a file saved or deleted while scrolling neither repeats nor skips a row (§4.2.4).
 */
export function useLibraryFeed(limit: number) {
  const who = useLibraryOwner();
  useLibraryUpdates(who);
  return useInfiniteQuery({
    queryKey: libraryKeys.feed(who ?? '', limit),
    queryFn: ({ signal, pageParam }) => fetchLibraryPage({ limit, before: pageParam ?? undefined }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: who !== null,
    staleTime: (q) => (expiresSoon(q.state.data) ? 0 : LIBRARY_STALE_MS),
    structuralSharing: shareKeepingLinks,
    refetchOnMount: 'always',
    retry: retryOnce,
  });
}

/** A new file was saved: every loaded tab of this owner is refreshed (the one on screen at once, behind its grid). */
function useLibraryUpdates(who: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!who) return;
    const onUpdated = () => { void queryClient.invalidateQueries({ queryKey: libraryKeys.owner(who) }); };
    window.addEventListener(LIBRARY_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(LIBRARY_UPDATED_EVENT, onUpdated);
  }, [who, queryClient]);
}

// ── Writes ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * A deleted file leaves every loaded page of its owner at once, as it left the one page before. Those pages are marked
 * out of date without a request, so the next visit to each fetches what moved up.
 */
export function removeLibraryItem(queryClient: QueryClient, who: string, id: string) {
  const drop = (items: LibraryItem[]) => items.filter((it) => it.id !== id);
  queryClient.setQueriesData<LibraryPage | InfiniteData<LibraryPage>>({ queryKey: libraryKeys.owner(who) }, (data) => {
    if (!data) return data;
    if ('pages' in data) return { ...data, pages: data.pages.map((p) => ({ ...p, items: drop(p.items) })) };
    return { ...data, items: drop(data.items) };
  });
  void queryClient.invalidateQueries({ queryKey: libraryKeys.owner(who), refetchType: 'none' });
}

/** Is this cached query a page of the Favorites tab? */
const isFavoritesKey = (key: readonly unknown[]) =>
  key[2] === 'page' && !!key[3] && typeof key[3] === 'object' && (key[3] as { favorites?: unknown }).favorites === true;

/**
 * Star or unstar one work (§4.2.4). Every loaded page of the owner shows the new star at once; an unstarred work leaves
 * the Favorites pages at once, and a starred one is on them the next time they are shown. The server is told; if it
 * refuses (or cannot be reached) every page is put back as it was and this answers false.
 */
export async function setLibraryFavorite(queryClient: QueryClient, who: string, id: string, favorite: boolean): Promise<boolean> {
  type Data = LibraryPage | InfiniteData<LibraryPage>;
  const before = queryClient.getQueriesData<Data>({ queryKey: libraryKeys.owner(who) });
  const mark = (items: LibraryItem[], dropUnstarred: boolean) => items
    .filter((it) => !(dropUnstarred && !favorite && it.id === id))
    .map((it) => (it.id === id ? { ...it, favorite } : it));
  for (const [key, data] of before) {
    if (!data) continue;
    const onFavorites = isFavoritesKey(key);
    queryClient.setQueryData<Data>(key, 'pages' in data
      ? { ...data, pages: data.pages.map((p) => ({ ...p, items: mark(p.items, onFavorites) })) }
      : { ...data, items: mark(data.items, onFavorites) });
  }
  // The Favorites pages are out of date either way (a new star belongs on them, a removed one moved the rest up).
  void queryClient.invalidateQueries({ queryKey: libraryKeys.owner(who), predicate: (q) => isFavoritesKey(q.queryKey), refetchType: 'none' });
  let ok = false;
  try {
    const res = await fetch('/api/studio/library', {
      method: 'PATCH',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, favorite }),
    });
    ok = res.ok;
  } catch { /* offline: put it back below */ }
  if (!ok) for (const [key, data] of before) queryClient.setQueryData(key, data);
  return ok;
}

/** Where a browser kept its stars before they were the account's: an id list, not tied to any account. */
export const DEVICE_FAVORITES_KEY = 'myavatar:favorites';
const triedThisTab = new Set<string>();

/**
 * Move the stars this browser kept to the signed-in account, once per account per tab. The server stars only the ids
 * that are this account's own works; the others stay in this browser, untouched (a shared browser keeps both accounts'
 * old stars, and the next account moves its own). The list is emptied of what was moved, and removed once empty.
 * Answers how many were moved (0 when there was nothing to move or the server could not take them; it is tried again in
 * a later tab).
 */
export async function migrateDeviceFavorites(queryClient: QueryClient, who: string): Promise<number> {
  if (!who || who === 'guest' || triedThisTab.has(who) || typeof window === 'undefined') return 0;
  triedThisTab.add(who);
  let kept: string[];
  try {
    const raw = window.localStorage.getItem(DEVICE_FAVORITES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    kept = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200) : [];
  } catch {
    return 0; // storage blocked, or a list that is not ours to read
  }
  if (kept.length === 0) return 0;
  const batch = kept.slice(0, 200);
  let moved: string[] = [];
  try {
    const res = await fetch('/api/studio/library', {
      method: 'PATCH',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: batch, favorite: true }),
    });
    if (!res.ok) return 0;
    const json = (await res.json()) as { ids?: unknown };
    moved = Array.isArray(json.ids) ? json.ids.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return 0;
  }
  const gone = new Set(moved);
  const left = kept.filter((v) => !gone.has(v));
  try {
    if (left.length) window.localStorage.setItem(DEVICE_FAVORITES_KEY, JSON.stringify(left));
    else window.localStorage.removeItem(DEVICE_FAVORITES_KEY);
  } catch { /* the server already has them; the list is simply offered again */ }
  if (moved.length) {
    // A first read still on its way may have been answered before the stars moved, and an invalidation would only join
    // it (it has no data to cancel for), so it is called off and asked again.
    await queryClient.cancelQueries({ queryKey: libraryKeys.owner(who) });
    void queryClient.invalidateQueries({ queryKey: libraryKeys.owner(who) });
  }
  return moved.length;
}

/** Tests only: let migrateDeviceFavorites run again in this tab. */
export function resetDeviceFavoritesForTests() {
  triedThisTab.clear();
}
