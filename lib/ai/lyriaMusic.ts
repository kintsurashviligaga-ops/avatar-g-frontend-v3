/**
 * lib/ai/lyriaMusic.ts — Google **Lyria 3** music generation via the Gemini **Interactions API**, wired as
 * the OPTIONAL PRIMARY music/song engine. Unlike Lyria 2 (instrumental, Vertex-only), Lyria 3 runs on the
 * Gemini API with a plain API key AND generates FULL SONGS — vocals, timed lyrics (via [Verse]/[Chorus]
 * tags), and instrumental arrangements. So it serves BOTH instrumental tracks and vocal songs. Cost bills to
 * the Gemini API account tied to the key.
 *
 * Endpoint (per ai.google.dev/gemini-api/docs/music-generation):
 *   POST https://generativelanguage.googleapis.com/v1beta/interactions
 *   header  x-goog-api-key: <GEMINI_API_KEY>
 *   body    { model, input: "<prompt string>", response_format: { type: "audio" } }
 *   → synchronous; audio returned base64 in output_audio / steps[].model_output audio blocks.
 *
 * GATED opt-in via LYRIA_ENABLED (default OFF) so the existing Udio→ElevenLabs→MusicGen chain is byte-
 * identical until an operator confirms the key has Lyria 3 access + funding. EVERY path is null/failure-safe:
 * no key/access, quota, timeout, or a contract drift returns null → the caller's failover serves the track.
 * (Lyria 3 is a PREVIEW model — access may need enabling on the key; a miss simply falls back.)
 */
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { isTruthyFlag } from '@/lib/env/flag';

const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const GEN_TIMEOUT_MS = 150_000; // bounded under the route's 300s ceiling

/** Default Lyria 3 model (env-overridable via LYRIA_MODEL). `clip` is the RELIABLE default — verified live
 *  200 + audio (audio/mpeg). `pro` gives full-length arrangements but currently 500s under "high demand",
 *  which would defeat the point (fall back to Udio) — switch to it once it's stable. */
export function lyriaModel(): string {
  return (process.env.LYRIA_MODEL || 'lyria-3-clip-preview').trim();
}

/** True iff Lyria is opt-in ENABLED and a Gemini key is present. Off by default → chain unchanged. */
export function hasLyriaProvider(): boolean {
  return isTruthyFlag(process.env.LYRIA_ENABLED) && !!resolveGeminiKey();
}

export interface LyriaTrack {
  base64: string;
  mime: string;
}

// A big base64-ish string (the audio payload is a large base64 blob; short strings are ids/text/mime).
function looksBase64(s: unknown): s is string {
  return typeof s === 'string' && s.length > 2000 && /^[A-Za-z0-9+/_=-]+$/.test(s.slice(0, 160));
}

/**
 * Find the audio payload in a Lyria 3 Interactions response. The exact shape of the audio field is not
 * stable across the preview (it may be output_audio, a steps[].model_output inlineData block, or a
 * candidates/parts inlineData), so rather than hard-code one path we DEEP-SEARCH for the LARGEST base64
 * blob in the whole response — for an audio response that blob IS the track — and pick up a sibling mime.
 */
function extractAudio(j: unknown): LyriaTrack | null {
  if (j == null || typeof j !== 'object') return null;
  let best: string | null = null;
  let bestMime = 'audio/wav';
  const stack: unknown[] = [j];
  while (stack.length) {
    const cur = stack.pop();
    if (cur == null) continue;
    if (Array.isArray(cur)) { for (const v of cur) stack.push(v); continue; }
    if (typeof cur !== 'object') continue;
    const obj = cur as Record<string, unknown>;
    const siblingMime = (obj.mimeType || obj.mime_type || obj.mime) as string | undefined;
    for (const [k, v] of Object.entries(obj)) {
      if (looksBase64(v)) {
        if (!best || (v as string).length > best.length) {
          best = v as string;
          if (typeof siblingMime === 'string' && siblingMime.startsWith('audio')) bestMime = siblingMime;
          else if (/audio|wav|mp3|mpeg|ogg/i.test(k)) bestMime = 'audio/wav';
        }
      } else if (v && typeof v === 'object') {
        stack.push(v);
      }
    }
  }
  return best ? { base64: best, mime: bestMime } : null;
}

/**
 * Generate a Lyria 3 track (instrumental OR vocal song). Returns { base64, mime } or null on ANY miss so the
 * caller falls back to the next music provider. Never throws.
 */
export async function generateLyriaTrack(args: { prompt: string; lyrics?: string; instrumental?: boolean }): Promise<LyriaTrack | null> {
  const key = resolveGeminiKey();
  if (!key || !args.prompt?.trim()) return null;

  // Lyria 3 is steered entirely via the prompt string: append instrumental intent, or the custom lyrics with
  // the [Verse]/[Chorus] section tags the model understands, so a vocal song is sung with those words.
  let input = args.prompt.trim().slice(0, 1500);
  if (args.instrumental) input += '. Instrumental, no vocals.';
  else if (args.lyrics?.trim()) input += `\n\nLyrics:\n${args.lyrics.trim().slice(0, 1500)}`;

  try {
    const res = await fetch(INTERACTIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      cache: 'no-store',
      body: JSON.stringify({ model: lyriaModel(), input, response_format: { type: 'audio' } }),
      signal: AbortSignal.timeout(GEN_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(`[lyria] interactions http_${res.status} (model=${lyriaModel()}) → falling back. body: ${body.slice(0, 300)}`);
      return null;
    }
    const j = await res.json().catch(() => null);
    const audio = extractAudio(j);
    if (!audio) {
      // eslint-disable-next-line no-console
      console.warn('[lyria] no audio in response → falling back');
      return null;
    }
    return audio;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[lyria] interactions threw → falling back:', e instanceof Error ? e.message : e);
    return null;
  }
}
