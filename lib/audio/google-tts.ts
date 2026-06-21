/**
 * lib/audio/google-tts.ts
 * =======================
 * Google Cloud Text-to-Speech helper, tuned for NATURAL Georgian (ka-GE).
 *
 * WHY THIS EXISTS
 * ---------------
 * ElevenLabs has no native Georgian voice — `eleven_multilingual_v2` only
 * APPROXIMATES Georgian phonemes through a non-native voice, which reads
 * accented / robotic (the live complaint). Google Cloud TTS, by contrast, ships
 * voices trained ON ka-GE. The previous Google fallback hard-coded
 * `ka-GE-Standard-A` — the *concatenative* (most robotic) tier. Google now also
 * offers neural ka-GE voices (Chirp3-HD / Neural2 / Wavenet) that sound far more
 * human.
 *
 * Rather than hard-code a voice name that may or may not exist on a given
 * project, this module QUERIES the live voices list once, ranks what's actually
 * available by quality tier, and uses the best. So it auto-upgrades the moment a
 * neural voice is enabled, and never regresses below the old Standard behaviour.
 *
 * Strictly fail-open: every function returns null on any miss (no key, invalid
 * key, network error, empty audio) so callers fall back cleanly.
 */
import 'server-only';

function googleKey(): string | null {
  return (
    process.env.GOOGLE_TTS_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    null
  );
}

export type TtsGender = 'MALE' | 'FEMALE' | 'NEUTRAL';

interface GoogleVoice {
  name: string;
  ssmlGender?: string;
  languageCodes?: string[];
}

/** Higher = more natural. Drives which available voice we choose. */
function voiceTierRank(name: string): number {
  const n = name.toLowerCase();
  if (n.includes('chirp3-hd') || n.includes('chirp-3-hd')) return 6;
  if (n.includes('chirp-hd') || n.includes('chirp')) return 5;
  if (n.includes('studio')) return 5;
  if (n.includes('neural2')) return 4;
  if (n.includes('wavenet')) return 3;
  if (n.includes('polyglot')) return 2;
  if (n.includes('standard')) return 1;
  return 0;
}

// Cache the resolved best voice per (languageCode|gender) for the lifetime of the
// server instance — the voices list is stable and the lookup costs a round-trip.
const voiceCache = new Map<string, string | null>();

// Once the key is proven dead (expired / invalid / TTS API not enabled), STOP
// hitting Google on every request — short-circuit straight to the caller's
// fallback (e.g. ElevenLabs). Avoids a per-request latency tax in production when
// the configured Google key doesn't work for Cloud TTS.
let keyDead = false;

/**
 * Resolve the best available Google voice for a language, preferring a matching
 * gender. Returns the voice `name` (e.g. `ka-GE-Chirp3-HD-Aoede`) or null.
 */
export async function pickBestGoogleVoice(
  languageCode: string,
  gender?: TtsGender,
): Promise<string | null> {
  const key = googleKey();
  if (!key || keyDead) return null;
  const cacheKey = `${languageCode}|${gender ?? 'ANY'}`;
  if (voiceCache.has(cacheKey)) return voiceCache.get(cacheKey) ?? null;

  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 12_000);
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/voices?languageCode=${encodeURIComponent(languageCode)}&key=${key}`,
      { signal: ac.signal },
    ).finally(() => clearTimeout(to));
    if (!res.ok) {
      // 400/401/403 → the key is bad for Cloud TTS (expired / invalid / API not
      // enabled). Mark it dead so we stop trying on every subsequent request.
      if (res.status === 400 || res.status === 401 || res.status === 403) keyDead = true;
      voiceCache.set(cacheKey, null);
      return null;
    }
    const data = (await res.json()) as { voices?: GoogleVoice[] };
    const voices = (data.voices ?? []).filter((v) =>
      (v.languageCodes ?? []).some((c) => c.toLowerCase().startsWith(languageCode.toLowerCase().slice(0, 2))),
    );
    if (!voices.length) {
      voiceCache.set(cacheKey, null);
      return null;
    }
    // Prefer the requested gender, but fall back to any voice rather than fail.
    const genderMatch = gender
      ? voices.filter((v) => (v.ssmlGender ?? '').toUpperCase() === gender)
      : [];
    const pool = genderMatch.length ? genderMatch : voices;
    pool.sort((a, b) => voiceTierRank(b.name) - voiceTierRank(a.name));
    const best = pool[0]?.name ?? null;
    voiceCache.set(cacheKey, best);
    return best;
  } catch {
    voiceCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Synthesise `text` to an MP3 ArrayBuffer via Google Cloud TTS, auto-selecting
 * the best available neural voice for the detected/declared language. Returns
 * null on any failure (fail-open).
 */
export async function synthesizeGoogleTts(
  text: string,
  opts?: { languageCode?: string; gender?: TtsGender },
): Promise<ArrayBuffer | null> {
  const key = googleKey();
  if (!key || keyDead) return null;
  const clean = (text ?? '').trim();
  if (!clean) return null;

  // Auto-detect language from the script when not declared.
  const isGeorgian = /[ა-ჿ]/.test(clean);
  const isRussian = /[А-яЁё]/.test(clean);
  const languageCode =
    opts?.languageCode ?? (isGeorgian ? 'ka-GE' : isRussian ? 'ru-RU' : 'en-US');

  // Best available neural voice. If the lookup found nothing (no voices, or the key
  // is dead → keyDead now set), bail so the caller falls back instead of issuing a
  // synth call that would also fail.
  const best = await pickBestGoogleVoice(languageCode, opts?.gender);
  if (!best || keyDead) return null;
  const voiceName = best;

  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 30_000);
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: clean.slice(0, 4500) },
          voice: { languageCode, name: voiceName },
          // Slightly slower than 1.0 gives Georgian phonemes room to breathe.
          audioConfig: { audioEncoding: 'MP3', speakingRate: 0.97, pitch: 0 },
        }),
        signal: ac.signal,
      },
    ).finally(() => clearTimeout(to));
    if (!res.ok) {
      console.error('[google-tts] synth error', res.status, voiceName);
      return null;
    }
    const data = (await res.json()) as { audioContent?: string };
    if (!data.audioContent) return null;
    const buf = Buffer.from(data.audioContent, 'base64');
    if (buf.byteLength < 256) return null;
    // Return a copy backed by a standalone ArrayBuffer.
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch {
    return null;
  }
}

/** Map a film voice persona to a Google TTS gender hint. */
export function genderForPersona(
  persona: 'male' | 'female' | 'child' | 'elder' | 'young' | 'narrator',
): TtsGender {
  if (persona === 'female' || persona === 'child') return 'FEMALE';
  return 'MALE';
}
