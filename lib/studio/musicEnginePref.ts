/**
 * lib/studio/musicEnginePref.ts — the engine the user would like the music chain to try FIRST ("Auto" by default).
 *
 * A device-level preference, not a per-track setting: it lives in localStorage (try/catch everywhere — private mode,
 * blocked storage and quota all degrade to Auto), is shared by the Create panel's model pill and the desktop "Engines &
 * prices" list through a tiny external store, and is read at request time by OmniStudio's runMusicJob
 * (`musicEngineField`), so a re-roll uses whatever is picked when it is pressed. The server validates the value
 * again and ignores an engine it cannot run — a stale pick can never fail a render.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { isMusicEnginePref, isMusicEngineId, type MusicEngineId, type MusicEnginePref } from './musicEngines';

export const MUSIC_ENGINE_KEY = 'myavatar:music-engine';

const listeners = new Set<() => void>();

function storage(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/** The stored pick; anything unreadable or unknown is Auto. */
export function getMusicEnginePref(): MusicEnginePref {
  try {
    const raw = storage()?.getItem(MUSIC_ENGINE_KEY);
    return isMusicEnginePref(raw) ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

export function setMusicEnginePref(pref: MusicEnginePref): void {
  try {
    if (pref === 'auto') storage()?.removeItem(MUSIC_ENGINE_KEY);
    else storage()?.setItem(MUSIC_ENGINE_KEY, pref);
  } catch { /* private mode / quota — the pick lives for this page only, in the subscribers below */ }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // A pick made in another tab.
  const onStorage = (e: StorageEvent) => { if (e.key === MUSIC_ENGINE_KEY || e.key === null) cb(); };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** [pick, set] — the server snapshot is Auto, so the first client render matches the server's. */
export function useMusicEnginePref(): readonly [MusicEnginePref, (p: MusicEnginePref) => void] {
  const pref = useSyncExternalStore(subscribe, getMusicEnginePref, () => 'auto' as MusicEnginePref);
  const set = useCallback((p: MusicEnginePref) => setMusicEnginePref(p), []);
  return [pref, set] as const;
}

/** The request-body field for the stored pick: `{ engine }` for a specific engine, nothing for Auto. */
export function musicEngineField(): { engine?: MusicEngineId } {
  const p = getMusicEnginePref();
  return isMusicEngineId(p) ? { engine: p } : {};
}
