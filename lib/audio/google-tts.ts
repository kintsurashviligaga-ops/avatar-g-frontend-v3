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
 * Voices: for English and Russian, rather than hard-code a voice name that may not exist on the project, this module
 * queries the voices list once per language and gender, ranks what is available by quality tier
 * (Chirp3-HD › Chirp/Studio › Neural2 › WaveNet › Standard) and uses the best. The list call is free; only
 * `text:synthesize` is billed.
 *
 * Georgian: Cloud TTS has no ka-GE voice — neither Chirp 3 HD nor the classic tiers list one (the production voices
 * list for ka-GE came back empty on 2026-10-22). Georgian lines are read by Gemini-TTS instead: the same Cloud TTS
 * `text:synthesize` call, the same token and project, with `voice.modelName` = GEMINI_TTS_MODEL and one of its
 * prebuilt voices. Gemini-TTS lists ka-GE among its Preview languages. It is a Google model on the same API, not a
 * fallback: Georgian always goes there, and nothing else stands behind it.
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

/** The Gemini-TTS model that reads Georgian (ka-GE is one of its Preview languages on Cloud TTS). */
export const GEMINI_TTS_MODEL = 'gemini-2.5-flash-tts';

/**
 * Gemini-TTS prebuilt voices by gender: a short pick of its 14 female and 16 male voices. `variant` walks the list, so
 * two characters of one gender can sound apart, as the classic best-tier voices do.
 */
export const GEMINI_TTS_VOICES: Readonly<Record<'FEMALE' | 'MALE', readonly string[]>> = {
  FEMALE: ['Kore', 'Aoede', 'Leda', 'Zephyr'],
  MALE: ['Charon', 'Puck', 'Orus', 'Fenrir'],
};

/** Does this language read with Gemini-TTS? Georgian only: Cloud TTS lists no ka-GE voice. */
export function readsWithGeminiTts(languageCode: string): boolean {
  return languageCode.toLowerCase().startsWith('ka');
}

