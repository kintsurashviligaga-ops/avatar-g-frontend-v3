/**
 * lib/audio/google-tts.ts
 * =======================
 * Google Cloud Text-to-Speech: the one speech engine the server speaks with (MASTER TASK v3.1, PR 5d).
 *
 * Every spoken line the server makes — a film's voice, the talking avatar's line, /api/elevenlabs/tts, the agent's
 * voice replies, the realtime voice — is read here. It runs on the same Workload Identity token as Vertex AI
 * (lib/veo/vertexAuth: Vercel OIDC → STS → service-account impersonation, cloud-platform scope), billed to the
 * service account's Google Cloud project. No API key is read: the AI Studio key (GEMINI_API_KEY) and the old
 * GOOGLE_TTS_API_KEY / GOOGLE_API_KEY can no longer pay for speech. A missing or malformed Vertex config answers null
 * before any request, and the token never leaves the server (it rides only in the Authorization header, and
 * `redirect: 'manual'` keeps it from following a redirect).
 *
 * Voices: Cloud TTS ships voices trained on ka-GE. Rather than hard-code a voice name that may not exist on the
 * project, this module queries the voices list once per language and gender, ranks what is available by quality tier
 * (Chirp3-HD › Chirp/Studio › Neural2 › WaveNet › Standard) and uses the best. The list call is free; only
 * `text:synthesize` is billed.
 *
 * Fail-closed and quiet: every function returns null on any miss (no config, no token, a refusal, empty audio), and
 * there is no other engine behind it. Once Google refuses the credential (401/403: the API not enabled on the
 * project, or the service account not allowed), the module stops asking for the rest of the instance's life.
 */
import 'server-only';
import { getVertexAccessToken, vertexAiConfig } from '@/lib/veo/vertexAuth';
import { splitSpokenText } from '@/lib/chat/spokenText';

const TTS_BASE = 'https://texttospeech.googleapis.com/v1';

export type TtsGender = 'MALE' | 'FEMALE' | 'NEUTRAL';

interface GoogleVoice {
  name: string;
  ssmlGender?: string;
  languageCodes?: string[];
}

