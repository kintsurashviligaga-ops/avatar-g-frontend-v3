/**
 * Premium voice playback — the ONLY sanctioned client TTS path.
 *
 * Routes strictly through /api/tts/gemini (Gemini NATIVE audio; no ElevenLabs). It NEVER touches
 * window.speechSynthesis — the generic browser robot voice is forbidden product-wide. A module-level
 * singleton ensures a new play stops the previous track, and blob URLs are revoked on end (no leaks).
 * Gemini returns a complete WAV (not chunked mpeg), so playback is bulk-blob via <audio>.
 */

let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

/** Stop + free any in-flight premium playback. */
export function stopPremium(): void {
  try { current?.pause(); } catch { /* noop */ }
  if (currentUrl) { try { URL.revokeObjectURL(currentUrl); } catch { /* noop */ } currentUrl = null; }
  current = null;
}

/** Bulk path — read the whole blob, then play (WAV plays natively in every browser). */
async function playViaBlob(res: Response): Promise<HTMLAudioElement | null> {
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
    try { URL.revokeObjectURL(url); } catch { /* noop */ }
    if (current === audio) { current = null; currentUrl = null; }
    return null;
  }
  return audio;
}

/**
 * Synthesize `text` via Gemini native audio (/api/tts/gemini) and play it. Resolves with the Audio
 * element (so callers can await/observe), or null on failure. NEVER falls back to a browser robot voice.
 */
export async function speakPremium(text: string, locale: 'ka' | 'en' | 'ru' = 'ka'): Promise<HTMLAudioElement | null> {
  try {
    stopPremium();
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 800);
    if (!clean) return null;

    const res = await fetch('/api/tts/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean, locale }),
    });
    if (!res.ok) return null;

    // Gemini returns a complete WAV → bulk blob playback (WAV isn't MSE-streamable like chunked mpeg).
    return await playViaBlob(res);
  } catch {
    return null;
  }
}
