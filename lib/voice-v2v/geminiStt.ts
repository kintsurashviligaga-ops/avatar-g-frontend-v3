import 'server-only';

/**
 * Gemini speech-to-text: a multimodal generateContent model given a short "transcribe this audio" prompt.
 *
 * The ONLY engine of /api/voice/transcribe (MASTER TASK v3.1): no Replicate, OpenAI or Deepgram leg runs, whatever
 * AI_GOOGLE_ONLY says.
 *
 * ⚠️ THE CONTAINER DECIDES WHETHER THIS WORKS AT ALL. Gemini's documented AUDIO inputs are WAV, MP3, AIFF, AAC,
 * OGG and FLAC. The browser's MediaRecorder produces WebM/Opus (Chrome, Firefox) or MP4/AAC (Safari) — neither is
 * on that list, and the repo observed Gemini rejecting them sent as audio/webm / audio/mp4. `geminiAudioInput`
 * therefore (1) sniffs the real container from the bytes (a declared MIME can be empty or wrong), (2) sends the
 * documented audio types as-is, and (3) sends WebM / MP4 / 3GPP under their documented VIDEO MIME types, whose
 * audio track Gemini also understands. (3) is UNVERIFIED for audio-only files (`native: false` marks it); the
 * real fix is the client recording WAV (AudioWorklet), which this route already accepts.
 *
 * The call goes through lib/ai/google/transport: Vertex AI with a Workload Identity token, the only transport under
 * MASTER TASK v3.1 (no AI Studio key is read). The token is never logged or returned, and an unconfigured Vertex AI
 * is an `auth` error before any provider I/O, never a switch to another transport.
 */
import { NotConfiguredError } from '@/lib/contracts/geminiTransport';
import { googleModelFetch, googleTransportBlocker } from '@/lib/ai/google/transport';
import { DEFAULT_STT_MODEL, isRetiredModel, normalizeModelId, sttModel } from '@/lib/ai/google/models';

/** True when Vertex AI can serve a call (the name predates Vertex; no key is involved). */
export function hasGeminiSttKey(): boolean {
  return !googleTransportBlocker();
}

/** Why Vertex AI cannot serve a call right now (names only, never values), or null. The route shows it to the owner. */
export function geminiSttBlocker(): string | null {
  return googleTransportBlocker();
}

// ─── Model chain ─────────────────────────────────────────────────────────────

/**
 * Step-downs after the configured STT model: the default (3.6 Flash), 3.5 Flash, then 3.8 Flash — the chat's Flash
 * models (DEFAULT_CHAT_MODELS.standard), fastest first. Google RETIRES aliases without notice (gemini-2.0-flash went 404
 * and silently killed Georgian dictation), so a model-missing / overloaded / rate-limited / timed-out answer moves to
 * the next id. Retired ids (gemini-2.0-*, 1.5-*) and 2.5 ids never appear (a new Google project gets 404 "no longer
 * available to new users" for them), nor does `gemini-flash-latest`, a Gemini-API-only alias that answers 404 on
 * Vertex AI.
 *
 * ⚠️ THE CHAT CAN STEP DOWN WHERE THE MIC COULD NOT (2026-10-24): the chat rotates on a missing model or a 429, the mic
 * stopped at the first answer. ⚠️ AND 3.8 FLASH WAS TOO SLOW (2026-10-25): the owner's dictation ended in a
 * TimeoutError on it after 22 s, so it is the LAST step now, not the first (lib/ai/google/models DEFAULT_STT_MODEL).
 */
const STT_STEP_DOWNS: readonly string[] = [DEFAULT_STT_MODEL, 'gemini-3.5-flash', 'gemini-3.8-flash'];

/**
 * [sttModel(), …step-downs], de-duplicated, retired and malformed ids dropped. Every id is one Vertex AI serves:
 * sttModel() only answers from STT_MODELS, which leaves out the Gemini-API-only `-latest` aliases (they answer 404
 * on Vertex AI, the only transport). No ModelCatalog lookup is needed, so the film voice check that imports this
 * module does not pull the whole catalog in (MASTER TASK v3.1 PR 5e).
 */