/** Is Cloud TTS configured at all? The Vertex project and one auth mode. */
export function cloudTtsConfigured(): boolean {
  return vertexAiConfig() !== null;
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

// Cache the best-tier voices per (languageCode|gender) for the lifetime of the
// server instance — the voices list is stable and the lookup costs a round-trip.
const voiceCache = new Map<string, string[]>();

// Once Google refused the credential (401/403), stop asking on every request: each caller answers its own no-voice
// path straight away instead of paying a round-trip that cannot succeed until the project is fixed.
let credentialRefused = false;

/** Told the HTTP status of each refusal (0 when no answer came), so a caller can tell a lasting refusal from an outage. */
export type TtsRefusal = (status: number) => void;

/** Is a Cloud TTS refusal one a retry cannot fix? Any 4xx but a timeout (408) or a rate limit (429). */
export function isLastingTtsRefusal(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** The bearer header for one Cloud TTS call, or null (no config, no token) — before any request is made. */
async function authHeaders(): Promise<Record<string, string> | null> {
  if (credentialRefused || !vertexAiConfig()) return null;
  try {
    return { Authorization: `Bearer ${await getVertexAccessToken(false)}` };
  } catch {
    return null;
  }
}

function noteRefusal(status: number, onRefusal?: TtsRefusal): void {
  if (status === 401 || status === 403) credentialRefused = true;
  onRefusal?.(status);
}

/**
 * Resolve the best available Google voice for a language, preferring a matching
 * gender. Returns the voice `name` (e.g. `ka-GE-Chirp3-HD-Aoede`) or null.
 * `variant` picks among the voices of the best tier (wrapping round), so two characters of one gender can sound apart.
 */
export async function pickBestGoogleVoice(
  languageCode: string,
  gender?: TtsGender,
  onRefusal?: TtsRefusal,
  variant = 0,
): Promise<string | null> {
  const cacheKey = `${languageCode}|${gender ?? 'ANY'}`;
  const pick = (best: string[]) => (best.length ? best[Math.abs(Math.trunc(variant)) % best.length] ?? null : null);
  const cached = voiceCache.get(cacheKey);
  if (cached) return pick(cached);
  const auth = await authHeaders();
  if (!auth) return null;

  try {
    const res = await fetch(`${TTS_BASE}/voices?languageCode=${encodeURIComponent(languageCode)}`, {
      headers: auth,
      redirect: 'manual',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      // A refusal says nothing about the voices, so it is not cached: the next request asks again (unless 401/403).
      noteRefusal(res.status, onRefusal);
      return null;
    }
    const data = (await res.json()) as { voices?: GoogleVoice[] };
    const voices = (data.voices ?? []).filter((v) =>
      (v.languageCodes ?? []).some((c) => c.toLowerCase().startsWith(languageCode.toLowerCase().slice(0, 2))),
    );
    // Prefer the requested gender, but fall back to any voice rather than fail.
    const genderMatch = gender
      ? voices.filter((v) => (v.ssmlGender ?? '').toUpperCase() === gender)
      : [];
    const pool = genderMatch.length ? genderMatch : voices;
    pool.sort((a, b) => voiceTierRank(b.name) - voiceTierRank(a.name) || a.name.localeCompare(b.name));
    const top = pool.length ? voiceTierRank(pool[0]!.name) : 0;
    const best = pool.filter((v) => voiceTierRank(v.name) === top).map((v) => v.name);
    voiceCache.set(cacheKey, best);
    return pick(best);
  } catch {
    onRefusal?.(0);
    return null;
  }
}

/** The Cloud TTS language for a text: the declared locale's, else detected from the script. */
export function ttsLanguageCode(text: string, locale?: string | null): string {
  if (locale === 'ka') return 'ka-GE';
  if (locale === 'ru') return 'ru-RU';
  if (locale === 'en') return 'en-US';
  if (/[ა-ჿ]/.test(text)) return 'ka-GE';
  if (/[А-яЁё]/.test(text)) return 'ru-RU';
  return 'en-US';
}

export interface GoogleTtsOptions {
  languageCode?: string;
  gender?: TtsGender;
  /** Which of the best-tier voices of that gender (see pickBestGoogleVoice). 0, the first, when unset. */
  variant?: number;
  /** 0.25–4.0; Cloud TTS' default is 1.0. Georgian reads at 0.97 unless told otherwise. */
  speakingRate?: number;
  onRefusal?: TtsRefusal;
}

/**
 * Longest text one request carries. Cloud TTS takes up to 5,000 bytes of input and a Georgian letter is 3 bytes in
 * UTF-8, so a longer text is read in sentence-sized parts (one voice, in order) and the MP3 frames are joined.
 */
export const GOOGLE_TTS_PART_CHARS = 1500;
/** Longest text one synthesis reads at all: the old TTS route's bound. */
export const GOOGLE_TTS_MAX_CHARS = 5000;

async function synthesizePart(
  text: string,
  languageCode: string,
  voiceName: string,
  speakingRate: number,
  onRefusal?: TtsRefusal,
): Promise<Buffer | null> {
  const auth = await authHeaders();
  if (!auth) return null;
  try {
    const res = await fetch(`${TTS_BASE}/text:synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      redirect: 'manual',
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: 'MP3', speakingRate, pitch: 0 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error('[google-tts] synth error', res.status, voiceName);
      noteRefusal(res.status, onRefusal);
      return null;
    }
    const data = (await res.json()) as { audioContent?: string };
    if (!data.audioContent) return null;
    const buf = Buffer.from(data.audioContent, 'base64');
    return buf.byteLength >= 256 ? buf : null;
  } catch {
    onRefusal?.(0);
    return null;
  }
}

/**
 * Synthesise `text` to an MP3 ArrayBuffer via Google Cloud TTS, auto-selecting
 * the best available neural voice for the detected/declared language. Returns
 * null on any failure; a part that fails fails the whole read, never a hole.
 */
export async function synthesizeGoogleTts(text: string, opts: GoogleTtsOptions = {}): Promise<ArrayBuffer | null> {
  const clean = (text ?? '').trim().slice(0, GOOGLE_TTS_MAX_CHARS);
  if (!clean) return null;
  const languageCode = opts.languageCode ?? ttsLanguageCode(clean);

  // Best available neural voice. If the lookup found nothing (no voices, no config, or a refused credential), bail so
  // the caller answers its own no-voice path instead of issuing a synth call that would also fail.
  const voiceName = await pickBestGoogleVoice(languageCode, opts.gender, opts.onRefusal, opts.variant);
  if (!voiceName) return null;

  const rate = Math.min(4, Math.max(0.25, opts.speakingRate ?? (languageCode === 'ka-GE' ? 0.97 : 1)));
  const parts = splitSpokenText(clean, GOOGLE_TTS_PART_CHARS);
  const read = await Promise.all(parts.map((p) => synthesizePart(p, languageCode, voiceName, rate, opts.onRefusal)));
  if (!read.length || read.some((b) => !b)) return null;
  const buf = read.length === 1 ? read[0]! : Buffer.concat(read as Buffer[]);
  // Return a copy backed by a standalone ArrayBuffer.
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/** Map a film voice persona to a Google TTS gender hint. */
export function genderForPersona(
  persona: 'male' | 'female' | 'child' | 'elder' | 'young' | 'narrator',
): TtsGender {
  if (persona === 'female' || persona === 'child') return 'FEMALE';
  return 'MALE';
}

/** Drops the memoised voices and refusal so the next call starts fresh. Tests only. */
export function __resetGoogleTtsForTests(): void {
  voiceCache.clear();
  credentialRefused = false;
}
