'use client';

/**
 * components/studio/montage/useLibrary.ts — the user's own creations, as montage material.
 *
 * The whole point of a montage here: the videos made with Video, the photos from Image / Photographer and
 * the tracks from Music are already in the Library — cutting them into one Reel should not mean downloading
 * them and uploading them again. Reads the same endpoint the Library page does (/api/studio/library), which
 * re-signs every URL on read, so an old item still plays.
 *
 * ⚠️ IT USED TO STOP AT THE NEWEST 36 (GG, 2026-10-18: „yesterday's and older files do not go into the montage"). Each
 * kind was fetched once, 24 rows, and the merge kept 36, so a busy day of pictures pushed every older film out of
 * „My creations", with no way to reach it. Now it is one newest-first list, page by page („Show more"), and a
 * Videos / Photos filter takes a person straight to an older film.
 *
 * A GUEST sees nothing: that endpoint serves a shared demo library to anonymous visitors, and a demo clip
 * presented as „my creations" would be a lie. The montage route needs a session anyway.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSignedIn } from '../ui/useSignedIn';

export interface LibraryItem {
  id: string;
  /** service_type: 'film' | 'avatar' | 'image' | 'interior' | 'music' … */
  kind: string;
  url: string;
  prompt: string | null;
  orientation: 'landscape' | 'vertical';
  createdAt: string;
}

const VIDEO_KINDS = ['film', 'avatar'];
const IMAGE_KINDS = ['image', 'interior'];

export type LibraryScope = 'visual' | 'music';
/** What „My creations" shows: everything, or only the videos, or only the photos. Music has no filter. */
export type LibraryFilter = 'all' | 'video' | 'photo';

/** One page of the endpoint (its own ceiling is 60). */
export const LIBRARY_PAGE = 24;

/** The endpoint's `kind` list for a scope and filter (it takes a comma list and keeps one newest-first order). */
export function libraryKinds(scope: LibraryScope, filter: LibraryFilter): string {
  if (scope === 'music') return 'music';
  if (filter === 'video') return VIDEO_KINDS.join(',');
  if (filter === 'photo') return IMAGE_KINDS.join(',');
  return [...VIDEO_KINDS, ...IMAGE_KINDS].join(',');
}

export function isVideoItem(it: LibraryItem): boolean {
  return VIDEO_KINDS.includes(it.kind) || /\.(mp4|mov|webm)(\?|$)/i.test(it.url);
}

/** A file that can go on the timeline: it has a link, and it is not a 3D model (a .glb is filed as 'image'). */
const usable = (it: LibraryItem) => typeof it?.url === 'string' && !!it.url && !/\.glb(\?|#|$)/i.test(it.url);

async function fetchPage(kinds: string, offset: number): Promise<LibraryItem[] | null> {
  try {
    const r = await fetch(`/api/studio/library?kind=${kinds}&limit=${LIBRARY_PAGE}&offset=${offset}`, { cache: 'no-store', credentials: 'include' });
    if (!r.ok) return null;
    const j = (await r.json()) as { items?: LibraryItem[] };
    return Array.isArray(j.items) ? j.items : [];
  } catch {
    return null;
  }
}

export function useLibrary(scope: LibraryScope, enabled: boolean) {
  const { authed } = useSignedIn(false, null);
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const kinds = libraryKinds(scope, filter);
  /** Rows the endpoint has handed over for this list (the next page's offset), and which list they belong to. */
  const fetched = useRef(0);
  const listId = useRef(0);

  useEffect(() => {
    if (!enabled || !authed) return;
    const id = ++listId.current;
    fetched.current = 0;
    setLoading(true);
    setLoadingMore(false);
    void fetchPage(kinds, 0).then((page) => {
      if (listId.current !== id) return;
      const rows = page ?? [];
      fetched.current = rows.length;
      setItems(rows.filter(usable));
      setHasMore(rows.length === LIBRARY_PAGE);
      setLoading(false);
    });
    return () => { listId.current += 1; };
  }, [kinds, enabled, authed]);

  /** The next page, appended below (a row already shown is not shown twice). */
  const more = useCallback(() => {
    if (loadingMore || !hasMore) return;
    const id = listId.current;
    setLoadingMore(true);
    void fetchPage(kinds, fetched.current).then((page) => {
      if (listId.current !== id) return;
      setLoadingMore(false);
      if (!page) return; // a failed page keeps the button, for another try
      fetched.current += page.length;
      setItems((cur) => {
        const seen = new Set(cur.map((it) => it.id));
        return [...cur, ...page.filter((it) => usable(it) && !seen.has(it.id))];
      });
      setHasMore(page.length === LIBRARY_PAGE);
    });
  }, [kinds, loadingMore, hasMore]);

  return { items, loading, signedOut: !authed, filter, setFilter, hasMore, loadingMore, more };
}

export type MontageLibrary = ReturnType<typeof useLibrary>;
