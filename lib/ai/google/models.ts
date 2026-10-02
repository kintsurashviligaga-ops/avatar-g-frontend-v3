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
 *   • Chat chains (GEMINI_CHAT_MODELS / GEMINI_CHAT_PRO_MODELS / GEMINI_CHAT_LITE_MODELS) are OPERATOR lists: any
 *     well-formed, non-retired id OF THE MODE'S CLASS is accepted, so a newly released model can be rolled in by env
 *     without a deploy. A bad id costs one failed attempt and the chain rotates past it. The class check is what
 *     keeps a mode honest: a Flash id in the Pro list would silently answer a "Pro" turn with Flash (see
 *     `chatModelClass`).
 *   • Live, TTS and STT are ALLOWLISTED. The Live model can arrive from a request body (a leaked-token repoint to a
 *     costlier model is the threat), and a TTS/STT model that cannot do the job fails every call with no rotation.
 *
 * ⚠️ The ids below are the ones verified on the funded key on 2026-09-30. Only the DEFAULTS are verified in
 * Georgian (Live native-audio + Aoede/Charon, flash-preview TTS). Switching Live or TTS to another allowlisted id by
 * env needs a live Georgian check first — the allowlist says "exists on the key", not "speaks Georgian well".
 *
 * ⚠️ NO GEMINI 2.5 TEXT MODEL IS A DEFAULT ANY MORE. A key from a NEW Google project (production moved to one on
 * 2026-10-02) answers 404 "gemini-2.5-flash / -pro / -flash-lite is no longer available to new users" on every
 * generateContent call — while `models.list` still LISTS them, so only a real call tells. On that key 3.1 Pro,
 * 3.5 / 3.6 / 3.7 / 3.8 Flash, 3.1 / 3.5 Flash-Lite, all three TTS models, embeddings, Live native-audio and audio /
 * image input answered 200. Chat, STT and the REST tiers below default to those.
 */

import type { ChatModeId } from '@/lib/chat/chatModes';
import { geminiPriceFamily } from '@/lib/services/billing/costModel';

/** A bare Gemini model id: no `models/` prefix, no path, no query. Anything else is ignored. */
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Retired families (Google answers 404): gemini-1.0-*, gemini-1.5-*, gemini-2.0-*. */
const RETIRED_FAMILY_RE = /^gemini-(?:1\.0|1\.5|2\.0)(?:-|$)/i;
/** Retired bare 1.0-era aliases. NOTE `gemini-pro-latest` is ALIVE — only the exact old names are retired. */
const RETIRED_EXACT = new Set(['gemini-pro', 'gemini-pro-vision', 'gemini-ultra']);

/** Upper bound on a chat rotation chain: every extra model is another billed attempt + latency on a bad turn. */
const MAX_CHAIN = 6;

// ─── Catalogue ──────────────────────────────────────────────────────────────

/**
 * The legacy tier names. 'standard' is the Fast chain — app/api/chat/route.ts, app/api/chat/stream/route.ts and the
 * agent's googleSearch tool still ask for it by that name. The product chat asks by mode (lib/chat/chatModes.ts).
 */
export type ChatTier = 'standard' | 'pro';

/** What `chatModelChain` accepts: a chat mode (the dropdown's Fast · Thinking · Pro · Lite) or a legacy tier. */
export type ChatChainKey = ChatModeId | ChatTier;

/**
 * The three model CLASSES a chat chain can be made of. Fast and Thinking share the Flash chain (Thinking is the same
 * model with a deeper thinking level, set by the route); Pro and Lite each have their own.
 */
export type ChatModelClass = 'flash' | 'pro' | 'lite';

/**
 * Default chat rotation chains, first = primary, keyed by class ('standard' is the Flash class — the key predates
 * modes and callers read it). `chatModelChain()` returns a fresh copy.
 *
 * ⚠️ EVERY CHAIN STAYS INSIDE ITS CLASS. Pro used to end in `gemini-3.8-flash`, so a Pro turn whose two Pro models
 * were busy was quietly answered by Flash while the header said "Pro". A Pro chain that runs out now ends the turn
 * with the normal typed error; answering with Fast is the user's choice (the dropdown), not a silent downgrade.
 * `gemini-pro-latest` is deliberately absent: today it aliases `gemini-3.1-pro-preview` (verified live — its
 * modelVersion comes back as 3.1-pro), so listing it would retry the same model, not add a fallback.
 * ⚠️ Lite's fallback is 3.5 Flash-Lite, NOT 2.5 Flash-Lite: on 2026-09-30 this key got a 404 "gemini-2.5-flash-lite
 * is no longer available to new users" (3.1 / 3.5 Flash-Lite, 2.5 Flash and 2.5 Pro all answered 200 the same day).
 */
