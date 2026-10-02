'use client';

/**
 * components/studio/montage/useLibrary.ts — the user's own creations, as montage material.
 *
 * The whole point of a montage here: the videos made with Video, the photos from Image / Photographer and
 * the tracks from Music are already in the Library — cutting them into one Reel should not mean downloading
 * them and uploading them again. Reads the same endpoint the Library page does (/api/studio/library), which
 * re-signs every URL on read, so an old item still plays.
 *
 * A GUEST sees nothing: that endpoint serves a shared demo library to anonymous visitors, and a demo clip
 * presented as „my creations" would be a lie. The montage route needs a session anyway.
 */
import { useEffect, useState } from 'react';
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

export function isVideoItem(it: LibraryItem): boolean {
  return VIDEO_KINDS.includes(it.kind) || /\.(mp4|mov|webm)(\?|$)/i.test(it.url);
}

export function useLibrary(scope: LibraryScope, enabled: boolean) {
  const { authed } = useSignedIn(false, null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !authed) return;
    let alive = true;
    setLoading(true);
    const kinds = scope === 'music' ? ['music'] : [...VIDEO_KINDS, ...IMAGE_KINDS];
    Promise.all(kinds.map((k) =>
      fetch(`/api/studio/library?kind=${k}&limit=24`, { cache: 'no-store', credentials: 'include' })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((j: { items?: LibraryItem[] }) => (Array.isArray(j.items) ? j.items : []))
        .catch(() => [] as LibraryItem[]),
    ))
      .then((lists) => {
        if (!alive) return;
        const all = lists.flat().filter((it) => typeof it.url === 'string' && it.url);
        all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setItems(all.slice(0, 36));
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [scope, enabled, authed]);

  return { items, loading, signedOut: !authed };
}
