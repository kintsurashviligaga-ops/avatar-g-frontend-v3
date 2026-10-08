import 'server-only';

import { streamText, type ModelMessage, type ToolSet } from 'ai';
import type { GoogleLanguageModelOptions } from '@ai-sdk/google';
import { createGoogleGenerativeAI } from './provider';
import { googleTransportBlocker } from './transport';
import type { ChatErrorCode, ChatFrame } from '@/lib/chat/sse';
import { isRetiredModel } from '@/lib/ai/google/models';

/**
 * lib/ai/google/chatStream.ts — one Gemini chat turn, streamed, with typed failures and model rotation.
 *
 * Server-only. Wraps ai@6 `streamText` over `@ai-sdk/google`, walks `models` in order, and reports every
 * outcome through `onFrame` (the `lib/chat/sse.ts` frames) plus a summary result. It never throws.
 *
 * ⚠️ READ `fullStream`, NEVER `textStream`. In ai@6 `streamText` does not throw on a provider failure: it
 * catches the rejected request and emits it as an `{type:'error'}` part (node_modules/ai/dist/index.mjs,
 * the `run().catch` that enqueues `{ type: "error", error }`). `textStream` forwards only `text-delta`
 * parts, so the error part is silently dropped and the loop just ends with zero characters. That is why,
 * in production, an invalid key, a depleted prepay (402), a 429 and a retired model id all looked
 * identical — an empty answer — and every one of them fell through to the Anthropic fallback while the
 * route's own `catch`, its classifier and its safety message were dead code. `fullStream` delivers the
 * error part itself, so the failure is classified here and reaches the user as a typed `{error}` frame.
 *
 * Frame order for one call:
 *   success:            {meta} [{meta}] {text}… [{sources}] [{usage}] [{truncated}]
 *   failure after text: {meta} [{meta}] {text}… {meta partial:true} [{sources}] [{usage}] {error}
 *   failure, no text:   [{usage}] {error}
 *   caller abort:       whatever was already sent; nothing after the abort
 * The optional second `{meta}` is the served-model correction (see `servedModelOf`): at most one per attempt, and in
 * practice never, because the model version rides the first chunk. Every `{meta}` of an attempt that is not the
 * chain's first carries `fallback: true`.
 * The `[DONE]` terminator is the route's job, not this module's.
 */

// ─── Public shapes (SHARED INTERFACES) ───────────────────────────────────────

export interface GeminiChatConfig {
  system: string;
  /**
   * Omitted = the model's own default. The route omits it for the Thinking and Pro modes: Google's Gemini 3 guidance
   * is to keep temperature at its default 1.0 — lower values risk looping or weaker reasoning.
   */
  temperature?: number;
  topP: number;
  topK?: number;
  /**
   * True when a persona chose its own temperature. Only then do `temperature` / `topK` reach a Gemini 3 model; without
   * it a Gemini 3 call runs on the model's defaults (see `samplingFor`). Older families always get what is configured.
   */
  personaSampling?: boolean;
  maxOutputTokens: number;
  safetySettings: Array<{ category: string; threshold: string }>;
  thinking?: { level: 'off' | 'low' | 'high' };
  googleSearch: boolean;
  /**
   * Gemini's native URL reading (`url_context`), beside google_search. Set by the route only for a turn whose latest
   * user message carries a link AND while `GEMINI_CHAT_URL_CONTEXT=1` (lib/chat/urlContext.ts); absent = off.
   */
  urlContext?: boolean;
}

export interface StreamGeminiChatInput {
  apiKey: string;
  models: string[];
  /** ai `ModelMessage[]`; typed `unknown` so callers don't need to import ai's types. */
  messages: unknown;
  config: GeminiChatConfig;
  abortSignal?: AbortSignal;
  onFrame: (frame: ChatFrame) => void | Promise<void>;
  /**
   * Retry ONE transient failure (429, 503, "overloaded") of the same model once, after a short backoff, while nothing
   * has been sent — before rotating or giving up. The route sets it for Pro, whose chain is a single preview model
   * (a busy minute used to fail the turn outright). Off by default: a Flash chain rotates to its next model instead.
   */
  retryTransientOnce?: boolean;
  /** The retry's backoff in ms (tests). Default `TRANSIENT_RETRY_BASE_MS` plus up to `TRANSIENT_RETRY_JITTER_MS`. */
  retryDelayMs?: number;
}

export interface StreamGeminiChatResult {
  ok: boolean;
  /** The model whose outcome this result reports: the one that answered, or the last one tried. Null when none ran. */
  model: string | null;
  /**
   * Additive: the model Google says actually served `model` when that is a DIFFERENT model (we asked for an alias).
   * Absent when it is the same model — the usual case. `model` stays the chain member (rotation, attempts, booking).
   */
  servedModel?: string;
  /** Every character sent as a `{text}` frame. Non-empty on failure only when the model failed mid-answer. */
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  sources: Array<{ url: string; title?: string }>;
  /**
   * `message` here is the server-side DIAGNOSTIC (the provider's own wording, key-redacted and truncated) — for
   * logs and Sentry only. The `{error}` frame the browser receives carries a generic message instead.
   */
  error?: { code: ChatErrorCode; retryable: boolean; message: string; status?: number };
  /**
   * Every model tried, in order. `usage` / `groundingQueries` are what Google billed for THAT attempt — a rotation after
   * a text-less 200 (thinking ate the budget, an empty candidate) still consumed tokens, so callers must book every
   * attempt that reports them, not only the one this result describes (see `unbookedAttempts`).
   */
  attempts: Array<{
    model: string;
    code?: ChatErrorCode;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    groundingQueries?: number;
  }>;
  /**
   * Additive (not in the original shared interface): how many Google Search queries grounding ran for the
   * reported attempt, from `groundingMetadata.webSearchQueries`. Feeds `bookChatUsage({ groundingQueries })`.
   */
  groundingQueries?: number;
  /** The answer stopped at `maxOutputTokens` (finish MAX_TOKENS) — `ok`, but cut short; a `{truncated}` frame said so. */
  truncated?: boolean;
}

