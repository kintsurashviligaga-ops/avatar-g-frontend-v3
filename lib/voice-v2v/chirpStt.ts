import 'server-only';

/**
 * Cloud Speech-to-Text Chirp 3: the mic's engine for EVERYONE since GG's card of 2026-11-01 05:33Z ("Chirp
 * ყველასთვის"), after the owner's `?stt=chirp_3` trial (GG card 2026-10-30 18:00Z, "კი, Chirp 3 სცადე") wrote Georgian,
 * Russian and English right on the owner's iPhone (2026-11-01 05:30Z: „გესმის ჩემი ხმა? Can you hear me? Ты меня
 * слышишь?“, Stop→final p50 2.8 s against Gemini 3.6 Flash's 3.4–4.7 s). Gemini on the same Vertex project takes
 * the clip when Chirp cannot answer it: over a minute (CHIRP_SYNC_MAX_SECONDS), an error or a timeout, or an answer
 * that cannot be written (app/api/voice/transcribe). `STT_ENGINE=gemini` turns Chirp off for everyone
 * (chirpIsDefaultEngine). `?stt=chirp_3` still runs Chirp alone, with no Gemini after it, for the owner's timings.
 *
 * Why it was tried: 3.6 Flash's first text came 5–7 s after the tap on the owner's iPhone, and Google's transcribe
 * model wrote Georgian in Armenian letters (2026-10-30). Chirp 3 is a speech model, not a prompted LLM, and it is told
 * the languages to expect (`languageCodes`: Georgian, Russian, English). Its Georgian is Preview (Chirp 3 language
 * table, read 2026-10-30), and the owner's three-language sentence above is one sample per language.
 *
 * The call: Speech-to-Text V2 `recognize` on the default recognizer (`recognizers/_`) at the `us` multi-region (Vercel
 * runs in iad1), with the same Workload Identity token as Vertex AI (lib/veo/vertexAuth), billed to the same project.
 * No API key is read. An unconfigured Vertex AI is an `auth` error before any request, and the token rides only in
 * the Authorization header (`redirect: 'manual'`). Google answers 403 until the Speech-to-Text API is on for the project
 * and the service account may call it (`speech.recognizers.recognize`, in the Cloud Speech Client role): the owner sees
 * Google's reason in the mic's warning (the route's admin diagnostics).
 *
 * ⚠️ GEORGIAN CAME BACK IN HINDI LETTERS (GG, iPhone, 2026-10-31 06:49Z): with the three languages listed, Russian and
 * English were right but Georgian speech came back as Devanagari („चमेली के इसमें“). The list is a preference, not a
 * fence (the Chirp 3 page: "focus the model's resources on the most probable languages"), and Georgian is Preview. So
 * every clip is ALSO sent with Georgian alone, at the same time (no extra wait): Cyrillic or Latin from the listed
 * request is Russian or English and wins; otherwise the Georgian-only answer wins when it is in Georgian letters. A
 * script outside the three is never written into the box (see pickChirpLeg). Both requests are billed and booked.
 *
 * ⚠️ AND THEN IN LATIN NOISE (GG, iPhone, 2026-10-31 11:58Z, after the fix above): Russian and English right, but the
 * Georgian sentence came out as „G 7 6 0 0 0 0 0“ — the listed request's Latin, taken as English before the Georgian-only
 * answer was even looked at. Latin now counts as English only when it reads as words (chirpWordLike) and Chirp did not
 * say it heard Georgian. And a clear Russian or English answer is written as soon as it arrives: the Georgian-only
 * request cannot change it, so it is not waited for (11:58Z: first text p50 5.5 s with the wait, 4.1 s before it). It
 * carries the same clip, so Google bills it the same seconds, and it is booked as such without waiting.
 *
 * Price: $0.016 per minute of audio, counted in one-second steps (Speech-to-Text pricing, V2 standard models, read
 * 2026-10-30); the route books it from the duration Google says it billed, summed over both requests. Both requests
 * carry the clip, and every interim pass re-sends the clip so far (lib/voice/interimCadence), so a dictation costs
 * about $0.005 at 3 s, $0.02 at 10 s and $0.11 at a minute (passes at 0.9, 1.8, 2.7, 4.2, 6.3, 9.6 … 48.6 s, each
 * rounded up to whole seconds, plus the final pass, all twice). Estimates from the schedule, not a Google bill.
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

/**
 * Chirp's share when Gemini stands behind it (the default engine): a clip Chirp has not answered by then goes to
 * Gemini, which still has the rest of the route's 30 s. Chirp answered the owner's clips in 2.8 s (p50) and 4.4 s (p95)
 * from Stop, network included (2026-11-01 05:30Z).
 */
