import { googleAiConfigured, googleModelFetch } from '@/lib/ai/google/transport';
import 'server-only';

/**
 * Gemini speech-to-text: a multimodal generateContent model given a short "transcribe this audio" prompt.
 *
 * Two callers in /api/voice/transcribe:
 *   • AI_GOOGLE_ONLY (the default): this is the ONLY engine. No Replicate, OpenAI or Deepgram leg runs.
 *   • AI_GOOGLE_ONLY=0: the legacy cascade, where this is the zero-extra-key fallback leg.
 *
 * ⚠️ THE CONTAINER DECIDES WHETHER THIS WORKS AT ALL. Gemini's documented AUDIO inputs are WAV, MP3, AIFF, AAC,
 * OGG and FLAC. The browser's MediaRecorder produces WebM/Opus (Chrome, Firefox) or MP4/AAC (Safari) — neither is
 * on that list, and the repo observed Gemini rejecting them sent as audio/webm / audio/mp4. `geminiAudioInput`
 * therefore (1) sniffs the real container from the bytes (a declared MIME can be empty or wrong), (2) sends the
 * documented audio types as-is, and (3) sends WebM / MP4 / 3GPP under their documented VIDEO MIME types, whose
 * audio track Gemini also understands. (3) is UNVERIFIED for audio-only files (`native: false` marks it); the
 * real fix is the client recording WAV (AudioWorklet), which this route already accepts.
 *
 * The key is resolved through the shared pool (resolveGeminiKey) and travels in the x-goog-api-key HEADER — a key
 * in a URL lands in every proxy log, trace and error string on the way to Google. It is never logged or returned.
 */
import { DEFAULT_STT_MODEL, isRetiredModel, normalizeModelId, sttModel } from '@/lib/ai/google/models';


export function hasGeminiSttKey(): boolean {
  return googleAiConfigured();
}

// ─── Model chain ─────────────────────────────────────────────────────────────

/**
 * Step-downs after the configured STT model. Google RETIRES aliases without notice (gemini-2.0-flash went 404 and
 * silently killed Georgian dictation), so a model-missing / overloaded answer moves to the next id. Retired ids
 * (gemini-2.0-*, 1.5-*) never appear — `gemini-2.0-flash-lite` used to be the last step here — and neither does a
 * 2.5 id: a new Google project's key answers 404 "no longer available to new users" for them. The default leads the
 * step-downs so an operator override that fails still falls back to it (the chain de-duplicates).
 */
const STT_STEP_DOWNS = [DEFAULT_STT_MODEL, 'gemini-3.7-flash', 'gemini-flash-latest'] as const;

/** [sttModel(), …step-downs], de-duplicated, retired and malformed ids dropped. */
export function geminiSttModelChain(): string[] {
  const out: string[] = [];
  for (const raw of [sttModel(), ...STT_STEP_DOWNS]) {
    const id = normalizeModelId(raw);
    if (id && !isRetiredModel(id) && !out.includes(id)) out.push(id);
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
 */
export function sttPrompt(language: string): string {
  const langName = LANGUAGE_NAME[language];
  const hint = langName
    ? `The speaker most likely speaks ${langName}; if they speak another language, write that language instead.`
    : 'The speaker may speak Georgian, English, Russian or any other language.';
  return [
    'Transcribe this audio verbatim, in the language the speaker actually uses. NEVER translate.',
    hint,
    'Georgian speech is written in the Georgian (Mkhedruli) alphabet, never in Latin letters; Russian in Cyrillic.',
    'Output ONLY the exact spoken words — no commentary, no quotes, no labels, no extra text. If silent, output nothing.',
  ].join(' ');
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
  /** usageMetadata as Google reported it (for bookChatUsage), when present. */
  usage?: GeminiSttUsage;
}

/**
 * A transcript needs no reasoning and thinking adds seconds, so the models we have VERIFIED get their thinking turned
 * down with the field THEY take: the 2.5 Flash family `thinkingBudget: 0`; `gemini-3.8-flash` (the default) its
 * documented floor `thinkingLevel: 'low'` — `'minimal'` is a 400 on it (verified live 2026-10-02, together with 200 for
 * 'low'). A wrong field is a 400 that does not rotate, and `-latest` aliases can change family under us — so everything
 * else gets the model default.
 */
function thinkingFor(model: string): Record<string, unknown> | undefined {
  if (/^gemini-2\.5-flash(?:-lite)?(?:-|$)/i.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-3\.8-flash$/i.test(model)) return { thinkingLevel: 'low' };
  return undefined;
}

const count = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined);

/** The model's answer is sometimes only a stage note ("[silence]", "(inaudible)") — that is "heard nothing". */
function cleanTranscript(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (/^[[(（][^\])）]{0,40}[\])）]\.?$/.test(t)) return '';
  return t;
}

