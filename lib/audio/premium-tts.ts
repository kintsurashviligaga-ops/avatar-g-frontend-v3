/**
 * Premium voice playback — the ONLY sanctioned client TTS path.
 *
 * Routes strictly through /api/elevenlabs/tts (ElevenLabs Georgian voice, with a
 * server-side Google ka-GE safety net). It NEVER touches window.speechSynthesis —
 * the generic browser robot voice is forbidden product-wide. A module-level
 * singleton ensures a new play stops the previous track, and blob URLs are
 * revoked on end (no leaks).
 */

let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

/** Stop + free any in-flight premium playback. */
export function stopPremium(): void {
  try { current?.pause(); } catch { /* noop */ }
  if (currentUrl) { try { URL.revokeObjectURL(currentUrl); } catch { /* noop */ } currentUrl = null; }
  current = null;
}

/**
 * Synthesize `text` via the premium pipeline and play it. Resolves with the
 * Audio element (so callers can await/observe), or null on failure. Returns null
 * WITHOUT ever falling back to a browser voice.
 */
export async function speakPremium(text: string, locale: 'ka' | 'en' | 'ru' = 'ka'): Promise<HTMLAudioElement | null> {
  try {
    stopPremium();
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 800);
    if (!clean) return null;

    const res = await fetch('/api/elevenlabs/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean, locale }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    current = audio;
    currentUrl = url;
    audio.onended = () => {
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
      if (current === audio) { current = null; currentUrl = null; }
    };
    try {
      await audio.play();
    } catch {
      // autoplay rejected / interrupted — clean up, do NOT fall back to a robot voice
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
      if (current === audio) { current = null; currentUrl = null; }
      return null;
    }
    return audio;
  } catch {
    return null;
  }
}