export const DEFAULT_CHAT_MODELS: Readonly<Record<'standard' | 'pro' | 'lite', readonly string[]>> = {
  standard: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'],
  pro: ['gemini-3.1-pro-preview'],
  lite: ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'],
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
export const DEFAULT_STT_MODEL = 'gemini-3.8-flash';

/**
 * generateContent models that accept audio input — the only kind geminiStt.ts can call.
 *
 * ⚠️ `gemini-3.5-transcribe-live` is deliberately NOT here: its name says it is a Live (bidi) model, and pointing
 * the generateContent STT path at it would fail every transcription with no rotation. It is exported separately
 * (TRANSCRIBE_LIVE_MODEL) for a future streaming-transcription path. UNVERIFIED whether it serves generateContent.
 */
export const STT_MODELS: readonly string[] = [
  DEFAULT_STT_MODEL,
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.1-pro-preview',
  'gemini-pro-latest',
];

/** Streaming transcription model on the key (Live-style). Not used by any path yet. */
export const TRANSCRIBE_LIVE_MODEL = 'gemini-3.5-transcribe-live';

export type GeminiRestTier = 'pro' | 'flash';

/**
 * The two tiers of the lib/gemini/client.ts REST client (analysis, vision, helpers — not product chat).
 * GEMINI_MODEL_PRO / GEMINI_MODEL_FLASH override them; see geminiTierModel.
 */
export const DEFAULT_REST_TIER_MODELS: Readonly<Record<GeminiRestTier, string>> = {
  pro: 'gemini-3.1-pro-preview',
  flash: 'gemini-3.8-flash',
};

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
 * Which chat class a model id belongs to, or null when it is not a TEXT chat model we can place — by its price family
 * (lib/services/billing/costModel `geminiPriceFamily`, pure), so "what class is this" and "what does it cost" can
 * never disagree. Live-audio, TTS and image models return null (they share the "flash" word but cannot answer a text
 * turn), and so does any id the price table cannot place: a model we cannot price is a model we have not checked.
 */
export function chatModelClass(id: string): ChatModelClass | null {
  const family = geminiPriceFamily(id);
  if (!family) return null;
  if (family.startsWith('pro-')) return 'pro';
  if (family.startsWith('flash-lite-')) return 'lite';
  if (family.startsWith('flash-')) return 'flash';
  return null;
}

/** The class a chain key draws from. Unknown keys (a stale client, a typo) are the Flash class — the everyday chain. */
function classOfKey(key: unknown): ChatModelClass {
  if (key === 'pro') return 'pro';
  if (key === 'lite') return 'lite';
  return 'flash'; // 'fast', 'thinking', 'standard', anything else
}

const CHAIN_ENV: Readonly<Record<ChatModelClass, string>> = {
  flash: 'GEMINI_CHAT_MODELS',
  pro: 'GEMINI_CHAT_PRO_MODELS',
  lite: 'GEMINI_CHAT_LITE_MODELS',
};

const CHAIN_DEFAULTS: Readonly<Record<ChatModelClass, readonly string[]>> = {
  flash: DEFAULT_CHAT_MODELS.standard,
  pro: DEFAULT_CHAT_MODELS.pro,
  lite: DEFAULT_CHAT_MODELS.lite,
};

/**
 * The chat rotation chain for a mode (or a legacy tier), first = primary.
 *
 *   fast · thinking · standard → GEMINI_CHAT_MODELS       (Flash class)
 *   pro                        → GEMINI_CHAT_PRO_MODELS   (Pro class)
 *   lite                       → GEMINI_CHAT_LITE_MODELS  (Flash-Lite class)
 *
 * An override replaces the defaults when it yields at least one usable id OF THAT CLASS; ids of another class are
 * dropped (a Flash id in the Pro list, a TTS id anywhere), and an override left empty by that — or empty, malformed
 * or all-retired to begin with — falls back to the defaults rather than leaving chat with no model. Always a fresh
 * array. The key is never a model id: the route resolves a client's mode through lib/chat/chatModes first.
 */
export function chatModelChain(key: ChatChainKey): string[] {
  const cls = classOfKey(key);
  const override = parseModelList(process.env[CHAIN_ENV[cls]]).filter((id) => chatModelClass(id) === cls);
  return override.length ? override : [...CHAIN_DEFAULTS[cls]];
}

/**
 * The REST client's model for a tier: GEMINI_MODEL_PRO / GEMINI_MODEL_FLASH when well-formed and not retired, else
 * DEFAULT_REST_TIER_MODELS. Operator policy, like the chat chains. The old `env ?? default` read let an EMPTY var
 * through as the model name, and .env.example shipped `gemini-1.5-*` values for both — each would 404 every call.
 */
export function geminiTierModel(tier: GeminiRestTier): string {
  const t: GeminiRestTier = tier === 'pro' ? 'pro' : 'flash';
  const id = normalizeModelId(t === 'pro' ? process.env.GEMINI_MODEL_PRO : process.env.GEMINI_MODEL_FLASH);
  return id && !isRetiredModel(id) ? id : DEFAULT_REST_TIER_MODELS[t];
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
