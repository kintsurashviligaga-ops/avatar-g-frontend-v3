'use client';

export type TtsPlaybackResult = 'ended' | 'failed' | 'cancelled';

/** One already-loaded chunk. Only its ended event proves completion; failures must stop the caller's read. */
export function waitForTtsPlayback(
  audio: HTMLAudioElement,
  url: string,
  registerCancel: (cancel: (() => void) | null) => void,
): Promise<TtsPlaybackResult> {
  return new Promise(resolve => {
    let settled = false;
    const done = (result: TtsPlaybackResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      registerCancel(null);
      audio.onended = null;
      audio.onerror = null;
      if (result !== 'ended') { try { audio.pause(); } catch { /* media API unavailable */ } }
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const guard = setTimeout(() => done('failed'), 90_000);
    registerCancel(() => done('cancelled'));
    // Reusing one user-activated element is essential on iOS. Ignore events from its superseded source.
    const belongs = () => !audio.currentSrc || audio.currentSrc === url;
    audio.onended = () => { if (belongs()) done('ended'); };
    audio.onerror = () => { if (belongs() && audio.error) done('failed'); };
    try { void audio.play().catch(() => done('failed')); }
    catch { done('failed'); }
  });
}