export function geminiSttModelChain(): string[] {
  const out: string[] = [];
  for (const raw of [sttModel(), ...STT_STEP_DOWNS]) {
    const id = normalizeModelId(raw);
    if (!id || isRetiredModel(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

// ─── Containers ──────────────────────────────────────────────────────────────

export type AudioContainer = 'wav' | 'mp3' | 'aiff' | 'aac' | 'ogg' | 'flac' | 'webm' | 'mp4' | '3gpp';

/** Containers Gemini documents as AUDIO input, with the MIME type it documents for each. */
const NATIVE_AUDIO_MIME: Readonly<Partial<Record<AudioContainer, string>>> = {
  wav: 'audio/wav',
  mp3: 'audio/mp3',
  aiff: 'audio/aiff',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
};

/** Browser-recorder containers Gemini documents only as VIDEO input (see the header — UNVERIFIED for audio-only). */
const VIDEO_MIME_FALLBACK: Readonly<Partial<Record<AudioContainer, string>>> = {
  webm: 'video/webm',
  mp4: 'video/mp4',
  '3gpp': 'video/3gpp',
};

const DECLARED_MIME: Readonly<Record<string, AudioContainer>> = {
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/vnd.wave': 'wav',
  'audio/mp3': 'mp3', 'audio/mpeg': 'mp3', 'audio/mpeg3': 'mp3', 'audio/x-mpeg-3': 'mp3', 'audio/x-mp3': 'mp3',
  'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff',
  'audio/aac': 'aac', 'audio/x-aac': 'aac', 'audio/aacp': 'aac',
  'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'application/ogg': 'ogg',
  'audio/flac': 'flac', 'audio/x-flac': 'flac',
  'audio/webm': 'webm', 'video/webm': 'webm',
  'audio/mp4': 'mp4', 'audio/m4a': 'mp4', 'audio/x-m4a': 'mp4', 'video/mp4': 'mp4',
  'audio/3gpp': '3gpp', 'video/3gpp': '3gpp',
};

/** `audio/webm;codecs=opus` → `webm`. Parameters (codecs, rate) are dropped; unknown types → null. */
export function containerFromMime(mime: string | null | undefined): AudioContainer | null {
  if (typeof mime !== 'string') return null;
  const base = mime.split(';')[0]!.trim().toLowerCase();
  return DECLARED_MIME[base] ?? null;
}

function ascii(b: Uint8Array, at: number, len: number): string {
  if (b.length < at + len) return '';
  let s = '';
  for (let i = at; i < at + len; i++) s += String.fromCharCode(b[i]!);
  return s;
}

/**
 * The container from its magic bytes, or null when the header is not one we know. Pure, never throws.
 * RIFF/WAVE, FORM/AIFF, OggS, fLaC, EBML (WebM), ISO-BMFF `ftyp` (MP4 / M4A / 3GP), ID3 or an MPEG frame sync (MP3),
 * and an ADTS sync (raw AAC).
 */
export function sniffAudioContainer(input: Uint8Array | ArrayBuffer | null | undefined): AudioContainer | null {
  if (!input) return null;
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b.length < 4) return null;
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') return 'wav';
  if (ascii(b, 0, 4) === 'FORM' && /^AIF[FC]$/.test(ascii(b, 8, 4))) return 'aiff';
  if (ascii(b, 0, 4) === 'OggS') return 'ogg';
  if (ascii(b, 0, 4) === 'fLaC') return 'flac';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  if (ascii(b, 4, 4) === 'ftyp') return /^3g/i.test(ascii(b, 8, 4)) ? '3gpp' : 'mp4';
  if (ascii(b, 0, 3) === 'ID3') return 'mp3';
  if (b[0] === 0xff) {
    const b1 = b[1]!;
    // ADTS: 12-bit sync 0xFFF, then the MPEG id bit and a 2-bit layer that is always 00.
    if ((b1 & 0xf6) === 0xf0) return 'aac';
    // MPEG audio frame: 11-bit sync 0xFFE and a non-zero layer.
    if ((b1 & 0xe0) === 0xe0 && (b1 & 0x06) !== 0) return 'mp3';
  }
  return null;
}

export interface GeminiAudioInput {
  /** The container, sniffed from the bytes first, the declared MIME second; null when neither says. */
  container: AudioContainer | null;
  /** The MIME type to send Gemini, or null when the container is unknown (do not call Gemini). */
  mimeType: string | null;
  /** True for a documented Gemini AUDIO type; false for the video-MIME best effort (or unknown). */
  native: boolean;
}

/**
 * What to hand Gemini for this upload. The BYTES win over the declared type: the studio falls back to
 * 'audio/webm' when a Blob has no type, and a recorder can label an MP4 as webm; a wrong MIME is a 400.
 */
export function geminiAudioInput(declaredMime: string | null | undefined, bytes?: Uint8Array | ArrayBuffer | null): GeminiAudioInput {
  const container = sniffAudioContainer(bytes) ?? containerFromMime(declaredMime);
  if (!container) return { container: null, mimeType: null, native: false };
  const nativeMime = NATIVE_AUDIO_MIME[container];
  if (nativeMime) return { container, mimeType: nativeMime, native: true };
  return { container, mimeType: VIDEO_MIME_FALLBACK[container] ?? null, native: false };
}

// ─── Transcription ───────────────────────────────────────────────────────────

const LANGUAGE_NAME: Record<string, string> = {
  'ka-GE': 'Georgian',
  'en-US': 'English',
  'ru-RU': 'Russian',
};

/**
 * The transcription instruction. The requested language is a HINT, never a target: "Transcribe this audio in
 * English" made Gemini TRANSLATE Georgian speech into English (and "in Georgian" turned Russian speech into Georgian).
 * Now every prompt says: write the language actually spoken, in its own script — Georgian in Mkhedruli (never Latin;
 * lib/voice/sttAccept rejects Latin for a Georgian request), Russian in Cyrillic. 'auto' gives no hint at all.
 *
 * The answer starts with the code of the language heard, `[ru] …` (splitSpokenTag): naming the language before
 * writing a word keeps the model in it, and lets transcribeWithGeminiDetailed catch a translation (isTranslated).
 * `firm` is that code after a translated answer: the retry is told the language outright.
 */
export function sttPrompt(language: string, firm?: string | null): string {
  const langName = LANGUAGE_NAME[language];
  const insist = firm ? NATIVE_SCRIPT[firm] : undefined;
  const hint = insist
    ? `The speaker speaks ${insist.name}. Write their ${insist.name} words in ${insist.script}, exactly as spoken; do NOT translate them into English or any other language.`
    : langName
      ? `The speaker most likely speaks ${langName}; if they speak another language, write that language instead.`
      : 'The speaker may speak Georgian, English, Russian or any other language.';
  return [
    'Transcribe this audio verbatim, in the language the speaker actually uses. NEVER translate, not even into the language of these instructions.',
    hint,
    'Georgian speech is written in the Georgian (Mkhedruli) alphabet, never in Latin letters; Russian in Cyrillic.',
    // Dictation, not a court record (owner's test 2026-10-25: "Please check the weather uh in Batumi uh"). Only sounds
    // that are never words: Georgian "ამ" is "this" and Russian "ну" is a word, so neither is listed.
    'Leave out hesitation sounds that are not words (uh, um, er, hmm, э-э, мм, ე-ე, მმ); keep every real word.',
    'First write the ISO 639-1 code of the language actually spoken in square brackets ([ka], [ru], [en] …), then a space, then ONLY the exact spoken words — no commentary, no quotes, no other labels. If silent, output nothing.',
  ].join(' ');
}

const CYRILLIC_LETTER_RE = /[Ѐ-ӿ]/;

/**
 * Languages written in ONE script, by ISO 639-1 code: an answer tagged with one of these and written in Latin
 * letters is a translation, never how anyone speaks them (English, and Latin-script languages, are never flagged).
 */
const NATIVE_SCRIPT: Readonly<Record<string, { name: string; script: string; re: RegExp }>> = {
  ka: { name: 'Georgian', script: 'the Georgian (Mkhedruli) alphabet', re: /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/ },
  ru: { name: 'Russian', script: 'Cyrillic', re: CYRILLIC_LETTER_RE },
  uk: { name: 'Ukrainian', script: 'Cyrillic', re: CYRILLIC_LETTER_RE },
  be: { name: 'Belarusian', script: 'Cyrillic', re: CYRILLIC_LETTER_RE },
  bg: { name: 'Bulgarian', script: 'Cyrillic', re: CYRILLIC_LETTER_RE },
  mk: { name: 'Macedonian', script: 'Cyrillic', re: CYRILLIC_LETTER_RE },
  kk: { name: 'Kazakh', script: 'Cyrillic', re: CYRILLIC_LETTER_RE },
  ky: { name: 'Kyrgyz', script: 'Cyrillic', re: CYRILLIC_LETTER_RE },
};

/** `[ru] Привет` → { spoken: 'ru', text: 'Привет' }. Brackets only, so speech that starts "So: …" keeps its words. */
const SPOKEN_TAG_RE = /^\s*[[(]([a-z]{2,3})(?:[-_][a-z]{2,4})?[\])]\s*/i;

export function splitSpokenTag(raw: string): { spoken: string | null; text: string } {
  const m = SPOKEN_TAG_RE.exec(raw);
  return m ? { spoken: m[1]!.toLowerCase(), text: raw.slice(m[0].length) } : { spoken: null, text: raw };
}

/** The answer names a one-script language but has none of its letters, only Latin ones: it was translated. */
export function isTranslated(spoken: string | null, text: string): boolean {
  const native = spoken ? NATIVE_SCRIPT[spoken] : undefined;
  return !!native && !native.re.test(text) && /[A-Za-z][^A-Za-z]*[A-Za-z]/.test(text);
}

export type GeminiSttErrorCode = 'auth' | 'quota' | 'rate_limited' | 'model_missing' | 'bad_request' | 'unavailable' | 'network';

export class GeminiSttError extends Error {
  readonly code: GeminiSttErrorCode;
  readonly status?: number;
  readonly model?: string;
  constructor(message: string, code: GeminiSttErrorCode, status?: number, model?: string) {
    super(message);
    this.name = 'GeminiSttError';
    this.code = code;
    this.status = status;
    this.model = model;
  }
}

/**
 * HTTP status (+ body) → code. ⚠️ 402 is OUR outage (the Google prepay ran dry — the 2026-09-29 incident), not the
 * caller's: it must never be retried on another model (same key, same wallet) or shown as the user's fault.
 */
export function classifySttStatus(status: number, body = ''): GeminiSttErrorCode {
  const b = body.toLowerCase();
  if (status === 402) return 'quota';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return /prepay|billing|credit/.test(b) ? 'quota' : 'rate_limited';
  if (status === 404) return 'model_missing';
  if (status === 400) {
    if (/api[_ ]?key|api_key_invalid/.test(b)) return 'auth';
    if (/no longer available|not found|is not supported for|unsupported model/.test(b)) return 'model_missing';
    return 'bad_request';
  }
  if (status >= 500) return 'unavailable';
  return 'bad_request';
}

export interface GeminiSttUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface GeminiSttResult {
  /** The transcript ('' = heard nothing). Whitespace collapsed, a lone "[silence]"-style note removed. */
  text: string;
  /** The model that answered. */
  model: string;
  /** The ISO 639-1 code the model named for the language it heard (`[ru] …`), when it named one. */
  spoken?: string;
  /** usageMetadata as Google reported it (for bookChatUsage), when present; a translated answer's retry adds to it. */
  usage?: GeminiSttUsage;
}

/**
 * Gemini 3 models documented to ACCEPT `thinkingLevel: 'minimal'`: 3.0 – 3.6 Flash and every 3.x Flash-Lite (Google's
 * thinking page, 2026-09-25 — the same allowlist as lib/ai/google/chatStream MINIMAL_OK_RE). 3.7 / 3.8 Flash and Pro
 * list it as an error (a 400 on 3.8 Flash, verified live 2026-10-02).
 */
const MINIMAL_OK_RE = /^gemini-3(?:\.[0-6])?-flash(?:-|$)|^gemini-3(?:\.\d+)?-flash-lite(?:-|$)/i;

/**
 * A transcript needs no reasoning and thinking adds seconds, so each model thinks as little as it accepts: the 2.5
 * Flash family `thinkingBudget: 0`; a Gemini 3 model that takes it `thinkingLevel: 'minimal'`, every other Gemini 3
 * model `'low'`. Anything else (`-latest` aliases can change family under us) gets the model default. A 400 that names
 * thinking moves to the next model (THINKING_REFUSED_RE), so a model that turns out to refuse 'minimal' on Vertex AI
 * costs one unbilled answer, not the dictation.
 */
function thinkingFor(model: string): Record<string, unknown> | undefined {
  if (isTranscribeModel(model)) return undefined;
  if (/^gemini-2\.5-flash(?:-lite)?(?:-|$)/i.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-3(?:\.\d+)?-/i.test(model)) return { thinkingLevel: MINIMAL_OK_RE.test(model) && !/(?:^|-)pro(?:-|$)/i.test(model) ? 'minimal' : 'low' };
  return undefined;
}

/**
 * A dedicated speech-to-text model (lib/ai/google/models TRANSCRIBE_MODEL): it transcribes what it hears, so it gets
 * the audio alone, with no prompt, no temperature and no thinking config (so no `[ru]` code either, and no translation
 * retry). UNVERIFIED which of those it would refuse; the owner's `?stt=` trial shows Google's answer.
 */
export function isTranscribeModel(model: string): boolean {
  return /^gemini-[\d.]+-transcribe(?:-|$)/i.test(model) && !/-live(?:-|$)/i.test(model);
}

/** A 400 about the thinking config: that model refuses what thinkingFor sent, the next one may not. */
const THINKING_REFUSED_RE = /thinking/i;

/**
 * Of the shared deadline, what one attempt leaves for the next model: an attempt that has a next model to try stops
 * this long before the deadline, so a slow model can no longer take the whole dictation with it.
 */
export const STT_FALLBACK_RESERVE_MS = 8_000;
/** No attempt gets less than this (a reserve never shrinks one below it). */
const STT_MIN_ATTEMPT_MS = 5_000;
/** A translated answer is asked again only with at least this long left before the deadline. */
const STT_RETRY_MIN_MS = 3_000;

/** Both calls of a translated answer's retry are billed: their usage adds up. */
function addUsage(a: GeminiSttUsage | undefined, b: GeminiSttUsage | undefined): GeminiSttUsage | undefined {
  if (!a || !b) return a ?? b;
  const sum = (x?: number, y?: number): number | undefined => (x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0));
  return { inputTokens: sum(a.inputTokens, b.inputTokens), outputTokens: sum(a.outputTokens, b.outputTokens), totalTokens: sum(a.totalTokens, b.totalTokens) };
}

const count = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined);

/** The model's answer is sometimes only a stage note ("[silence]", "(inaudible)") — that is "heard nothing". */
function cleanTranscript(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (/^[[(（][^\])）]{0,40}[\])）]\.?$/.test(t)) return '';
  return t;
}

