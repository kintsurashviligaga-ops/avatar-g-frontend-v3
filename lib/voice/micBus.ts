'use client';

/**
 * lib/voice/micBus.ts — "release the microphone now": one window event every in-page mic holder listens for.
 *
 * Why: Live voice acquires the mic while other features on the same page may still hold it — the composer's
 * dictation (Web Speech / the WAV recorder), the music "sing in my voice" recorder, the ElevenLabs voice fallback.
 * Desktop browsers share a device between two captures, but Android Chrome/WebView (and some Windows drivers) do not:
 * the second getUserMedia rejects with NotReadableError — which the Live screen used to show as "the microphone could
 * not start". The Live opener dispatches this synchronously BEFORE its own getUserMedia; every holder stops its tracks
 * synchronously in the listener (text already dictated is kept).
 */
import { useEffect, useRef } from 'react';

export const MIC_RELEASE_EVENT = 'myavatar:mic-release';

export interface MicReleaseDetail {
  /** Who asked ('live', 'dictation', …) — a holder never releases for its own request. */
  reason: string;
}

/** Ask every other in-page mic holder to stop its capture now (synchronous dispatch). */
export function requestMicRelease(reason: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<MicReleaseDetail>(MIC_RELEASE_EVENT, { detail: { reason } }));
  } catch { /* very old engines — nothing to coordinate */ }
}

/**
 * Subscribe a holder. `fn` runs synchronously on every release request whose reason differs from `self`
 * (so a holder that itself requested release is not told to drop its own capture). Latest `fn` is always used.
 */
export function useMicRelease(fn: (detail: MicReleaseDetail) => void, self?: string): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const on = (e: Event) => {
      const detail = (e as CustomEvent<MicReleaseDetail>).detail ?? { reason: '' };
      if (self && detail.reason === self) return;
      try { fnRef.current(detail); } catch { /* a holder's failure must not break the requester */ }
    };
    window.addEventListener(MIC_RELEASE_EVENT, on);
    return () => window.removeEventListener(MIC_RELEASE_EVENT, on);
  }, [self]);
}
