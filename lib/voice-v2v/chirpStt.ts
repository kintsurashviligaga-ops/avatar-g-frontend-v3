import 'server-only';

/**
 * Cloud Speech-to-Text Chirp 3: the owner's `?stt=chirp_3` dictation trial (GG card 2026-10-30 18:00Z, "კი, Chirp 3
 * სცადე"). Never the default, never a step-down, honoured for an admin only (app/api/voice/transcribe).
 *
 * Why it is tried: 3.6 Flash's first text comes 5–7 s after the tap on the owner's iPhone, and Google's transcribe
 * model wrote Georgian in Armenian letters (2026-10-30). Chirp 3 is a speech model, not a prompted LLM, and it is told
 * the languages to expect (`languageCodes`: Georgian, Russian, English), so it has no other alphabet to wander into.
 * Its Georgian is Preview (Chirp 3 language table, read 2026-10-30). Whether it is faster, and right, on the owner's
 * phone is UNVERIFIED until the owner dictates.
 *
 * The call: Speech-to-Text V2 `recognize` on the default recognizer (`recognizers/_`) at the `us` multi-region (Vercel
 * runs in iad1), with the same Workload Identity token as Vertex AI (lib/veo/vertexAuth), billed to the same project.
 * No API key is read. An unconfigured Vertex AI is an `auth` error before any request, and the token rides only in
 * the Authorization header (`redirect: 'manual'`). Google answers 403 until the Speech-to-Text API is on for the project
 * and the service account may call it (`speech.recognizers.recognize`, in the Cloud Speech Client role): the owner sees
 * Google's reason in the mic's warning (the route's admin diagnostics).
 *
 * Price: $0.016 per minute of audio, counted in one-second steps (Speech-to-Text pricing, V2 standard models, read
 * 2026-10-30); the route books it from the duration Google says it billed.
 */
import { getVertexAccessToken, vertexAiConfig } from '@/lib/veo/vertexAuth';
import { CHIRP_STT_MODEL } from '@/lib/ai/google/models';
import { GeminiSttError, classifySttStatus } from '@/lib/voice-v2v/geminiStt';

/** The V2 location Chirp 3 is GA in that sits nearest Vercel's iad1 (the other GA multi-region is `eu`). */
export const CHIRP_LOCATION = 'us';

/** USD per minute of audio, V2 standard recognition, 0–500,000 minutes a month. */
export const CHIRP_USD_PER_MINUTE = 0.016;

/** A single `recognize` takes audio shorter than a minute (longer audio needs BatchRecognize). */
export const CHIRP_SYNC_MAX_SECONDS = 60;

/** Inside the route's 30 s: an answer later than this would be useless to the mic anyway. */
const CHIRP_TIMEOUT_MS = 20_000;

/** The site's three dictation languages, the one asked for first. 'auto' and anything unknown start with Georgian. */
const SITE_LANGUAGES = ['ka-GE', 'ru-RU', 'en-US'] as const;

export function chirpLanguageCodes(language: string): string[] {
  const first = (SITE_LANGUAGES as readonly string[]).includes(language) ? language : 'ka-GE';
  return [first, ...SITE_LANGUAGES.filter((l) => l !== first)];
}

/** A protobuf Duration as JSON (`"3s"`, `"2.500s"`) → seconds, or null. */
export function durationSeconds(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(raw.trim());
  return m ? Number(m[1]) : null;
}

/** A WAV clip's length from its byte rate (the recorder sends 16 kHz WAV), or null for anything else. */
export function wavSeconds(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 44) return null;
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  const byteRate = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(28, true);
  return byteRate ? (bytes.byteLength - 44) / byteRate : null;
}

/** What `seconds` of audio costs, rounded up to whole seconds as Google bills it, in micro-dollars. */
export function chirpCostUsd(seconds: number): number {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 0;
  return Math.round((s / 60) * CHIRP_USD_PER_MINUTE * 1_000_000) / 1_000_000;
}