type ChatError = NonNullable<StreamGeminiChatResult['error']>;

/**
 * The attempts BEFORE the one a result reports that Google still billed (usage or grounding queries) — a rotation
 * after a text-less 200. The caller books these on top of `result.usage`, each against the model that consumed it.
 */
export function unbookedAttempts(result: Pick<StreamGeminiChatResult, 'attempts'>): StreamGeminiChatResult['attempts'] {
  const prior = result.attempts.slice(0, -1);
  return prior.filter((a) => (a.groundingQueries ?? 0) > 0
    || (a.usage?.inputTokens ?? 0) > 0 || (a.usage?.outputTokens ?? 0) > 0 || (a.usage?.totalTokens ?? 0) > 0);
}
type ThinkingLevel = NonNullable<GeminiChatConfig['thinking']>['level'];
type GoogleThinkingConfig = NonNullable<GoogleLanguageModelOptions['thinkingConfig']>;
type GoogleSafetySetting = NonNullable<GoogleLanguageModelOptions['safetySettings']>[number];

// ─── Model ids ───────────────────────────────────────────────────────────────

/** Same shape lib/ai/google/models.ts enforces. The id is spliced into the request URL path. */
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_MODELS = 6;

/**
 * ⚠️ A MODEL ID IS A URL PATH SEGMENT. @ai-sdk/google builds `${baseURL}/models/${id}:streamGenerateContent`,
 * and an id containing `/` is used verbatim (getModelPath), so an unvalidated id could point the request —
 * with our API key attached — at a different endpoint on the same host. Callers should already pass ids from
 * lib/ai/google/models.ts; this is the last line before the network.
 */
function usableModels(models: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const raw of Array.isArray(models) ? models : []) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!MODEL_ID_RE.test(id) || isRetiredModel(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_MODELS) break;
  }
  return out;
}

// ─── Thinking ────────────────────────────────────────────────────────────────

const GEMINI_3_RE = /^gemini-3(?:\.\d+)?-/i;
const GEMINI_25_RE = /^gemini-2\.5-/i;
const PRO_RE = /(?:^|-)pro(?:-|$)/i;
/**
 * Gemini 3 models documented to ACCEPT `thinkingLevel: 'minimal'` (Google's thinking page, updated 2026-09-25):
 * 3.0 – 3.6 Flash and every 3.x Flash-Lite. 3.7 / 3.8 Flash and 3.1 Pro list it as "Not supported (error)".
 * An ALLOWLIST on purpose: a model we have not checked gets 'low' (it thinks a little more) instead of a 400.
 */
const MINIMAL_OK_RE = /^gemini-3(?:\.[0-6])?-flash(?:-|$)|^gemini-3(?:\.\d+)?-flash-lite(?:-|$)/i;

/**
 * Maps a profile's thinking level onto the one knob each model family accepts, or undefined to send nothing.
 *
 * ⚠️ THE TWO FAMILIES TAKE DIFFERENT FIELDS, AND SENDING BOTH IS A 400. Gemini 3 uses `thinkingLevel`
 * (minimal | low | medium | high; the default is `medium` on Flash, `high` on Pro, `minimal` on Flash-Lite, and Pro
 * cannot go below `low`). Gemini 2.5 uses `thinkingBudget` in tokens (-1 = dynamic, the default; Flash / Flash-Lite
 * accept 0 = off; Pro's floor is 128 and it cannot be turned off). A 400 here is `bad_request`, which does NOT
 * rotate, so a wrong mapping fails the whole turn — hence `undefined` (the model's own default) for anything outside
 * these two families, including the `-latest` aliases whose family can change under us.
 *
 * ⚠️ 'off' IS 'minimal' ONLY WHERE THE MODEL TAKES IT. It used to be 'minimal' for every Gemini 3 Flash — an API
 * error on 3.7 / 3.8 Flash, i.e. on the chat's PRIMARY model, so any persona with thinking 'off' failed every turn
 * with no rotation. Where 'minimal' is not accepted, 'off' is 'low'.
 */
export function thinkingConfigFor(modelId: string, level: ThinkingLevel | undefined): GoogleThinkingConfig | undefined {
  if (!level) return undefined;
  const id = String(modelId || '').trim();
  const isPro = PRO_RE.test(id);
  if (GEMINI_3_RE.test(id)) {
    if (level === 'high') return { thinkingLevel: 'high' };
    if (level === 'low') return { thinkingLevel: 'low' };
    return { thinkingLevel: !isPro && MINIMAL_OK_RE.test(id) ? 'minimal' : 'low' };
  }
  if (GEMINI_25_RE.test(id)) {
    if (level === 'high') return { thinkingBudget: -1 };
    if (level === 'low') return { thinkingBudget: 1024 };
    return { thinkingBudget: isPro ? 128 : 0 };
  }
  return undefined;
}

