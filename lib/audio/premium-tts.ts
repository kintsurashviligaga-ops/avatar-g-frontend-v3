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

/** True when the browser can progressively decode chunked mpeg via MSE. */
function canStreamMse(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaSource !== 'undefined' &&
    typeof MediaSource.isTypeSupported === 'function' &&
    MediaSource.isTypeSupported('audio/mpeg')
  );
}

/** Bulk path — read the whole blob, then play (Safari/iOS, or MSE-unsupported). */
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
 * Progressive path — feed response chunks into a MediaSource SourceBuffer and
 * start playback the instant the first chunk is appended. Minimizes
 * time-to-first-sound; falls back to the blob path when MSE/streaming is absent.
 */
async function playViaMse(res: Response): Promise<HTMLAudioElement | null> {
  return new Promise<HTMLAudioElement | null>((resolve) => {
    let settled = false;
    const finish = (v: HTMLAudioElement | null) => { if (!settled) { settled = true; resolve(v); } };

    let ms: MediaSource;
    try { ms = new MediaSource(); } catch { finish(null); return; }
    const url = URL.createObjectURL(ms);
    const audio = new Audio();
    audio.src = url;
    current = audio;
    currentUrl = url;
    audio.onended = () => {
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
      if (current === audio) { current = null; currentUrl = null; }
    };

    ms.addEventListener('sourceopen', () => { void (async () => {
      let sb: SourceBuffer;
      try { sb = ms.addSourceBuffer('audio/mpeg'); } catch { finish(null); return; }
      const reader = res.body?.getReader();
      if (!reader) { finish(null); return; }
      const queue: Uint8Array[] = [];
      let reading = true;
      let started = false;

      const pump = () => {
        if (sb.updating) return;
        const chunk = queue.shift();
        if (chunk) {
          try { sb.appendBuffer(chunk as BufferSource); } catch { queue.unshift(chunk); return; }
          if (!started) {
            started = true;
            audio.play().then(() => finish(audio)).catch(() => finish(null));
          }
        } else if (!reading && ms.readyState === 'open') {
          try { ms.endOfStream(); } catch { /* noop */ }
        }
      };
      sb.addEventListener('updateend', pump);

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) { reading = false; pump(); break; }
          if (value && value.byteLength) { queue.push(value); pump(); }
        }
      } catch {
        if (!started) finish(null);
      }
    })(); }, { once: true });
  });
}

/**
 * Synthesize `text` via the premium pipeline and play it with progressive,
 * chunk-buffered streaming where supported (minimal time-to-first-sound),
 * falling back to bulk blob playback otherwise. Resolves with the Audio element
 * (so callers can await/observe), or null on failure. NEVER falls back to a
 * browser robot voice.
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

    // Progressive streaming when the browser supports MSE for mpeg; else blob.
    if (canStreamMse() && res.body) return await playViaMse(res);
    return await playViaBlob(res);
  } catch {
    return null;
  }
}