/** The Gemini-TTS voice for a gender (no gender or NEUTRAL reads with a female voice) and variant (wrapping round). */
export function geminiTtsVoice(gender?: TtsGender, variant = 0): string {
  const list = GEMINI_TTS_VOICES[gender === 'MALE' ? 'MALE' : 'FEMALE'];
  return list[Math.abs(Math.trunc(variant)) % list.length]!;
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
// A 401/403 on a Gemini-TTS read is remembered on its own: Gemini-TTS also needs aiplatform.endpoints.predict on the
// project, so a refusal there says nothing about the classic voices, and English and Russian keep reading.
let geminiRefused = false;

/** Told the HTTP status of each refusal (0 when no answer came), so a caller can tell a lasting refusal from an outage. */
export type TtsRefusal = (status: number) => void;

/** Is a Cloud TTS refusal one a retry cannot fix? Any 4xx but a timeout (408) or a rate limit (429). */
export function isLastingTtsRefusal(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** The bearer header for one Cloud TTS call, or null (no config, no token) — before any request is made. */
async function authHeaders(gemini = false): Promise<Record<string, string> | null> {
  if (credentialRefused || (gemini && geminiRefused) || !vertexAiConfig()) return null;
  try {
    return { Authorization: `Bearer ${await getVertexAccessToken(false)}` };
  } catch {
    return null;
  }
}

function noteRefusal(status: number, onRefusal?: TtsRefusal, gemini = false): void {
  if (status === 401 || status === 403) {
    if (gemini) geminiRefused = true;
    else credentialRefused = true;
  }
  onRefusal?.(status);
}

/**
 * Resolve the best available Google voice for a language, preferring a matching
 * gender. Returns the voice `name` (e.g. `en-US-Chirp3-HD-Aoede`) or null.
 * Georgian has no listed voice (see geminiTtsVoice).
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

export interface CloudTtsCheck {
  /** unconfigured: no Vertex config · down: no token, a refusal or no answer · degraded: the list answered empty. */
  state: 'ok' | 'degraded' | 'down' | 'unconfigured';
  detail: string;
}

/** The language the health check lists: one with classic voices, so an empty answer means the list itself is wrong. */
const CHECK_LANGUAGE = 'en-US';

/**
 * The voice health check, for the health routes and the admin probe: one voices-list call (free, nothing is
 * synthesised or billed), never cached and asked even after a refusal, so it shows the project as it is now. An answer
 * shows the Cloud Text-to-Speech API is on and the service account may call it. Georgian is read by Gemini-TTS, whose
 * voices this list does not hold, so only a billed line proves the Georgian read itself; the detail says so.
 */
export async function checkCloudTts(): Promise<CloudTtsCheck> {
  if (!vertexAiConfig()) return { state: 'unconfigured', detail: 'Vertex AI config missing (Cloud TTS runs on its identity)' };
  let token: string;
  try {
    token = await getVertexAccessToken(false);
  } catch {
    return { state: 'down', detail: 'no Vertex access token' };
  }
  try {
    const res = await fetch(`${TTS_BASE}/voices?languageCode=${CHECK_LANGUAGE}`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const why = res.status === 401 || res.status === 403 ? ' (the Cloud Text-to-Speech API is off on the project, or the service account is not allowed)' : '';
      return { state: 'down', detail: `voices list HTTP ${res.status}${why}` };
    }
    const data = (await res.json().catch(() => null)) as { voices?: GoogleVoice[] } | null;
    const listed = (data?.voices ?? []).filter((v) =>
      (v.languageCodes ?? []).some((c) => c.toLowerCase() === CHECK_LANGUAGE.toLowerCase()),
    );
    if (!listed.length) return { state: 'degraded', detail: `the voices list answered with no ${CHECK_LANGUAGE} voice` };
    return { state: 'ok', detail: `Cloud TTS answers (${listed.length} ${CHECK_LANGUAGE} voices) · Georgian on ${GEMINI_TTS_MODEL}` };
  } catch {
    return { state: 'down', detail: 'voices list did not answer' };
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
  /** Which of the best-tier voices of that gender (see pickBestGoogleVoice; Georgian: geminiTtsVoice). 0 when unset. */
  variant?: number;
  /** 0.25–4.0 for a classic voice; Cloud TTS' default is 1.0. Not sent for Georgian (Gemini-TTS documents none). */
  speakingRate?: number;
  onRefusal?: TtsRefusal;
}

/**
 * Longest text one request carries. Cloud TTS takes up to 5,000 bytes of input and a Cyrillic letter is 2 bytes in
 * UTF-8, so a longer text is read in sentence-sized parts (one voice, in order) and the MP3 frames are joined.
 */
export const GOOGLE_TTS_PART_CHARS = 1500;
/** The same for Gemini-TTS, whose text field takes up to 4,000 bytes: 1,200 Georgian letters are 3,600 bytes. */
export const GEMINI_TTS_PART_CHARS = 1200;
/**
 * Longest text one synthesis reads at all: the old TTS route's bound. A longer text is refused (null) before any request;
 * it used to be cut here without a word, so the end of a long text was never spoken (MASTER TASK v3.1 §5.3.1). Callers
 * bound their own text below it (orbit 2,500, voice-lab 5,000, film narration 2,400, voice-v2v sentence chunks, and
 * /api/elevenlabs/tts answers 413); an Agent G Telegram reply over it takes that handler's existing miss path (sent as text).
 */
export const GOOGLE_TTS_MAX_CHARS = 5000;

/**
 * One `text:synthesize` call. A classic voice carries the speaking rate and pitch; a Gemini-TTS voice names its model
 * and sends only the encoding (Google documents no rate or pitch for Gemini-TTS, so none is sent).
 */
async function synthesizePart(
  text: string,
  languageCode: string,
  voiceName: string,
  speakingRate: number,
  onRefusal?: TtsRefusal,
  geminiModel?: string,
): Promise<Buffer | null> {
  const gemini = Boolean(geminiModel);
  const auth = await authHeaders(gemini);
  if (!auth) return null;
  try {
    const res = await fetch(`${TTS_BASE}/text:synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      redirect: 'manual',
      body: JSON.stringify({
        input: { text },
        voice: geminiModel ? { languageCode, name: voiceName, modelName: geminiModel } : { languageCode, name: voiceName },
        audioConfig: geminiModel ? { audioEncoding: 'MP3' } : { audioEncoding: 'MP3', speakingRate, pitch: 0 },
      }),
      signal: AbortSignal.timeout(gemini ? 60_000 : 30_000),
    });
    if (!res.ok) {
      console.error('[google-tts] synth error', res.status, geminiModel ?? voiceName);
      noteRefusal(res.status, onRefusal, gemini);
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
 * Synthesise `text` to an MP3 ArrayBuffer via Google Cloud TTS: Georgian with a Gemini-TTS voice, any other language
 * with the best available neural voice for the detected/declared language. Returns null on any failure; a part that
 * fails fails the whole read, never a hole. A text over GOOGLE_TTS_MAX_CHARS is null before any request.
 */
export async function synthesizeGoogleTts(text: string, opts: GoogleTtsOptions = {}): Promise<ArrayBuffer | null> {
  const clean = (text ?? '').trim();
  if (!clean || clean.length > GOOGLE_TTS_MAX_CHARS) return null;
  const languageCode = opts.languageCode ?? ttsLanguageCode(clean);

  if (readsWithGeminiTts(languageCode)) {
    // Cloud TTS lists no Georgian voice, so there is nothing to look up: Gemini-TTS reads it with a prebuilt voice.
    const voiceName = geminiTtsVoice(opts.gender, opts.variant);
    return joinParts(
      await Promise.all(
        splitSpokenText(clean, GEMINI_TTS_PART_CHARS).map((p) =>
          synthesizePart(p, 'ka-GE', voiceName, 1, opts.onRefusal, GEMINI_TTS_MODEL),
        ),
      ),
    );
  }

  // Best available neural voice. If the lookup found nothing (no voices, no config, or a refused credential), bail so
  // the caller answers its own no-voice path instead of issuing a synth call that would also fail.
  const voiceName = await pickBestGoogleVoice(languageCode, opts.gender, opts.onRefusal, opts.variant);
  if (!voiceName) return null;

  const rate = Math.min(4, Math.max(0.25, opts.speakingRate ?? 1));
  const parts = splitSpokenText(clean, GOOGLE_TTS_PART_CHARS);
  return joinParts(await Promise.all(parts.map((p) => synthesizePart(p, languageCode, voiceName, rate, opts.onRefusal))));
}

/** The parts' MP3 frames joined in order, or null when there is none or any part is missing. */
function joinParts(read: (Buffer | null)[]): ArrayBuffer | null {
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
  geminiRefused = false;
}