/**
 * The sampling knobs one attempt sends.
 *
 * ⚠️ GEMINI 3 GETS ITS OWN DEFAULTS UNLESS A PERSONA ASKED OTHERWISE. Fast and Lite used to send the platform's
 * historical 0.7 / topK 40 to Gemini 3 models, against Google's own Gemini 3 guidance (the route already cited it for
 * Thinking and Pro): keep temperature at its default 1.0 — lower values risk looping and weaker answers. So a Gemini 3
 * call carries temperature / topK only when `personaSampling` says a persona chose them; other families (2.5, an env
 * override) keep exactly what is configured. Per attempt, because one chain may mix families.
 */
export function samplingFor(modelId: string, config: Pick<GeminiChatConfig, 'temperature' | 'topK' | 'personaSampling'>): { temperature?: number; topK?: number } {
  const keep = config.personaSampling === true || !GEMINI_3_RE.test(String(modelId || '').trim());
  if (!keep) return {};
  return {
    ...(typeof config.temperature === 'number' ? { temperature: config.temperature } : {}),
    ...(typeof config.topK === 'number' ? { topK: config.topK } : {}),
  };
}

// ─── Safety ──────────────────────────────────────────────────────────────────

const SAFETY_CATEGORIES: ReadonlySet<string> = new Set<GoogleSafetySetting['category']>([
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_CIVIC_INTEGRITY',
]);

/** Higher = stricter. Anything not listed (BLOCK_NONE, OFF, UNSPECIFIED, typos) is looser than the floor. */
const STRICTNESS: Readonly<Record<string, number>> = {
  BLOCK_ONLY_HIGH: 1,
  BLOCK_MEDIUM_AND_ABOVE: 2,
  BLOCK_LOW_AND_ABOVE: 3,
};
const SAFETY_FLOOR: GoogleSafetySetting['threshold'] = 'BLOCK_ONLY_HIGH';

/**
 * Validates the caller's safety settings before they reach the provider.
 *
 * ⚠️ THE FLOOR IS BLOCK_ONLY_HIGH, AND A PROFILE MAY ONLY MAKE IT STRICTER. That is the REST client's
 * documented setting (Georgian business and creative text tripped MEDIUM and came back empty), so a looser
 * threshold (BLOCK_NONE / OFF / unspecified) is raised to the floor here rather than trusted.
 * ⚠️ AN UNKNOWN CATEGORY FAILS THE WHOLE REQUEST. @ai-sdk/google validates providerOptions with a strict
 * enum; one bad entry is an InvalidArgumentError on every model — so unknown categories are dropped, and a
 * repeated category keeps its strictest threshold (Google wants each category once).
 */
export function sanitizeSafetySettings(settings: ReadonlyArray<{ category: string; threshold: string }> | undefined): GoogleSafetySetting[] {
  const byCategory = new Map<string, GoogleSafetySetting['threshold']>();
  for (const s of Array.isArray(settings) ? settings : []) {
    const category = typeof s?.category === 'string' ? s.category.trim().toUpperCase() : '';
    if (!SAFETY_CATEGORIES.has(category)) continue;
    const raw = typeof s?.threshold === 'string' ? s.threshold.trim().toUpperCase() : '';
    const threshold = (STRICTNESS[raw] ? raw : SAFETY_FLOOR) as GoogleSafetySetting['threshold'];
    const prev = byCategory.get(category);
    if (!prev || (STRICTNESS[threshold] ?? 0) > (STRICTNESS[prev] ?? 0)) byCategory.set(category, threshold);
  }
  return [...byCategory].map(([category, threshold]) => ({ category: category as GoogleSafetySetting['category'], threshold }));
}

// ─── Error classification ────────────────────────────────────────────────────

/**
 * Account-wide money wording. ⚠️ NOT the generic 429 text: Google's per-minute AND per-day 429s both say
 * "check your plan and billing details", and those quotas are PER MODEL — so a plain 429 is `rate_limited`
 * (rotates to the next model's bucket), and only the prepay / billing-disabled wording is `quota`.
 */
const PREPAY_RE =
  /prepay|prepayment|credits? (?:are |is |have been )?(?:depleted|exhausted)|billing (?:is )?(?:not enabled|disabled)|enable billing|requires billing|billing account|insufficient (?:funds|credit|balance)|payment required/i;
const KEY_RE =
  /api[ _-]?key[ _-]?(?:not valid|invalid|expired)|api_key_invalid|invalid api[ _-]?key|unauthenticated|permission[ _]denied|unregistered callers/i;
const MODEL_MISSING_RE = /no longer available|not found for api version|not supported for (?:generatecontent|streamgeneratecontent)|unknown model/i;
const MODEL_WORD_RE = /\bmodels?\b/i;
const NETWORK_RE =
  /fetch failed|failed to fetch|cannot connect to api|econnreset|econnrefused|etimedout|enotfound|eai_again|epipe|socket hang up|network|terminated|und_err/i;
const UNAVAILABLE_RE = /overloaded|unavailable|internal error|deadline exceeded|try again later/i;
const BAD_REQUEST_NAMES = new Set([
  'AI_InvalidPromptError',
  'AI_InvalidArgumentError',
  'AI_TypeValidationError',
  'AI_UnsupportedFunctionalityError',
  'AI_InvalidMessageRoleError',
  'AI_MessageConversionError',
  'AI_InvalidDataContentError',
  'AI_DownloadError',
]);