export interface ChirpSttResult {
  text: string;
  model: string;
  /** ISO 639-1 code of the language Chirp heard (`ka`, `ru`, `en`), when it named one. */
  spoken?: string;
  /** Seconds Google billed; the clip's own length when Google said nothing, a full minute when that is unknown too. */
  billedSeconds: number;
}

type RecognizeResponse = {
  results?: Array<{ alternatives?: Array<{ transcript?: string }>; languageCode?: string }>;
  metadata?: { totalBilledDuration?: string };
};

/** Google's `{ error: { message } }`, bounded; the raw body when it is not that shape. */
function googleReason(body: string): string {
  let reason = body;
  try {
    const m = (JSON.parse(body) as { error?: { message?: unknown } }).error?.message;
    if (typeof m === 'string' && m.trim()) reason = m;
  } catch {
    /* not JSON */
  }
  return reason.replace(/\s+/g, ' ').trim().slice(0, 240);
}

/**
 * Transcribe one clip with Chirp 3. Throws GeminiSttError (the route's one STT error type; the codes are the same)
 * on a miss, so the route answers it as it answers a Gemini miss: an empty transcript and `stt_unavailable`.
 */
export async function transcribeWithChirp(audio: Uint8Array, language: string): Promise<ChirpSttResult> {
  const fail = (message: string, code: ConstructorParameters<typeof GeminiSttError>[1], status?: number) =>
    new GeminiSttError(message, code, status, CHIRP_STT_MODEL);
  const config = vertexAiConfig();
  if (!config) throw fail('Vertex AI is not configured', 'auth');
  const clipSeconds = wavSeconds(audio);
  if (clipSeconds !== null && clipSeconds > CHIRP_SYNC_MAX_SECONDS) {
    throw fail(`Chirp 3 takes under ${CHIRP_SYNC_MAX_SECONDS} s in one request; this clip is ${Math.round(clipSeconds)} s`, 'bad_request');
  }
  let token: string;
  try {
    token = await getVertexAccessToken(false);
  } catch {
    throw fail('Chirp 3: no Google access token', 'auth');
  }

  const url =
    `https://${CHIRP_LOCATION}-speech.googleapis.com/v2/projects/${encodeURIComponent(config.projectId)}` +
    `/locations/${CHIRP_LOCATION}/recognizers/_:recognize`;
  const content = Buffer.from(audio).toString('base64');
  const recognize = (languageCodes: string[]) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      redirect: 'manual',
      body: JSON.stringify({ config: { autoDecodingConfig: {}, model: CHIRP_STT_MODEL, languageCodes }, content }),
      signal: AbortSignal.timeout(CHIRP_TIMEOUT_MS),
    });

  let res: Response;
  try {
    const codes = chirpLanguageCodes(language);
    res = await recognize(codes);
    // Several languages in one request is documented for chirp_3, but not whether a Preview one (ka-GE) may sit with
    // GA ones: a 400 is asked once more with the first language alone. Google bills only audio it processed.
    if (res.status === 400) res = await recognize(codes.slice(0, 1));
  } catch (err) {
    throw fail(`Chirp 3 network error: ${err instanceof Error ? err.name : 'error'}`, 'network');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw fail(`Chirp 3 STT failed (${res.status}): ${googleReason(body)}`, classifySttStatus(res.status, body), res.status);
  }

  const data = (await res.json().catch(() => ({}))) as RecognizeResponse;
  const results = Array.isArray(data.results) ? data.results : [];
  const text = results
    .map((r) => r.alternatives?.[0]?.transcript?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const heard = results.find((r) => typeof r.languageCode === 'string' && r.languageCode)?.languageCode;
  const spoken = heard ? heard.slice(0, 2).toLowerCase() : null;
  const billedSeconds = durationSeconds(data.metadata?.totalBilledDuration) ?? clipSeconds ?? CHIRP_SYNC_MAX_SECONDS;
  return { text, model: CHIRP_STT_MODEL, ...(spoken ? { spoken } : {}), billedSeconds };
}
