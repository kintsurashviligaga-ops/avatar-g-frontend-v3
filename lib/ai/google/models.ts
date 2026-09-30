/**
 * lib/ai/google/models.ts — the single source of truth for which Gemini model ids chat, Live, TTS and STT use.
 *
 * Why one module: before this, model ids were hard-coded per route (the chat route's chain, geminiStt's list, the
 * TTS route's env read, the Live mint's default), and each one aged on its own. `gemini-2.0-flash*` was retired by
 * Google (404) and still sat in two of those lists, so every chat turn burned a failed attempt before rotating.
 *
 * Pure and isomorphic: env is read at CALL time (so tests and a hot env change behave), and nothing here imports a
 * server-only module — in a client bundle a non-NEXT_PUBLIC env is undefined and every function returns its
 * code default.
 *
 * Two override policies, on purpose:
 *   • Chat chains (GEMINI_CHAT_MODELS / GEMINI_CHAT_PRO_MODELS) are OPERATOR lists: any well-formed, non-retired id
 *     is accepted, so a newly released model can be rolled in by env without a deploy. A bad id costs one failed
 *     attempt and the chain rotates past it.
 *   • Live, TTS and STT are ALLOWLISTED. The Live model can arrive from a request body (a leaked-token repoint to a
 *     costlier model is the threat), and a TTS/STT model that cannot do the job fails every call with no rotation.
 *
 * ⚠️ The ids below are the ones verified on the funded key on 2026-09-30. Only the DEFAULTS are verified in
 * Georgian (Live native-audio + Aoede/Charon, flash-preview TTS). Switching Live or TTS to another allowlisted id by
 * env needs a live Georgian check first — the allowlist says "exists on the key", not "speaks Georgian well".
 */

/** A bare Gemini model id: no `models/` prefix, no path, no query. Anything else is ignored. */
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Retired families (Google answers 404): gemini-1.0-*, gemini-1.5-*, gemini-2.0-*. */
const RETIRED_FAMILY_RE = /^gemini-(?:1\.0|1\.5|2\.0)(?:-|$)/i;
/** Retired bare 1.0-era aliases. NOTE `gemini-pro-latest` is ALIVE — only the exact old names are retired. */
const RETIRED_EXACT = new Set(['gemini-pro', 'gemini-pro-vision', 'gemini-ultra']);

/** Upper bound on a chat rotation chain: every extra model is another billed attempt + latency on a bad turn. */
const MAX_CHAIN = 6;

// ─── Catalogue ──────────────────────────────────────────────────────────────

export type ChatTier = 'standard' | 'pro';

/** Default chat rotation chains, first = primary. `chatModelChain()` returns a fresh copy. */
export const DEFAULT_CHAT_MODELS: Readonly<Record<ChatTier, readonly string[]>> = {
  standard: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-2.5-flash'],
  pro: ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-3.8-flash'],
};

/**
 * The Live (BidiGenerateContent) default. Same model as lib/voice/geminiLive.ts uses today, but BARE —
 * geminiLive.ts spells it `models/gemini-2.5-flash-native-audio-latest`.
 *
 * ⚠️ The Live wire (the WS `setup.model` and the auth_tokens `bidiGenerateContentSetup.model`) was verified live
 * with the `models/`-prefixed resource name. Wrap with `toModelResource()` when writing it to the wire; whether the
 * bare id is accepted there is UNVERIFIED.
 */
export const DEFAULT_LIVE_MODEL = 'gemini-2.5-flash-native-audio-latest';

/** Live models present on the key. Only DEFAULT_LIVE_MODEL is verified in Georgian. */
export const LIVE_MODELS: readonly string[] = [
  DEFAULT_LIVE_MODEL,
  'gemini-3.8-live',
  'gemini-3.1-flash-live-preview',
  'gemini-2.5-flash-native-audio-preview-12-2025',
];

/** The TTS default (verified Georgian; /api/tts/gemini's "Read aloud verbatim:" directive is tuned on it). */
export const DEFAULT_TTS_MODEL = 'gemini-2.5-flash-preview-tts';