/** Codes that move on to the next model — but ONLY while nothing has been sent for this turn yet. */
const ROTATE_ON: ReadonlySet<ChatErrorCode> = new Set<ChatErrorCode>(['model_missing', 'unavailable', 'network', 'rate_limited']);
/** Mirrors lib/chat/sse.ts RETRYABLE_BY_DEFAULT: worth a retry button. */
const RETRYABLE: ReadonlySet<ChatErrorCode> = new Set<ChatErrorCode>(['rate_limited', 'network', 'unavailable']);

/**
 * What the browser sees. ⚠️ PROVIDER WORDING NEVER REACHES THE USER (see lib/api/providerError.ts): Google's
 * messages name the supplier, link its billing console and are English-only. The client localizes by `code`;
 * this is only the fallback text.
 */
const PUBLIC_MESSAGE: Readonly<Record<ChatErrorCode, string>> = {
  auth: 'The AI service is not available right now.',
  auth_required: 'Please sign in to continue.',
  quota: 'The AI service is temporarily unavailable on our side.',
  budget: 'The AI service is temporarily unavailable on our side.',
  rate_limited: 'The AI service is busy. Please try again in a moment.',
  model_missing: 'The AI model is not available right now.',
  safety: 'This request was blocked by safety filters. Please rephrase and try again.',
  network: 'The connection to the AI service was interrupted. Please try again.',
  unavailable: 'The AI service is temporarily unavailable. Please try again.',
  bad_request: 'This request could not be processed.',
  // The policy refusals are the route's, never this module's; listed so every code has a public text.
  daily_cap: "You've reached today's chat limit.",
  guest_limit: "You've used today's guest messages. Sign in to keep chatting.",
  too_long: 'The message is too long.',
};

/** The same-model retry's backoff (`retryTransientOnce`): ~0.8 s plus jitter, so a burst of turns does not re-collide. */
export const TRANSIENT_RETRY_BASE_MS = 800;
export const TRANSIENT_RETRY_JITTER_MS = 400;

/**
 * A failure worth one more try of the SAME model: a 429 (a per-minute bucket refills), a 503 / "overloaded" (Google's
 * capacity blip). Not an empty 200 — that one already billed its thinking — and not a 500 or an unknown failure.
 */
export function isTransientFailure(err: Pick<ChatError, 'code' | 'message' | 'status'> | undefined): boolean {
  if (!err) return false;
  if (err.code === 'rate_limited') return true;
  if (err.code !== 'unavailable') return false;
  return err.status === 503 || /overloaded/i.test(err.message);
}

/** Resolves after `ms`, or at once when `signal` aborts. Never rejects. */
function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, Math.max(0, ms));
    signal?.addEventListener('abort', done, { once: true });
  });
}

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  statusCode?: unknown;
  status?: unknown;
  responseBody?: unknown;
  data?: unknown;
  lastError?: unknown;
  cause?: unknown;
  code?: unknown;
};

function asErrorLike(err: unknown): ErrorLike {
  return err !== null && (typeof err === 'object' || typeof err === 'function') ? (err as ErrorLike) : {};
}

/** RetryError → its last error; a wrapper whose cause carries the HTTP status → the cause. */
function unwrap(err: unknown): unknown {
  let cur: unknown = err;
  for (let i = 0; i < 4; i++) {
    const e = asErrorLike(cur);
    if (e.name === 'AI_RetryError' && e.lastError !== undefined) {
      cur = e.lastError;
      continue;
    }
    if (typeof e.statusCode !== 'number' && e.cause !== undefined && typeof asErrorLike(e.cause).statusCode === 'number') {
      cur = e.cause;
      continue;
    }
    break;
  }
  return cur;
}

function statusOf(e: ErrorLike): number | undefined {
  if (typeof e.statusCode === 'number') return e.statusCode;
  if (typeof e.status === 'number') return e.status;
  return undefined;
}

/** Google's `error.status` (`RESOURCE_EXHAUSTED`, `NOT_FOUND`, …) from the parsed error body, when present. */
function googleStatusOf(e: ErrorLike): string {
  const data = asErrorLike(e.data);
  const inner = asErrorLike((data as { error?: unknown }).error);
  const s = (inner as { status?: unknown }).status;
  return typeof s === 'string' ? s : '';
}

const SECRET_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-key]'],
  [/\bAQ\.[0-9A-Za-z_.-]{20,}/g, '[redacted-key]'],
  [/([?&](?:key|api_key|access_token)=)[^&\s"']+/gi, '$1[redacted]'],
  [/(bearer\s+)[0-9A-Za-z._-]{16,}/gi, '$1[redacted]'],
];

/** A log-safe one-liner: never a key, never a megabyte of response body. */
function diagnostic(text: string): string {
  let out = String(text || '').replace(/\s+/g, ' ').trim();
  for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep);
  return out.length > 300 ? `${out.slice(0, 300)}…` : out;
}

function isAbortLike(e: ErrorLike): boolean {
  return e.name === 'AbortError' || e.name === 'ResponseAborted' || e.name === 'TimeoutError';
}

function makeError(code: ChatErrorCode, message: string, status?: number): ChatError {
  const out: ChatError = { code, retryable: RETRYABLE.has(code), message: diagnostic(message) || code };
  if (typeof status === 'number') out.status = status;
  return out;
}