export const CHIRP_FIRST_TIMEOUT_MS = 10_000;

/**
 * Whether the mic's default engine is Chirp 3 (GG card 2026-11-01 05:33Z). `STT_ENGINE=gemini` (any case) turns it off
 * for everyone and the mic is Gemini alone again, as before; unset, or any other value, keeps Chirp.
 */
export function chirpIsDefaultEngine(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return (env.STT_ENGINE ?? '').trim().toLowerCase() !== 'gemini';
}

/** The site's three dictation languages, the one asked for first. 'auto' and anything unknown start with Georgian. */
const SITE_LANGUAGES = ['ka-GE', 'ru-RU', 'en-US'] as const;
const GEORGIAN = 'ka-GE';

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
  /** Seconds Google billed over both requests; a request's own clip length when Google said nothing, a full minute when that is unknown too. */
  billedSeconds: number;
  /** Which request's answer this is: the site's three languages listed, or Georgian alone. */
  leg: ChirpLeg;
  /** The language Chirp named (or `other script`) when its only answer was unreadable (letters outside ka/ru/en, Latin noise) and was dropped. */
  foreign?: string;
}

export type ChirpLeg = 'listed' | 'georgian';

/** The writing system a transcript is in: one of the site's three, another (Devanagari, Armenian …), or no letters. */
export type ChirpScript = 'georgian' | 'cyrillic' | 'latin' | 'other' | 'none';

export function chirpScript(text: string): ChirpScript {
  const n = (re: RegExp) => (text.match(re) || []).length;
  const georgian = n(/[\u10A0-\u10FF\u1C90-\u1CBF\u2D00-\u2D2F]/g);
  const cyrillic = n(/[\u0400-\u04FF]/g);
  const latin = n(/[A-Za-z\u00C0-\u024F]/g);
  const other = n(/\p{L}/gu) - georgian - cyrillic - latin;
  const top = Math.max(georgian, cyrillic, latin, other);
  if (top === 0) return 'none';
  if (other === top) return 'other';
  if (georgian === top) return 'georgian';
  return cyrillic === top ? 'cyrillic' : 'latin';
}

/**
 * Latin that reads as words: more letters than digits, and at least half the words two letters or longer. „Can you
 * hear me?“ and „Meet at 5“ are; the noise Georgian speech once came back as („G 7 6 0 0 0 0 0“, GG 2026-10-31) is not.
 */
export function chirpWordLike(text: string): boolean {
  const letters = (text.match(/\p{L}/gu) || []).length;
  const digits = (text.match(/\p{N}/gu) || []).length;
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const real = words.filter((w) => (w.match(/\p{L}/gu) || []).length >= 2).length;
  return letters > digits && real > 0 && real * 2 >= words.length;
}

/** One request's parsed answer. */
interface LegAnswer {
  text: string;
  spoken?: string;
  /** Google's languageCode as given (`ka-ge`, `hi-in` …). */
  heard?: string;
  billedSeconds: number;
}

/** Russian or English from the listed request: final, whatever the Georgian-only request says (pickChirpLeg rule 1). */
export function chirpListedDecisive(listed: LegAnswer): boolean {
  const script = chirpScript(listed.text);
  if (script === 'cyrillic') return true;
  return script === 'latin' && chirpWordLike(listed.text) && !(listed.heard ?? '').toLowerCase().startsWith('ka');
}

/**
 * Which answer goes into the box. `listed` = the request with the site's three languages, `georgian` = Georgian alone;
 * either may have failed (undefined).
 *   1. Cyrillic, or Latin words Chirp did not call Georgian, from the listed request: Russian or English speech,
 *      written as spoken (chirpListedDecisive; Latin noise is not English).
 *   2. Georgian letters from the Georgian-only request: Georgian speech (preferred over the listed request's Georgian,
 *      since that request was told to expect Georgian only).
 *   3. The listed request in Georgian, or silence, when the Georgian-only request has nothing better.
 *   4. The Georgian-only request when the listed one failed, unless it is in a foreign script or Latin noise too.
 * Otherwise nothing is written (the Hindi letters, the Latin noise above): `foreign` says what Chirp said it heard.
 * null = both failed.
 */
