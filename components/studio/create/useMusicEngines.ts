'use client';

/**
 * useMusicEngines — GET /api/ai/music/engines once for every consumer on the page (the model pill and the desktop
 * "Engines & prices" list mount together), cached for a short TTL and de-duplicated while in flight. `null` until it
 * answers — or if it never does: the picker then offers Auto only, which is always true.
 */
import { useEffect, useState } from 'react';
import { parseMusicEnginesStatus, type MusicEnginesStatus } from '@/lib/studio/musicEngines';

const TTL_MS = 20_000;
let cached: { at: number; value: MusicEnginesStatus | null } | null = null;
let inflight: Promise<MusicEnginesStatus | null> | null = null;

export async function fetchMusicEngines(force = false, f: typeof fetch = fetch): Promise<MusicEnginesStatus | null> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await f('/api/ai/music/engines', { credentials: 'include' });
      const value = res.ok ? parseMusicEnginesStatus(await res.json().catch(() => null)) : null;
      cached = { at: Date.now(), value };
      return value;
    } catch {
      // Keep whatever we last knew; do not cache a failure (the next mount asks again).
      return cached?.value ?? null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Tests only. */
export function resetMusicEnginesCache(): void {
  cached = null;
  inflight = null;
}

export function useMusicEngines(): MusicEnginesStatus | null {
  const [status, setStatus] = useState<MusicEnginesStatus | null>(() => (cached && Date.now() - cached.at < TTL_MS ? cached.value : null));
  useEffect(() => {
    let alive = true;
    void fetchMusicEngines().then((v) => { if (alive) setStatus(v); });
    return () => { alive = false; };
  }, []);
  return status;
}