/**
 * Classifies anything @ai-sdk/google or ai@6 can throw or emit as an error part.
 *
 * HTTP status first (401/403 auth · 402 quota · 429 rate_limited unless prepay wording · 404 model_missing ·
 * 5xx unavailable), then Google's wording for the 400s that carry an account problem (an invalid key is a
 * 400 `API_KEY_INVALID`, not a 401), then the SDK's own error names, then network signatures. Anything
 * unrecognised is `unavailable` — retryable, and it rotates, because a model we cannot read is a model to skip.
 */
export function classifyChatError(err: unknown): ChatError {
  const e = asErrorLike(unwrap(err));
  const status = statusOf(e);
  const gStatus = googleStatusOf(e);
  const message = typeof e.message === 'string' ? e.message : String(err ?? '');
  const body = typeof e.responseBody === 'string' ? e.responseBody.slice(0, 4000) : '';
  const haystack = `${message} ${gStatus} ${body}`;
  const name = typeof e.name === 'string' ? e.name : '';

  if (isAbortLike(e)) return makeError('network', message || 'aborted', status);
  // ⚠️ SDK-LOCAL FAILURES BEFORE THE HTTP STATUS. ai@6 downloads an https attachment itself and throws
  // AI_DownloadError carrying THAT HOST's status: a deleted asset (404) read as model_missing, an expired signed URL
  // (403) as a broken Gemini key — each rotated through every model re-downloading the same dead link, then told the
  // user we were down. None of these is Google's answer; they are a bad request (the attachment).
  if (BAD_REQUEST_NAMES.has(name)) return makeError('bad_request', message, status);

  if (typeof status === 'number') {
    if (status === 402 || PREPAY_RE.test(haystack)) return makeError('quota', message, status);
    if (status === 401 || status === 403) return makeError('auth', message, status);
    if (status === 429) return makeError('rate_limited', message, status);
    if (status === 404) return makeError('model_missing', message, status);
    if (status === 408) return makeError('network', message, status);
    if (status >= 500) return makeError('unavailable', message, status);
    if (KEY_RE.test(haystack)) return makeError('auth', message, status);
    if (MODEL_MISSING_RE.test(haystack) || (gStatus === 'NOT_FOUND' && MODEL_WORD_RE.test(haystack))) {
      return makeError('model_missing', message, status);
    }
    return makeError('bad_request', message, status);
  }

  if (name === 'AI_NoSuchModelError') return makeError('model_missing', message);
  if (name === 'AI_LoadAPIKeyError') return makeError('auth', message);
  if (PREPAY_RE.test(haystack)) return makeError('quota', message);
  if (KEY_RE.test(haystack)) return makeError('auth', message);
  if (/\b429\b|rate[ _-]?limit|resource_exhausted|quota/i.test(haystack)) return makeError('rate_limited', message);
  if (MODEL_MISSING_RE.test(haystack)) return makeError('model_missing', message);
  // An APICallError with no status never got an HTTP response: the SDK wraps a failed fetch this way.
  const sysCode = typeof e.code === 'string' && /^(?:E[A-Z]{2,}|UND_ERR)/.test(e.code);
  if (name === 'AI_APICallError' || sysCode || NETWORK_RE.test(haystack)) return makeError('network', message);
  if (UNAVAILABLE_RE.test(haystack)) return makeError('unavailable', message);
  return makeError('unavailable', message || 'unknown provider failure');
}

/** Google's prompt-level block (`promptFeedback.blockReason`) — only visible on raw chunks. */
function promptBlockReason(rawValue: unknown): string | null {
  const feedback = asErrorLike(rawValue) as { promptFeedback?: unknown };
  const reason = (asErrorLike(feedback.promptFeedback) as { blockReason?: unknown }).blockReason;
  return typeof reason === 'string' && reason && reason !== 'BLOCK_REASON_UNSPECIFIED' ? reason : null;
}

/**
 * The model that ACTUALLY served a response — the raw generateContent chunk's `modelVersion` — when it names a
 * DIFFERENT model than the one we asked for, i.e. we asked for an alias (`gemini-pro-latest` answers as
 * `gemini-3.1-pro-preview`, verified live 2026-09-30). Otherwise null:
 *   · the same id, or a pinned build of it (`<id>-001`, `<id>-preview-09-2026`) — the same model, keep its name;
 *   · anything that is not a plain `gemini-*` model id — it becomes UI text (the badge), so nothing else passes.
 * @ai-sdk/google 3.0.70 does not parse modelVersion at all; the raw chunk is the only place it exists.
 */