export const TTS_MODELS: readonly string[] = [DEFAULT_TTS_MODEL, 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview'];

/** The STT default: a multimodal generateContent model given a "transcribe this audio" prompt (geminiStt.ts). */
export const DEFAULT_STT_MODEL = 'gemini-2.5-flash';

/**
 * generateContent models that accept audio input — the only kind geminiStt.ts can call.
 *
 * ⚠️ `gemini-3.5-transcribe-live` is deliberately NOT here: its name says it is a Live (bidi) model, and pointing
 * the generateContent STT path at it would fail every transcription with no rotation. It is exported separately
 * (TRANSCRIBE_LIVE_MODEL) for a future streaming-transcription path. UNVERIFIED whether it serves generateContent.
 */
export const STT_MODELS: readonly string[] = [
  DEFAULT_STT_MODEL,
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-3.1-pro-preview',
  'gemini-pro-latest',
];

/** Streaming transcription model on the key (Live-style). Not used by any path yet. */
export const TRANSCRIBE_LIVE_MODEL = 'gemini-3.5-transcribe-live';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Trims, strips one leading `models/`, and validates against MODEL_ID_RE. Returns null for anything that is not a
 * plain model id (a path, a query string, whitespace inside, a non-string) — so an env typo or a hostile body value
 * can never be spliced into a Google URL.
 */
export function normalizeModelId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let id = raw.trim();
  if (/^models\//i.test(id)) id = id.slice('models/'.length);
  return MODEL_ID_RE.test(id) ? id : null;
}

/** True for ids Google has retired (gemini-1.0-*, 1.5-*, 2.0-*, and the bare 1.0 aliases). Accepts a `models/` prefix. */
export function isRetiredModel(id: string): boolean {
  if (typeof id !== 'string') return false;
  const bare = id.trim().replace(/^models\//i, '');
  return RETIRED_FAMILY_RE.test(bare) || RETIRED_EXACT.has(bare.toLowerCase());
}

/** `gemini-x` → `models/gemini-x` (idempotent) — the resource-name form the Live wire was verified with. */
export function toModelResource(id: string): string {
  const bare = id.trim().replace(/^models\//i, '');
  return `models/${bare}`;
}

/**
 * Parses an operator model list (comma-, semicolon- or newline-separated; NOT space-separated, so
 * `gemini 3 flash` is one malformed entry rather than three bogus ids). Drops malformed and retired ids,
 * de-duplicates (first occurrence wins), caps at MAX_CHAIN.
 */
export function parseModelList(raw: string | null | undefined): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const out: string[] = [];
  for (const part of raw.split(/[,;\n\r]+/)) {
    const id = normalizeModelId(part);
    if (!id || isRetiredModel(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_CHAIN) break;
  }
  return out;
}

/** Returns the allowlist's canonical spelling of `raw`, or null when it is malformed, retired or not listed. */
function pickAllowed(raw: unknown, allow: readonly string[]): string | null {
  const id = normalizeModelId(raw);
  if (!id || isRetiredModel(id)) return null;
  const lower = id.toLowerCase();
  return allow.find((m) => m === lower) ?? null;
}

// ─── Resolvers ──────────────────────────────────────────────────────────────

/**
 * The chat rotation chain for a tier, first = primary. GEMINI_CHAT_MODELS (standard) / GEMINI_CHAT_PRO_MODELS (pro)
 * replace the defaults when they yield at least one usable id; an empty, all-malformed or all-retired override
 * falls back to the defaults rather than leaving chat with no model. Always a fresh array.
 */
export function chatModelChain(tier: ChatTier): string[] {
  const t: ChatTier = tier === 'pro' ? 'pro' : 'standard';
  const override = parseModelList(t === 'pro' ? process.env.GEMINI_CHAT_PRO_MODELS : process.env.GEMINI_CHAT_MODELS);
  return override.length ? override : [...DEFAULT_CHAT_MODELS[t]];
}

/** The effective Live default: GEMINI_LIVE_MODEL when allowlisted, else DEFAULT_LIVE_MODEL. Bare id. */
export function defaultLiveModel(): string {
  return pickAllowed(process.env.GEMINI_LIVE_MODEL, LIVE_MODELS) ?? DEFAULT_LIVE_MODEL;
}

/**
 * Resolves a (possibly client-supplied) Live model to an allowlisted BARE id. Accepts a `models/` prefix and any
 * case; anything malformed, retired or unlisted resolves to the effective default (see defaultLiveModel), never
 * an error — the mint route stays usable while a hostile or stale value can't pick the model.
 * Wire it with `toModelResource(resolveLiveModel(x))`.
 */
export function resolveLiveModel(requested?: string | null): string {
  return pickAllowed(requested, LIVE_MODELS) ?? defaultLiveModel();
}

/** GEMINI_TTS_MODEL when allowlisted (a `models/` prefix is tolerated), else DEFAULT_TTS_MODEL. Bare id. */
export function ttsModel(): string {
  return pickAllowed(process.env.GEMINI_TTS_MODEL, TTS_MODELS) ?? DEFAULT_TTS_MODEL;
}

/**
 * GEMINI_STT_MODEL when allowlisted, else the legacy VOICE_V2V_GEMINI_MODEL (the name geminiStt.ts reads today)
 * when allowlisted, else DEFAULT_STT_MODEL. Bare id.
 */
export function sttModel(): string {
  return (
    pickAllowed(process.env.GEMINI_STT_MODEL, STT_MODELS) ??
    pickAllowed(process.env.VOICE_V2V_GEMINI_MODEL, STT_MODELS) ??
    DEFAULT_STT_MODEL
  );
}
