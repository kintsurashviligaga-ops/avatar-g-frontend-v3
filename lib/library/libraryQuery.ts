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
 */

import { useEffect, useSyncExternalStore } from 'react';
import { type InfiniteData, type QueryClient, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@/lib/supabase/browser';
import type { RoomGeometry, StyleGuide } from '@/lib/orchestrator/interior';

export interface LibraryItem {
  id: string;
  kind: string; // film | avatar | image | interior | music | voice
  url: string;
  prompt: string | null;
  orientation: 'landscape' | 'vertical';
  createdAt: string;
  /** An interior 3D plan: `url` is the render it was made for. */
  plan?: { geometry: RoomGeometry; style: StyleGuide };
}

interface LibraryPage { items: LibraryItem[] }

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

export const libraryKeys = {
  /** Everything of one owner's Library. */
  owner: (owner: string) => ['library', owner] as const,
  /** One page of one tab: `kind` is the API's comma list ('' = every kind). */
  page: (owner: string, kind: string, limit: number, offset: number) => ['library', owner, 'page', { kind, limit, offset }] as const,
  /** The studio grid's endless list, every kind. */
  feed: (owner: string, limit: number) => ['library', owner, 'feed', { limit }] as const,
};

/** `offset` left out asks for the newest `limit` (the /library Favorites window). */
export async function fetchLibraryPage(query: { kind?: string; limit: number; offset?: number }, signal?: AbortSignal): Promise<LibraryPage> {
  const qs = new URLSearchParams();
  if (query.kind) qs.set('kind', query.kind);
  qs.set('limit', String(query.limit));
  if (query.offset !== undefined) qs.set('offset', String(query.offset));
  const res = await fetch(`/api/studio/library?${qs.toString()}`, { cache: 'no-store', credentials: 'include', signal });
  if (!res.ok) throw new LibraryFetchError(res.status);
  const json = (await res.json()) as { items?: LibraryItem[] };
  return { items: Array.isArray(json.items) ? json.items : [] };
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
    if (current) queryClient.removeQueries({ queryKey: ['library'], predicate: (q) => q.queryKey[1] !== current });
  }, [current, queryClient]);
  return current ?? null;
}

/** Tests only: forget the session read, so the next mount reads it again. */
export function resetLibraryOwnerForTests() {
  owner = undefined;
  started = false;
  listeners.clear();
}

/** One quiet retry for a server or network failure; a 4xx (signed out, refused) is final. */
const retryOnce = (failures: number, error: unknown) =>
  failures < 1 && !(error instanceof LibraryFetchError && error.status >= 400 && error.status < 500);

// ── Reads ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** One page of one tab (the /library page). `kind` '' with no `offset` is its Favorites window: the newest `limit`. */
export function useLibraryPage(kind: string, limit: number, offset?: number) {
  const who = useLibraryOwner();
  useLibraryUpdates(who);
  return useQuery({
    queryKey: libraryKeys.page(who ?? '', kind, limit, offset ?? -1),
    queryFn: ({ signal }) => fetchLibraryPage({ kind, limit, offset }, signal),
    enabled: who !== null,
    staleTime: LIBRARY_STALE_MS,
    // Opening the page (a new mount) always checks behind what is shown; switching tabs on it does not.
    refetchOnMount: 'always',
    retry: retryOnce,
  });
}

/** The studio grid's endless list of every kind, `limit` per page. */
export function useLibraryFeed(limit: number) {
  const who = useLibraryOwner();
  useLibraryUpdates(who);
  return useInfiniteQuery({
    queryKey: libraryKeys.feed(who ?? '', limit),
    queryFn: ({ signal, pageParam }) => fetchLibraryPage({ limit, offset: pageParam }, signal),
    initialPageParam: 0,
    // Next offset = what is loaded so far; a short page means the end.
    getNextPageParam: (last, pages) => (last.items.length < limit ? undefined : pages.reduce((n, p) => n + p.items.length, 0)),
    enabled: who !== null,
    staleTime: LIBRARY_STALE_MS,
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