export function servedModelOf(rawValue: unknown, requested: string): string | null {
  const v = (asErrorLike(rawValue) as { modelVersion?: unknown }).modelVersion;
  if (typeof v !== 'string') return null;
  const id = v.trim().replace(/^models\//i, '');
  if (!MODEL_ID_RE.test(id) || !/^gemini-/i.test(id)) return null;
  const want = String(requested || '').trim().toLowerCase();
  const got = id.toLowerCase();
  return got === want || got.startsWith(`${want}-`) ? null : id;
}

function webSearchQueryCount(providerMetadata: unknown): number {
  const google = (asErrorLike(providerMetadata) as { google?: unknown }).google;
  const grounding = (asErrorLike(google) as { groundingMetadata?: unknown }).groundingMetadata;
  const queries = (asErrorLike(grounding) as { webSearchQueries?: unknown }).webSearchQueries;
  return Array.isArray(queries) ? queries.filter((q) => typeof q === 'string' && q.trim()).length : 0;
}

function finiteTokens(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/** Grounding chips render as links: only http(s), deduped by URL, bounded. lib/chat/sse.ts re-checks on decode. */
const SAFE_URL_RE = /^https?:\/\//i;
const MAX_SOURCES = 20;

// ─── One attempt ─────────────────────────────────────────────────────────────

interface AttemptOutcome {
  text: string;
  /** `servedModelOf` for this attempt, when Google named a different model. */
  served?: string;
  error?: ChatError;
  /** The caller aborted, or `onFrame` threw (the consumer is gone). Terminal, and nothing more is sent. */
  aborted: boolean;
  usage?: StreamGeminiChatResult['usage'];
  sources: Array<{ url: string; title?: string }>;
  groundingQueries: number;
  /** Text arrived and the model stopped on the output-token limit. */
  truncated?: boolean;
}

interface Emitter {
  emit(frame: ChatFrame): Promise<boolean>;
  readonly gone: boolean;
}

function createEmitter(onFrame: StreamGeminiChatInput['onFrame'], onGone: () => void): Emitter {
  let gone = false;
  return {
    get gone() {
      return gone;
    },
    async emit(frame) {
      if (gone) return false;
      try {
        await onFrame(frame);
        return true;
      } catch {
        // ⚠️ A THROWING onFrame MEANS THE RESPONSE IS DEAD (enqueue on a closed controller after the browser
        // left). Keep streaming and we pay Google for tokens nobody will read; stop instead.
        gone = true;
        onGone();
        return false;
      }
    },
  };
}

type GoogleProviderTools = ReturnType<typeof createGoogleGenerativeAI>['tools'];

/**
 * The provider tools one turn carries: `google_search` when the profile searches, `url_context` when the route
 * asked for it (`=== true` only — a truthy non-boolean from a hand-built config is not an opt-in). Undefined = none.
 *
 * ⚠️ ai@6 and @ai-sdk/google@3 disagree on the provider tool's inputSchema generic (<{}> vs <never>); the
 * provider-defined tools are valid at runtime, so the ToolSet cast only bridges the type skew.
 * ⚠️ url_context + google_search together on gemini-3.8-flash is UNVERIFIED live; a 400 there is `bad_request`, which
 * does not rotate. That is why the route keeps it behind GEMINI_CHAT_URL_CONTEXT (default off).
 */
export function chatToolsFor(
  config: Pick<GeminiChatConfig, 'googleSearch' | 'urlContext'>,
  tools: Pick<GoogleProviderTools, 'googleSearch' | 'urlContext'>,
): ToolSet | undefined {
  const set: Record<string, unknown> = {};
  if (config.googleSearch) set.google_search = tools.googleSearch({});
  if (config.urlContext === true) set.url_context = tools.urlContext({});
  return Object.keys(set).length > 0 ? (set as unknown as ToolSet) : undefined;
}

function buildProviderOptions(modelId: string, config: GeminiChatConfig): GoogleLanguageModelOptions | undefined {
  const opts: GoogleLanguageModelOptions = {};
  const safety = sanitizeSafetySettings(config.safetySettings);
  if (safety.length > 0) opts.safetySettings = safety;
  const thinkingConfig = thinkingConfigFor(modelId, config.thinking?.level);
  if (thinkingConfig) opts.thinkingConfig = thinkingConfig;
  return Object.keys(opts).length > 0 ? opts : undefined;
}

/** The `{meta}` frame for one attempt. `fallback` only when true, so a primary-model answer keeps the original shape. */
function metaFrame(model: string, fallback: boolean, partial = false): ChatFrame {
  return { meta: { provider: 'gemini', model, ...(partial ? { partial: true } : {}), ...(fallback ? { fallback: true } : {}) } };
}

async function runAttempt(
  modelId: string,
  /** True when this is not the chain's first model: every `{meta}` it sends says so. */
  fallback: boolean,
  input: StreamGeminiChatInput,
  emitter: Emitter,
  linkAbort: (ctrl: AbortController) => () => void,
): Promise<AttemptOutcome> {
  const out: AttemptOutcome = { text: '', aborted: false, sources: [], groundingQueries: 0 };
  /** The model the last `{meta}` sent for this attempt named; null until the first text. */
  let metaModel: string | null = null;
  const ctrl = new AbortController();
  const unlink = linkAbort(ctrl);
  const seenUrls = new Set<string>();
  let finishReason: string | undefined;
  let rawFinishReason: string | undefined;
  let blockReason: string | null = null;

  const callerGone = () => Boolean(input.abortSignal?.aborted) || emitter.gone;

  try {
    const { config } = input;
    const google = createGoogleGenerativeAI({ apiKey: input.apiKey });
    const providerOptions = buildProviderOptions(modelId, config);
    const tools = chatToolsFor(config, google.tools);

    const result = streamText({
      model: google(modelId),
      system: config.system,
      messages: input.messages as ModelMessage[],
      ...(tools ? { tools } : {}),
      ...samplingFor(modelId, config),
      topP: config.topP,
      maxOutputTokens: config.maxOutputTokens,
      ...(providerOptions ? { providerOptions: { google: providerOptions } } : {}),
      // Fail fast: rotation is ours, and the SDK's own retries would burn the function's time budget.
      maxRetries: 0,
      abortSignal: ctrl.signal,
      // Needed for promptFeedback.blockReason: a prompt blocked before any candidate has no finish reason at all.
      includeRawChunks: true,
      // ⚠️ The default onError console.error()s the whole APICallError — including requestBodyValues, i.e. the
      // user's entire conversation and base64 attachments — into the function logs. We log one line ourselves.
      onError: () => {},
    });

    for await (const part of result.fullStream) {
      if (callerGone()) {
        out.aborted = true;
        break;
      }
      switch (part.type) {
        case 'text-delta': {
          const delta = part.text;
          if (!delta) break;
          if (out.text.length === 0) {
            metaModel = out.served ?? modelId;
            await emitter.emit(metaFrame(metaModel, fallback));
          }
          if (await emitter.emit({ text: delta })) out.text += delta;
          break;
        }
        case 'source': {
          if (part.sourceType !== 'url') break;
          const url = typeof part.url === 'string' ? part.url.trim() : '';
          if (!url || !SAFE_URL_RE.test(url) || seenUrls.has(url) || out.sources.length >= MAX_SOURCES) break;
          seenUrls.add(url);
          const title = typeof part.title === 'string' && part.title.trim() ? part.title.trim() : undefined;
          out.sources.push(title ? { url, title } : { url });
          break;
        }
        case 'raw': {
          blockReason = blockReason ?? promptBlockReason(part.rawValue);
          if (!out.served) {
            const served = servedModelOf(part.rawValue, modelId);
            if (served) {
              out.served = served;
              // The raw part precedes the parsed parts of its chunk, so the version normally rides the FIRST meta
              // frame. If it only appears after text went out, correct the badge — once (`served` is set once).
              if (metaModel !== null && metaModel !== served) {
                metaModel = served;
                await emitter.emit(metaFrame(served, fallback));
              }
            }
          }
          break;
        }
        case 'finish-step': {
          out.groundingQueries = Math.max(out.groundingQueries, webSearchQueryCount(part.providerMetadata));
          break;
        }
        case 'finish': {
          finishReason = part.finishReason;
          rawFinishReason = part.rawFinishReason;
          const u = part.totalUsage;
          const usage = {
            inputTokens: finiteTokens(u?.inputTokens),
            outputTokens: finiteTokens(u?.outputTokens),
            totalTokens: finiteTokens(u?.totalTokens),
          };
          if (usage.inputTokens !== undefined || usage.outputTokens !== undefined || usage.totalTokens !== undefined) {
            out.usage = Object.fromEntries(Object.entries(usage).filter(([, v]) => v !== undefined));
          }
          break;
        }
        case 'error': {
          out.error = classifyChatError(part.error);
          break;
        }
        case 'abort': {
          out.aborted = true;
          break;
        }
        default:
          break;
      }
      // Stop reading on the first error: whatever follows an error part is not an answer we can vouch for.
      if (out.error || out.aborted) break;
      if (emitter.gone) {
        out.aborted = true;
        break;
      }
    }
  } catch (err) {
    if (callerGone()) out.aborted = true;
    else out.error = classifyChatError(err);
  } finally {
    unlink();
    // ⚠️ `fullStream` is one branch of a tee: leaving the loop early cancels OUR branch only, and the
    // un-read sibling keeps the upstream request alive. Aborting our own controller is what actually tears
    // the HTTP stream down (a no-op when the stream already finished).
    ctrl.abort();
  }

  if (out.aborted || callerGone()) {
    out.aborted = true;
    delete out.error;
    return out;
  }
  if (out.error) return out;
  if (blockReason) {
    out.error = makeError('safety', `prompt blocked: ${blockReason}`);
  } else if (finishReason === 'content-filter') {
    out.error = makeError('safety', `finish: ${rawFinishReason || 'content-filter'}`);
  } else if (out.text.length === 0) {
    // A 200 with no text and no error (thinking ate maxOutputTokens, an empty candidate, an OTHER stop).
    // Nothing reached the user, so this is a model to skip, not an answer.
    out.error = makeError('unavailable', `empty response (finish: ${rawFinishReason || finishReason || 'none'})`);
  } else if (finishReason === 'length' || rawFinishReason === 'MAX_TOKENS') {
    // ⚠️ A REPLY CUT AT maxOutputTokens USED TO LOOK FINISHED. It is still an answer (the text stays), but the caller
    // is told, so the user sees "the answer was cut off" instead of a sentence that just stops.
    out.truncated = true;
  }
  return out;
}

// ─── The turn ────────────────────────────────────────────────────────────────

/**
 * Streams one chat turn from the first model in `models` that answers.
 *
 * Rotation: the next model is tried ONLY while no text has been sent for this turn AND the failure is
 * model_missing / unavailable / network / rate_limited. auth and quota are account-wide (every model would
 * fail the same way, and each try costs latency), safety is deliberate (another model re-answering a
 * blocked prompt is a filter bypass), and bad_request is our payload. Once text has been sent, a failure is
 * terminal: a second model's answer appended to the first one's partial answer is a garbled bubble.
 * With `retryTransientOnce`, the first transient failure (see `isTransientFailure`) retries the SAME model once,
 * after a short backoff, before any rotation.
 *
 * Never throws; every outcome is in the result, and every failure a live consumer can still read ends with
 * an `{error}` frame.
 */
export async function streamGeminiChat(input: StreamGeminiChatInput): Promise<StreamGeminiChatResult> {
  const attempts: StreamGeminiChatResult['attempts'] = [];
  let currentCtrl: AbortController | null = null;
  const emitter = createEmitter(
    (frame) => input.onFrame(frame),
    () => currentCtrl?.abort(),
  );

  const finish = async (res: StreamGeminiChatResult, frames: ChatFrame[]): Promise<StreamGeminiChatResult> => {
    for (const f of frames) {
      if (!(await emitter.emit(f))) break;
    }
    return res;
  };

  const failure = (code: ChatErrorCode, message: string, model: string | null): StreamGeminiChatResult => ({
    ok: false,
    model,
    text: '',
    sources: [],
    error: makeError(code, message),
    attempts,
  });
  const errorFrame = (err: ChatError): ChatFrame => ({
    error: { code: err.code, retryable: err.retryable, message: PUBLIC_MESSAGE[err.code] },
  });

  try {
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    const notReady = googleTransportBlocker(apiKey);
    if (notReady) {
      const res = failure('auth', notReady, null);
      return await finish(res, [errorFrame(res.error!)]);
    }
    const models = usableModels(input.models);
    if (models.length === 0) {
      const res = failure('model_missing', 'no usable Gemini model id in the chain', null);
      return await finish(res, [errorFrame(res.error!)]);
    }

    const linkAbort = (ctrl: AbortController) => {
      currentCtrl = ctrl;
      const signal = input.abortSignal;
      if (!signal) return () => {};
      const onAbort = () => ctrl.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      return () => signal.removeEventListener('abort', onAbort);
    };
    const attemptInput: StreamGeminiChatInput = { ...input, apiKey };

    let last: { model: string; index: number; outcome: AttemptOutcome } | null = null;
    /** `retryTransientOnce` spends its one retry per turn, so a busy model costs at most one backoff. */
    let retried = false;
    for (let i = 0; i < models.length; ) {
      const model = models[i]!;
      if (input.abortSignal?.aborted || emitter.gone) break;
      const outcome = await runAttempt(model, i > 0, attemptInput, emitter, linkAbort);
      last = { model, index: i, outcome };

      const billed = {
        ...(outcome.usage ? { usage: outcome.usage } : {}),
        ...(outcome.groundingQueries ? { groundingQueries: outcome.groundingQueries } : {}),
      };
      if (outcome.aborted) {
        attempts.push({ model, code: 'network', ...billed });
        break;
      }
      if (!outcome.error) {
        attempts.push({ model, ...billed });
        break;
      }
      attempts.push({ model, code: outcome.error.code, ...billed });
      console.warn(
        `[gemini-chat] ${model} → ${outcome.error.code}${outcome.error.status ? ` (${outcome.error.status})` : ''}: ${outcome.error.message}`,
      );
      // ⚠️ PRO WAS ONE BUSY MINUTE FROM FAILING. Its chain is a single preview model with maxRetries 0, so one 429 or
      // 503 ended the turn. With `retryTransientOnce` the same model gets one more try after a short, jittered pause —
      // only while nothing has been sent, so a retry can never append a second answer to a first.
      if (input.retryTransientOnce === true && !retried && outcome.text.length === 0 && isTransientFailure(outcome.error)) {
        retried = true;
        const delay = typeof input.retryDelayMs === 'number'
          ? input.retryDelayMs
          : TRANSIENT_RETRY_BASE_MS + Math.floor(Math.random() * (TRANSIENT_RETRY_JITTER_MS + 1));
        await pause(delay, input.abortSignal);
        if (input.abortSignal?.aborted || emitter.gone) {
          last = { model, index: i, outcome: { ...outcome, aborted: true } };
          break;
        }
        continue; // the same model again
      }
      const canRotate = outcome.text.length === 0 && ROTATE_ON.has(outcome.error.code) && i < models.length - 1;
      if (!canRotate) break;
      i++;
    }

    if (!last || last.outcome.aborted) {
      // The caller left (or aborted before the first attempt). Nothing more is sent to a consumer that is gone.
      return {
        ok: false,
        model: last?.model ?? null,
        ...(last?.outcome.served ? { servedModel: last.outcome.served } : {}),
        text: last?.outcome.text ?? '',
        ...(last?.outcome.usage ? { usage: last.outcome.usage } : {}),
        sources: last?.outcome.sources ?? [],
        error: makeError('network', 'aborted by the caller'),
        attempts,
        ...(last?.outcome.groundingQueries ? { groundingQueries: last.outcome.groundingQueries } : {}),
      };
    }

    const { model, index, outcome } = last;
    const res: StreamGeminiChatResult = {
      ok: !outcome.error,
      model,
      ...(outcome.served ? { servedModel: outcome.served } : {}),
      text: outcome.text,
      ...(outcome.usage ? { usage: outcome.usage } : {}),
      sources: outcome.sources,
      ...(outcome.error ? { error: outcome.error } : {}),
      attempts,
      ...(outcome.groundingQueries ? { groundingQueries: outcome.groundingQueries } : {}),
      ...(outcome.truncated && !outcome.error ? { truncated: true } : {}),
    };

    const tail: ChatFrame[] = [];
    // The meta frame already on the wire says this model answered; correct it before the error lands.
    if (outcome.error && outcome.text.length > 0) tail.push(metaFrame(outcome.served ?? model, index > 0, true));
    if (outcome.sources.length > 0) tail.push({ sources: outcome.sources });
    if (outcome.usage) tail.push({ usage: { model, ...outcome.usage } });
    if (res.truncated) tail.push({ truncated: true });
    if (outcome.error) tail.push(errorFrame(outcome.error));
    return await finish(res, tail);
  } catch (err) {
    // Belt and braces: nothing above should throw, but this function's contract is that it never does.
    const e = classifyChatError(err);
    const res: StreamGeminiChatResult = { ok: false, model: null, text: '', sources: [], error: e, attempts };
    try {
      return await finish(res, [errorFrame(e)]);
    } catch {
      return res;
    }
  }
}
