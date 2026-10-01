'use client';

/**
 * useMyTwin — the caller's Digital Twin face for the studio's Avatar gallery ("My twin", the first card), behind
 * NEXT_PUBLIC_TWIN_ENABLED.
 *
 * ⚠️ THE FACE URL EXPIRES (a 15-minute signed URL — the twin is private). A picked card's URL is what the send path
 * fetches and re-hosts for the render, so the hook RENEWS it before it lapses while the panel is open, and `onRenew`
 * lets the caller swap a picked (now stale) URL for the fresh one. Nothing is fetched while the panel is closed, for a
 * guest (401), or with the flag off.
 */
import { ScanFace } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { TemplateCardItem } from '@/components/studio/ui/TemplateGallery';
import { isTwinEnabled } from '@/lib/twin/flag';
import type { TwinStatusResponse } from '@/lib/twin/types';
import { twinCopy } from './copy';

export const MY_TWIN_CARD_ID = 'my-twin';
/** Renew well inside the 15-minute TTL (lib/twin/store.ts TWIN_URL_TTL_SEC). */
export const MY_TWIN_RENEW_MS = 10 * 60 * 1000;

export function useMyTwin(active: boolean, onRenew?: (staleUrl: string, freshUrl: string) => void): string | null {
  const enabled = active && isTwinEnabled();
  const [face, setFace] = useState<string | null>(null);
  const faceRef = useRef<string | null>(null);
  const onRenewRef = useRef(onRenew);
  onRenewRef.current = onRenew;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/twin', { credentials: 'include' });
        if (!r.ok) return; // 401 guest · 404 flag off server-side · 429 / 503 — keep what we have
        const j = (await r.json()) as TwinStatusResponse;
        if (!alive) return;
        const next = j.status === 'ready' ? j.urls.front : null;
        const prev = faceRef.current;
        faceRef.current = next;
        setFace(next);
        if (prev && next && prev !== next) onRenewRef.current?.(prev, next);
      } catch {
        /* offline — the card simply does not appear */
      }
    };
    void load();
    const id = setInterval(() => void load(), MY_TWIN_RENEW_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [enabled]);

  return enabled ? face : null;
}

/** The "My twin" card — the twin's own face as the picture (TemplateGallery). */
export function myTwinCardItem(locale: string, faceUrl: string): TemplateCardItem {
  const t = twinCopy(locale);
  return { id: MY_TWIN_CARD_ID, label: t.myTwin, hint: t.myTwinHint, thumb: faceUrl, palette: ['#1C1C21', '#338FE8'], Icon: ScanFace };
}