/** Answers that move to the next model: Vertex AI quotas and capacity are per model, as the chat's rotation assumes. */
const ROTATES: ReadonlySet<GeminiSttErrorCode> = new Set(['model_missing', 'unavailable', 'rate_limited']);

/**
 * Transcribe a short clip with Gemini. Rotates to the next model when the model is missing, overloaded or rate
 * limited (a 429 is that model's bucket on Vertex AI; Google bills no failed call), refuses the thinking config, or
 * does not answer within its share of the deadline; an auth / quota / other bad-request answer throws a GeminiSttError
 * at once (another model on the same project would fail the same way). Bounded by ONE overall deadline across all
 * attempts, so it can never outlive the route's maxDuration; an attempt with a model after it stops
 * STT_FALLBACK_RESERVE_MS early, so that model still has time. The error names every model tried and its status, so
 * the owner's warning shows the whole chain, not only the last answer.
 */
export async function transcribeWithGeminiDetailed(
  audioBase64: string,
  mimeType: string,
  language: string,
  opts: { models?: readonly string[]; timeoutMs?: number } = {},
): Promise<GeminiSttResult> {
  const notReady = googleTransportBlocker();
  if (notReady) throw new GeminiSttError(notReady, 'auth');
  const models = (opts.models?.length ? [...opts.models] : geminiSttModelChain())
    .map((m) => normalizeModelId(m))
    .filter((m): m is string => !!m && !isRetiredModel(m));
  if (!models.length) throw new GeminiSttError('no STT model available', 'model_missing');

  const deadline = Date.now() + Math.max(1_000, opts.timeoutMs ?? 22_000);
  let last: GeminiSttError | null = null;
  const tried: string[] = [];
  /** `gemini-3.8-flash 429, gemini-3.6-flash 404: ` before the answer that ended the chain; '' after one attempt. */
  const chain = (): string => (tried.length > 1 ? `${tried.join(', ')}: ` : '');
  /** The language a translated answer named; the one retry insists on it (sttPrompt `firm`). */
  let firm: string | null = null;
  /** That translated answer: still returned if the retry cannot answer, rather than losing the dictation. */
  let translated: GeminiSttResult | null = null;
  let spent: GeminiSttUsage | undefined;

  try {
    for (let i = 0; i < models.length; i++) {
      const model = models[i]!;
      const remaining = deadline - Date.now();
      if (remaining < 500) break;
      const hasNext = i < models.length - 1;
      const attemptMs = hasNext
        ? Math.max(Math.min(remaining, STT_MIN_ATTEMPT_MS), remaining - STT_FALLBACK_RESERVE_MS)
        : remaining;
      const thinkingConfig = thinkingFor(model);
      // camelCase, as every other Vertex AI caller here sends it (the chat SDK, the image studio). Proto JSON also
      // accepts `inline_data`, the Developer API's documented spelling this used to send.
      const audio = { inlineData: { mimeType, data: audioBase64 } };
      const body = JSON.stringify(
        isTranscribeModel(model)
          ? { contents: [{ role: 'user', parts: [audio] }] }
          : {
              contents: [{ role: 'user', parts: [{ text: sttPrompt(language, firm) }, audio] }],
              generationConfig: { temperature: 0, maxOutputTokens: 1024, ...(thinkingConfig ? { thinkingConfig } : {}) },
            },
      );

      let res: Response;
      try {
        res = await googleModelFetch(model, 'generateContent', {
          method: 'POST',
          cache: 'no-store',
          body,
          signal: AbortSignal.timeout(attemptMs),
        });
      } catch (e) {
        if (e instanceof NotConfiguredError) throw new GeminiSttError(e.message, 'auth', undefined, model);
        // By name, not `instanceof Error`: AbortSignal.timeout's DOMException can come from another realm.
        const name = e && typeof e === 'object' && typeof (e as { name?: unknown }).name === 'string' ? (e as { name: string }).name : 'unknown';
        // This model did not answer in its share of the deadline: the next one gets the rest. A reset is not the
        // model's fault — stop there.
        if (name === 'TimeoutError' && hasNext) {
          tried.push(`${model} timeout`);
          last = new GeminiSttError(`${chain()}Gemini STT timed out on ${model} after ${Math.round(attemptMs / 1000)} s`, 'network', undefined, model);
          continue;
        }
        tried.push(`${model} ${name === 'TimeoutError' ? 'timeout' : 'network'}`);
        throw new GeminiSttError(`${chain()}Gemini STT network error on ${model}: ${name}`, 'network', undefined, model);
      }

      if (res.ok) {
        const json = (await res.json().catch(() => null)) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
        } | null;
        const parts = json?.candidates?.[0]?.content?.parts ?? [];
        const { spoken, text: said } = splitSpokenTag(parts.filter((p) => !p.thought).map((p) => p.text ?? '').join(''));
        const text = cleanTranscript(said);
        const u = json?.usageMetadata;
        spent = addUsage(spent, u
          ? { inputTokens: count(u.promptTokenCount), outputTokens: count(u.candidatesTokenCount), totalTokens: count(u.totalTokenCount) }
          : undefined);
        const result: GeminiSttResult = { text, model, ...(spoken ? { spoken } : {}), ...(spent ? { usage: spent } : {}) };
        // ⚠️ RUSSIAN SPEECH CAME BACK IN ENGLISH (GG, Production 2026-10-25 10:36Z, iPhone, 3.6 Flash): a fluent English
        // sentence for what was said in Russian, despite "NEVER translate". An answer that names a one-script language
        // and has none of its letters is asked once more, the language now stated outright.
        if (!firm && text && isTranslated(spoken, text) && deadline - Date.now() >= STT_RETRY_MIN_MS) {
          firm = spoken;
          translated = result;
          tried.push(`${model} translated (${spoken})`);
          i--;
          continue;
        }
        return result;
      }

      const detail = await res.text().catch(() => '');
      const code = classifySttStatus(res.status, detail);
      // Upstream text is trimmed and kept server-side (the route shows it to admins in ?diag only).
      tried.push(`${model} ${res.status}`);
      last = new GeminiSttError(`${chain()}Gemini STT failed (${res.status}) on ${model}: ${detail.slice(0, 160)}`, code, res.status, model);
      if (!ROTATES.has(code) && !(code === 'bad_request' && THINKING_REFUSED_RE.test(detail))) throw last;
    }

    throw last ?? new GeminiSttError('Gemini STT failed: no model answered before the deadline', 'network');
  } catch (e) {
    if (translated) return { ...translated, ...(spent ? { usage: spent } : {}) };
    throw e;
  }
}

/**
 * Legacy shape (text only). Throws on a provider error so the caller can decide. `mimeType` is sent as given —
 * pass `geminiAudioInput(...).mimeType` to get the container fix.
 */
export async function transcribeWithGemini(audioBase64: string, mimeType: string, language: string): Promise<string> {
  const { text } = await transcribeWithGeminiDetailed(audioBase64, mimeType || 'audio/wav', language);
  return text;
}