export function pickChirpLeg(listed: LegAnswer | undefined, georgian: LegAnswer | undefined): { answer: LegAnswer; leg: ChirpLeg; foreign?: string } | null {
  const ls = listed ? chirpScript(listed.text) : null;
  const gs = georgian ? chirpScript(georgian.text) : null;
  if (listed && chirpListedDecisive(listed)) return { answer: listed, leg: 'listed' };
  if (georgian && gs === 'georgian') return { answer: georgian, leg: 'georgian' };
  // Latin that does not read as words is noise, never written (GG 2026-10-31 11:58Z).
  const readable = (a: LegAnswer, script: ChirpScript | null) => script !== 'other' && (script !== 'latin' || chirpWordLike(a.text));
  if (listed && readable(listed, ls)) return { answer: listed, leg: 'listed' };
  if (!listed && georgian && readable(georgian, gs)) return { answer: georgian, leg: 'georgian' };
  const dropped = listed ?? georgian;
  if (!dropped) return null;
  return { answer: { ...dropped, text: '', spoken: undefined }, leg: listed ? 'listed' : 'georgian', foreign: dropped.heard || 'other script' };
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
export async function transcribeWithChirp(
  audio: Uint8Array,
  language: string,
  opts: { timeoutMs?: number } = {},
): Promise<ChirpSttResult> {
  const timeoutMs = Math.max(1_000, opts.timeoutMs ?? CHIRP_TIMEOUT_MS);
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
      signal: AbortSignal.timeout(timeoutMs),
    });

  const ask = async (languageCodes: string[]): Promise<LegAnswer> => {
    let res: Response;
    try {
      res = await recognize(languageCodes);
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
    // Each request is billed in whole seconds, so each is rounded up before the two are added.
    const billedSeconds = Math.ceil(durationSeconds(data.metadata?.totalBilledDuration) ?? clipSeconds ?? CHIRP_SYNC_MAX_SECONDS);
    return { text, ...(heard ? { spoken: heard.slice(0, 2).toLowerCase(), heard } : {}), billedSeconds };
  };

  const codes = chirpLanguageCodes(language);
  const askListed = async (): Promise<LegAnswer> => {
    try {
      return await ask(codes);
    } catch (err) {
      // Several languages in one request is documented for chirp_3, but not whether a Preview one (ka-GE) may sit with
      // GA ones: a 400 is asked once more with the first language alone (Georgian first: the other request is that).
      // Google bills only audio it processed.
      if (err instanceof GeminiSttError && err.status === 400 && codes[0] !== GEORGIAN) return ask(codes.slice(0, 1));
      throw err;
    }
  };
  const listedP = askListed();
  const georgianP = ask([GEORGIAN]);
  // Its answer is not waited for when the listed one is final; a refusal then must not surface as unhandled.
  georgianP.catch(() => undefined);
  const done = (picked: NonNullable<ReturnType<typeof pickChirpLeg>>, billedSeconds: number): ChirpSttResult => {
    const { text, spoken } = picked.answer;
    return {
      text,
      model: CHIRP_STT_MODEL,
      ...(spoken ? { spoken } : {}),
      billedSeconds,
      leg: picked.leg,
      ...(picked.foreign ? { foreign: picked.foreign } : {}),
    };
  };

  const [listed] = await Promise.allSettled([listedP]);
  // Russian or English: written now. The Georgian-only request sent the same clip, so it is booked at the same seconds
  // (one clip over-booked if it then fails: the safe direction).
  if (listed.status === 'fulfilled' && chirpListedDecisive(listed.value)) {
    return done({ answer: listed.value, leg: 'listed' }, listed.value.billedSeconds * 2);
  }
  const [georgian] = await Promise.allSettled([georgianP]);
  const ok = (r: PromiseSettledResult<LegAnswer>) => (r.status === 'fulfilled' ? r.value : undefined);
  const picked = pickChirpLeg(ok(listed), ok(georgian));
  if (!picked) throw listed.status === 'rejected' ? listed.reason : (georgian as PromiseRejectedResult).reason;
  return done(picked, [listed, georgian].reduce((sum, r) => sum + (ok(r)?.billedSeconds ?? 0), 0));
}