/**
 * Transcribe a short clip with Gemini. Rotates to the next model only when the model is missing or overloaded;
 * an auth / quota / rate-limit / bad-request answer throws a GeminiSttError at once (another model on the same key
 * would fail the same way — and bill another attempt). Bounded by ONE overall deadline across all attempts, so it
 * can never outlive the route's maxDuration.
 */
export async function transcribeWithGeminiDetailed(
  audioBase64: string,
  mimeType: string,
  language: string,
  opts: { models?: readonly string[]; timeoutMs?: number } = {},
): Promise<GeminiSttResult> {
  if (!googleAiConfigured()) throw new GeminiSttError('Gemini key is not configured', 'auth');
  const models = (opts.models?.length ? [...opts.models] : geminiSttModelChain())
    .map((m) => normalizeModelId(m))
    .filter((m): m is string => !!m && !isRetiredModel(m));
  if (!models.length) throw new GeminiSttError('no STT model available', 'model_missing');

  const deadline = Date.now() + Math.max(1_000, opts.timeoutMs ?? 22_000);
  let last: GeminiSttError | null = null;

  for (const model of models) {
    const remaining = deadline - Date.now();
    if (remaining < 500) break;
    const thinkingConfig = thinkingFor(model);
    const body = JSON.stringify({
      contents: [{ parts: [{ text: sttPrompt(language) }, { inline_data: { mime_type: mimeType, data: audioBase64 } }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 1024, ...(thinkingConfig ? { thinkingConfig } : {}) },
    });

    let res: Response;
    try {
      res = await googleModelFetch(model, 'generateContent', {
        method: 'POST',
        cache: 'no-store',
        body,
        signal: AbortSignal.timeout(remaining),
      });
    } catch (e) {
      // A timeout / reset is not the model's fault, and the deadline is shared — stop here.
      throw new GeminiSttError(`Gemini STT network error on ${model}: ${e instanceof Error ? e.name : 'unknown'}`, 'network', undefined, model);
    }

    if (res.ok) {
      const json = (await res.json().catch(() => null)) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
      } | null;
      const parts = json?.candidates?.[0]?.content?.parts ?? [];
      const text = cleanTranscript(parts.filter((p) => !p.thought).map((p) => p.text ?? '').join(''));
      const u = json?.usageMetadata;
      const usage: GeminiSttUsage | undefined = u
        ? { inputTokens: count(u.promptTokenCount), outputTokens: count(u.candidatesTokenCount), totalTokens: count(u.totalTokenCount) }
        : undefined;
      return { text, model, ...(usage ? { usage } : {}) };
    }

    const detail = await res.text().catch(() => '');
    const code = classifySttStatus(res.status, detail);
    // Upstream text is trimmed and kept server-side (the route shows it to admins in ?diag only).
    last = new GeminiSttError(`Gemini STT failed (${res.status}) on ${model}: ${detail.slice(0, 160)}`, code, res.status, model);
    if (code !== 'model_missing' && code !== 'unavailable') throw last;
  }

  throw last ?? new GeminiSttError('Gemini STT failed: no model answered before the deadline', 'network');
}

/**
 * Legacy shape (text only). Throws on a provider error so the caller can decide. `mimeType` is sent as given —
 * pass `geminiAudioInput(...).mimeType` to get the container fix.
 */
export async function transcribeWithGemini(audioBase64: string, mimeType: string, language: string): Promise<string> {
  const { text } = await transcribeWithGeminiDetailed(audioBase64, mimeType || 'audio/wav', language);
  return text;
}
