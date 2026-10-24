/**
 * POST /api/chat/gemini — the product chat (OmniStudio `streamChat`): one streamed Gemini turn per request.
 *
 * Order of work, cheapest refusal first:
 *   1. per-IP burst limit (READ) and the 16 MB body cap — before any network call;
 *   2. a verified session — or, without one, the GUEST policy (lib/chat/guestChat: Fast, text only, no grounding,
 *      short answers); CHAT_GUEST_ENABLED=0 answers a guest 401 in the generationGate body shape instead;
 *   3. the history re-validated server-side through lib/chat/historySerializer (400 when nothing usable is left);
 *   4. the daily caps — per user (CHAT_USER, keyed on the user id), or for a guest per IP AND for all guests
 *      together; refused IN-STREAM (a guest's refusal is `auth_required`, which opens the sign-in sheet);
 *   5. the chat MODE (the header's Fast · Thinking · Pro · Lite picker, lib/chat/chatModes): a Pro turn also draws on
 *      the per-user Pro allowance (CHAT_PRO_USER) and is DOWNGRADED to Fast — not refused — once that is spent;
 *   6. the platform budget pre-check at the mode's primary model's rate (BillingGuard, fails closed) — refused IN-STREAM;
 *   7. platform prompt (lib/chat/platformPrompt) + the user's profile facts + vector memory, then the agent profile
 *      (lib/agents/profile) turns persona + prompt into the Gemini config, and the mode lays its generation settings
 *      over it (`applyChatMode`). The facts, the memory and the talking-avatar check run alongside step 6 and are
 *      waited for only up to CONTEXT_DEADLINE_MS (left out when late); the budget is waited for in full;
 *   8. lib/ai/google/chatStream streams the turn across chatModelChain(mode) with typed errors;
 *   9. no other vendor: a Gemini failure is a notice, never an Anthropic answer (no env value restores the old
 *      fallback, MASTER TASK v3.1);
 *  10. real token usage booked with the user id, before the stream closes.
 *
 * WIRE (lib/chat/sse.ts — one encoder here, one parser in the browser):
 *   success:              {meta} {text}… [{sources}] [{usage}] [{truncated}] [DONE]
 *   failure, no text:     [{usage}] {text: notice} {error} [DONE]
 *   failure after text:   {meta} {text}… {meta partial:true} [{sources}] [{usage}] {error} [DONE]
 *   budget refusal:       {meta provider:'budget'} {text: notice} {error budget} [DONE]
 * `{truncated}` = the answer stopped at the output-token limit. Every `{error}` this route writes carries `lang`: its
 * `message` is a notice in that locale, meant to be shown as is.
 *
 * Every answer's `{meta}` also carries `mode` (the mode that answered) and `fallback` (not that mode's primary model),
 * plus `requestedMode` / `reason` [/ `resetAt`] when it was answered in another mode than asked: 'pro_cap' (the Pro
 * allowance is spent), 'pro_busy' (Pro failed even after a retry; its allowance is given back) or 'guest'.
 *
 * LANGUAGE: the body's optional `language` ('ka' | 'en' | 'ru', the UI locale) is a hint — the reply follows the
 * user's own words when they say a language ("hi" and Russian in Latin letters included), else the conversation's
 * latest one, else the hint (lib/chat/replyLocale `resolveReplyLocale`); the route's notices are written in the hint.
 *
 * ⚠️ THE CLIENT PICKS A MODE, NEVER A MODEL. A model id in the body is ignored; the chain is chosen here, so a request
 * cannot point a turn at an arbitrary (or costlier) model.
 *
 * ⚠️ THE `{text: notice}` FRAME IS FOR THE CLIENT THAT PREDATES `{error}` FRAMES. Today's OmniStudio parser reads
 * only `{text}` and `{meta}`; an error delivered as `{error}` alone would leave it an EMPTY bubble — the exact
 * "silent failure" this rewrite exists to end. So a failure that produced no answer ALSO arrives as a localized
 * `{text}`, exactly like the old safety / "providers down" / budget notices did. A client that renders `{error}`
 * frames sends `protocol: 2` in the body and gets the `{error}` frame alone, without the duplicate notice.
 *
 * ⚠️ PROVIDER WORDING NEVER REACHES THE USER, AND A PROVIDER 402 IS OUR OUTAGE (lib/api/providerError.ts). A
 * depleted Google prepay, an invalid key and a missing model all read "temporarily unavailable on our side" — never
 * "top up", never Google's billing console, never the raw error. The diagnostic (key-redacted by chatStream) goes to
 * logs/Sentry only.
 */
import type { ModelMessage } from 'ai';
import { NextRequest } from 'next/server';
import { reportError } from '@/lib/observability/report-error';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { embed } from '@/lib/memory/embed';
import { savedFactsBlock } from '@/lib/memory/context';
import { getUserProfileFacts, buildProfilePreamble, extractProfileFacts, saveUserProfileFacts } from '@/lib/chat/userMemory';
import { checkRateLimit, checkRateLimitByKey, chatProUserLimit, refundRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { isReplyLocale, resolveReplyLocale } from '@/lib/chat/replyLocale';
import { chatBudgetRefusal, bookChatUsage, GUARD_UNAVAILABLE } from '@/lib/services/billing/chatBudget';
import { budgetRefusalMessage } from '@/lib/services/billing/budgetMessage';
import { anonymousGenerationAllowed, isAnonymousUser, signInToGenerateBody } from '@/lib/auth/generationGate';
import {
  GUEST_GLOBAL_KEY,
  GUEST_MAX_OUTPUT_TOKENS,
  GUEST_NOTICE,
  guestChatDailyLimit,
  guestChatEnabled,
  guestChatGlobalDailyLimit,
  guestSearchEnabled,
  guestTurnRefusal,
  type GuestRefusal,
} from '@/lib/chat/guestChat';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { chatModelChain } from '@/lib/ai/google/models';
import { chatModeOption, resolveChatMode, type ChatModeId } from '@/lib/chat/chatModes';
import { streamGeminiChat, unbookedAttempts, type GeminiChatConfig, type StreamGeminiChatResult } from '@/lib/ai/google/chatStream';
import { wantsUrlContext } from '@/lib/chat/urlContext';
import { encodeFrame, SSE_KEEPALIVE, type ChatErrorCode, type ChatFrame, type ChatMeta } from '@/lib/chat/sse';
import {
  estimateWireChars,
  serializeHistory,
  stripHistoryMarkers,
  wireToHistory,
  type WireMessage,
  type WirePart,
} from '@/lib/chat/historySerializer';
import { resolveAgentProfile, toGeminiChatConfig } from '@/lib/agents/profile';
import { buildPlatformPrompt } from '@/lib/chat/platformPrompt';
import { isAdminIdentity, type AdminCandidate } from '@/lib/auth/adminGuard';
import { veoAvatarPublic } from '@/lib/avatar/veoAvatar';
import { serverTiming, type ServerTiming } from '@/lib/perf/serverTiming';

/** Derived from the helper's own return type — lib/supabase/server does not export its client alias. */
type AnyAuthedClient = Awaited<ReturnType<typeof authedClientFromRequest>>['supabase'];

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Vision (multimodal) requests can take significantly longer for large photos. 120 s gives Gemini room to analyse
// and start streaming before any function timeout interrupts the connection.
/**
 * 300 s, mirrored in vercel.json (which used to pin this route to 60 s while this file said 120 — the docs do not
 * say which wins, so they now agree). A Pro or Thinking turn can reason for a minute before its first token and then
 * stream a long answer; 60 s cut those off mid-sentence. TURN_DEADLINE_MS ends a stuck turn cleanly before this.
 */
export const maxDuration = 300;

type Locale = 'ka' | 'en' | 'ru';

/**
 * Body size cap. Pure-text chat fits easily under 200 KB; multimodal requests carry base64 (≈1.33× the raw bytes),
 * so 16 MB accepts a ~12 MB photo while still rejecting obvious abuse. The Paperclip picker caps the raw file at 8 MB.
 */
const MAX_BODY_BYTES = 16_000_000;

/** How long the stream may stay open after [DONE] waiting for the usage booking (see the finally block). */
const BOOKING_WAIT_MS = 1_500;

/**
 * SSE keep-alive cadence. The browser's watchdog gives the first token 20 s and a stalled answer 45 s, re-arming on
 * any bytes (hooks/chat/useChatStream); 8 s leaves two heartbeats inside the tighter window even with jitter.
 */
export const HEARTBEAT_MS = 8_000;

/**
 * The server's own ceiling on one turn. With heartbeats flowing, the browser watchdog no longer catches a hung
 * upstream, so the route must: past this the model call is aborted and the user gets a retryable notice instead of a
 * connection the platform kills at maxDuration with no explanation. 20 s of headroom covers the notice + booking.
 */
export const TURN_DEADLINE_MS = (maxDuration - 20) * 1000;

/**
 * ⚠️ THE MODEL WAITS FOR THE BUDGET, NOT FOR THE EXTRAS (MASTER TASK v3.1 §4.4). The profile facts, the vector memory
 * and the talking-avatar check run alongside the budget check, and the turn waits for them this long from when they
 * started, or until the budget answers if that is later. Whatever is not in by then is left out of this turn
 * (fail-soft): the answer comes without that context, and a late avatar check offers no avatar. The budget has no such
 * deadline: it is the gate, and it fails closed. 500 ms is a chosen bound, not a measured one: the mock fixture's
 * memory takes 200 ms (embedding, then the lookup), and production has not been timed.
 */
export const CONTEXT_DEADLINE_MS = 500;

/**
 * Each mode's output ceiling floor, THINKING INCLUDED (Gemini counts thought tokens against maxOutputTokens) — see
 * `applyChatMode`. ⚠️ It was 4,096 for Fast / Lite and 8,192 for Thinking / Pro, so a long answer (a full essay, a
 * long code file, a detailed plan) stopped mid-sentence, and nothing said so. Google documents 65,536 output tokens
 * for its current Flash, Flash-Lite and Pro models (UNVERIFIED for an id an env override adds to a chain). A reply that
 * still reaches the ceiling now ends with a `{truncated}` frame instead of passing as complete.
 */
const MODE_MIN_OUTPUT_TOKENS: Readonly<Record<ChatModeId, number>> = { fast: 16_384, lite: 16_384, thinking: 32_768, pro: 32_768 };

/**
 * Failures of a Pro turn that hand it to the Fast chain (after chatStream's one same-model retry of a 429 / 503):
 * the ones that are about Pro's MODEL, not the account (auth, quota), the request (bad_request) or the prompt (safety).
 */
const PRO_FALLBACK_ON: ReadonlySet<ChatErrorCode> = new Set<ChatErrorCode>(['rate_limited', 'unavailable', 'model_missing', 'network']);

const HTTP_RE = /^https?:\/\//i;

const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  // Any nginx-class buffering proxy in front of the app will otherwise accumulate the whole SSE body and deliver
  // it in one piece — a correctly-implemented token stream turned into "it all appears at once, late".
  'X-Accel-Buffering': 'no',
};

// ─── Copy ────────────────────────────────────────────────────────────────────

const SIGN_IN_TO_CHAT: Readonly<Record<Locale, string>> = {
  ka: 'ჩატის გამოსაყენებლად შედი ანგარიშზე.',
  en: 'Sign in to use the chat.',
  ru: 'Войдите в аккаунт, чтобы пользоваться чатом.',
};

const DAILY_CAP_NOTICE: Readonly<Record<Locale, string>> = {
  ka: '⚠️ ჩატის დღიური ლიმიტი ამოიწურა. სცადე მოგვიანებით.',
  en: "⚠️ You've reached the daily chat limit. Please try again later.",
  ru: '⚠️ Дневной лимит сообщений исчерпан. Попробуйте позже.',
};

/**
 * The PLATFORM's AI budget guard refused the turn (shared by everyone — not the user's own limit). It used to be one
 * bilingual ka+en string (BUDGET_EXHAUSTED_MESSAGE) for every locale; the Georgian and English halves are kept.
 */
const PLATFORM_BUDGET_NOTICE: Readonly<Record<Locale, string>> = {
  ka: 'ბოდიში — პლატფორმის დღევანდელი AI ბიუჯეტი ამოიწურა. სცადეთ ცოტა ხანში.',
  en: "Sorry — the platform's AI budget for this period is exhausted. Please try again later.",
  ru: 'Извините — бюджет ИИ платформы на этот период исчерпан. Попробуйте чуть позже.',
};

/** Our side is down (unfunded project, bad key, a model the project cannot see): an outage, never "top up". */
const OUR_OUTAGE: Readonly<Record<Locale, string>> = {
  ka: '⚠️ AI სერვისი დროებით მიუწვდომელია ჩვენი მხრიდან. სცადე ცოტა ხანში.',
  en: '⚠️ The AI service is temporarily unavailable on our side. Please try again shortly.',
  ru: '⚠️ AI-сервис временно недоступен с нашей стороны. Попробуйте чуть позже.',
};

/** What the user reads for each failure, in the reply language. The client may re-localize by `code`. */
const NOTICE: Readonly<Record<ChatErrorCode, Readonly<Record<Locale, string>>>> = {
  auth: OUR_OUTAGE,
  quota: OUR_OUTAGE,
  model_missing: OUR_OUTAGE,
  unavailable: {
    ka: '⚠️ AI სერვისი დროებით მიუწვდომელია. სცადე თავიდან.',
    en: '⚠️ The AI service is temporarily unavailable. Please try again.',
    ru: '⚠️ AI-сервис временно недоступен. Попробуйте ещё раз.',
  },
  rate_limited: {
    ka: '⚠️ ამჟამად ბევრი მოთხოვნაა. დაელოდე წამით და სცადე თავიდან.',
    en: '⚠️ The AI service is busy right now. Please try again in a moment.',
    ru: '⚠️ Сейчас слишком много запросов. Попробуйте через минуту.',
  },
  network: {
    ka: '⚠️ კავშირი AI სერვისთან შეწყდა. სცადე თავიდან.',
    en: '⚠️ The connection to the AI service was interrupted. Please try again.',
    ru: '⚠️ Соединение с AI-сервисом прервалось. Попробуйте ещё раз.',
  },
  safety: {
    ka: '⚠️ ეს მოთხოვნა უსაფრთხოების ფილტრმა დაბლოკა. გთხოვ, შეცვალე ფორმულირება და სცადე თავიდან.',
    en: '⚠️ This request was blocked by safety filters. Please rephrase and try again.',
    ru: '⚠️ Запрос заблокирован фильтрами безопасности. Переформулируйте и попробуйте снова.',
  },
  bad_request: {
    ka: '⚠️ ამ მოთხოვნის დამუშავება ვერ მოხერხდა. სცადე ფორმულირების შეცვლა ან დანართის მოშორება.',
    en: '⚠️ This request could not be processed. Try rephrasing it or removing the attachment.',
    ru: '⚠️ Этот запрос не удалось обработать. Переформулируйте его или уберите вложение.',
  },
  budget: PLATFORM_BUDGET_NOTICE,
  auth_required: SIGN_IN_TO_CHAT,
  daily_cap: DAILY_CAP_NOTICE,
  guest_limit: GUEST_NOTICE.cap,
  too_long: GUEST_NOTICE.too_long,
};

/**
 * What each in-stream POLICY refusal is called on the wire. ⚠️ They used to borrow other codes — a spent daily cap went
 * out as `rate_limited` (the client said "too many requests, try again" and offered Retry), a guest's spent allowance
 * and too-long message as `auth_required` ("sign in") — so the client re-worded them wrongly. None is retryable.
 * A guest's photo stays `auth_required`: signing in is the one way to send it.
 */
const GUEST_REFUSAL_CODE: Readonly<Record<'cap' | GuestRefusal, ChatErrorCode>> = {
  cap: 'guest_limit',
  media: 'auth_required',
  too_long: 'too_long',
};

/** Mirrors lib/chat/sse.ts: codes worth a retry button when nothing more specific is known. */
const RETRYABLE_BY_DEFAULT: ReadonlySet<ChatErrorCode> = new Set<ChatErrorCode>(['rate_limited', 'network', 'unavailable']);

// ─── Request helpers ─────────────────────────────────────────────────────────

interface ChatRequestBody {
  messages?: unknown;
  /** The UI locale ('ka' | 'en' | 'ru'): a HINT for the reply language (see the header), and the notices' language. */
  language?: unknown;
  /** The chat mode (lib/chat/chatModes ChatModeId). Anything else → Fast. Never a model id. */
  mode?: unknown;
  /** LEGACY (clients before modes): `'pro'` → the Pro mode when `mode` is absent. */
  tier?: unknown;
  personaId?: unknown;
  customPersona?: unknown;
  /** 2 = the client renders `{error}` frames itself; omit the legacy `{text}` notice. */
  protocol?: unknown;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * The UI locale for responses sent BEFORE the body is read (the 401): the `/ka|en|ru/` segment of the page that
 * made the call (same-origin fetches carry the full Referer), else Georgian.
 */
function requestLocale(req: NextRequest): Locale {
  try {
    const m = /^\/(ka|en|ru)(?:\/|$)/.exec(new URL(req.headers.get('referer') ?? '').pathname);
    if (m) return m[1] as Locale;
  } catch {
    /* no or malformed referer */
  }
  return 'ka';
}

function textOfParts(parts: readonly WirePart[]): string {
  return parts
    .filter((p): p is Extract<WirePart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

function textOfWire(m: WireMessage): string {
  return typeof m.content === 'string' ? m.content : textOfParts(m.content);
}

/** The serializer's markers are Latin text; strip them so `[generated image: …]` can't flip a Georgian thread to 'en'. */
function localeView(wire: readonly WireMessage[]): Array<{ role: string; content: string }> {
  return wire.map((m) => ({ role: m.role, content: stripHistoryMarkers(textOfWire(m)) }));
}

/** An http(s) link travels as a URL (the SDK fetches it, with its own private-address check); bytes stay a string. */
function asDataContent(src: string): string | URL {
  if (!HTTP_RE.test(src)) return src;
  try {
    return new URL(src);
  } catch {
    return src;
  }
}

/** Serializer wire → ai@6 ModelMessage[]. Assistant turns are always strings (the serializer guarantees it). */
function toModelMessages(wire: readonly WireMessage[]): ModelMessage[] {
  return wire.map((m): ModelMessage => {
    if (m.role === 'assistant') return { role: 'assistant', content: textOfWire(m) };
    if (typeof m.content === 'string') return { role: 'user', content: m.content };
    return {
      role: 'user',
      content: m.content.map((p) => {
        if (p.type === 'text') return { type: 'text' as const, text: p.text };
        if (p.type === 'image') {
          return { type: 'image' as const, image: asDataContent(p.image), ...(p.mimeType ? { mediaType: p.mimeType } : {}) };
        }
        return { type: 'file' as const, data: asDataContent(p.data), mediaType: p.mimeType, ...(p.name ? { filename: p.name } : {}) };
      }),
    };
  });
}

function hasTokens(u: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined): boolean {
  return !!u && ((u.inputTokens ?? 0) > 0 || (u.outputTokens ?? 0) > 0 || (u.totalTokens ?? 0) > 0);
}

/**
 * The chat MODE's generation settings, laid over the persona's config. The persona keeps what it is about — system
 * prompt, safety, search, topP / topK — and the mode sets how hard the model thinks, because the dropdown is the
 * user's explicit, per-turn choice of exactly that:
 *   · thinking — the mode's level REPLACES the persona's (Fast / Lite 'low', Thinking / Pro 'high').
 *   · maxOutputTokens ≥ the mode's floor (MODE_MIN_OUTPUT_TOKENS). Thinking tokens count against it: at 4096 a long
 *     reasoning pass ends MAX_TOKENS with EMPTY text, which chatStream (rightly) treats as a failed attempt and
 *     rotates — Google has billed the whole thought budget, and the next model bills it again; with text, the answer
 *     is cut short. A persona's own value is a floor-raised preference, not a way to cut answers off.
 *   · temperature omitted for the reasoning modes. Google's Gemini 3 guidance is to keep the default 1.0: lower values
 *     risk looping or weaker reasoning. Fast / Lite keep it in the config, but chatStream sends it to a Gemini 3 model
 *     only when the persona chose it (`personaSampling`); the platform's 0.7 / topK 40 default is left out.
 */
function applyChatMode(config: GeminiChatConfig, mode: ChatModeId): GeminiChatConfig {
  const { thinking } = chatModeOption(mode);
  const maxOutputTokens = Math.max(config.maxOutputTokens, MODE_MIN_OUTPUT_TOKENS[mode]);
  if (thinking !== 'high') return { ...config, thinking: { level: thinking }, maxOutputTokens };
  const { temperature: _personaTemperature, ...rest } = config;
  return { ...rest, thinking: { level: thinking }, maxOutputTokens };
}

/**
 * When a spent allowance comes back, as an ISO instant, from the limiter's 429: `X-RateLimit-Reset` (epoch seconds)
 * or else `Retry-After` (seconds from now). Undefined when neither is usable — the notice then leaves the time out.
 */
function resetAtOf(limited: Response): string | undefined {
  const resetSec = Number(limited.headers.get('x-ratelimit-reset') ?? NaN);
  const retrySec = Number(limited.headers.get('retry-after') ?? NaN);
  const ms =
    Number.isFinite(resetSec) && resetSec > 0 ? resetSec * 1000
      : Number.isFinite(retrySec) && retrySec >= 0 ? Date.now() + retrySec * 1000
        : NaN;
  if (!Number.isFinite(ms)) return undefined;
  const at = new Date(ms);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

/** Wait for `p` at most `ms`; never rejects. */
async function settleWithin(p: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    p.then(() => undefined, () => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]);
  if (timer) clearTimeout(timer);
}

/**
 * `p`'s value when it is in within `ms`, else `late`; a rejection is `late` too. One already in always wins, even at
 * `ms` ≤ 0: its callbacks run before any timer can.
 */
async function valueWithin<T>(p: Promise<T>, ms: number, late: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const value = await Promise.race([
    p.catch(() => late),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(late), Math.max(0, ms));
    }),
  ]);
  if (timer) clearTimeout(timer);
  return value;
}

/** A complete SSE response from a fixed list of frames (the in-stream refusals decided before the model runs). */
function frameResponse(frames: ReadonlyArray<ChatFrame | 'DONE'>): Response {
  return new Response(frames.map((f) => encodeFrame(f)).join(''), { headers: SSE_HEADERS });
}

// ─── Memory ──────────────────────────────────────────────────────────────────

/**
 * Vector memory: embed the latest user text and fetch the user's top-5 `match_memories` rows. Fail-open (null).
 *
 * ⚠️ TIME-TO-FIRST-TOKEN. Auth is resolved ONCE by the caller and passed in (it used to be validated twice per
 * turn — `auth.getUser()` is a network round-trip, not a local decode), and this runs CONCURRENTLY with the profile
 * facts and the budget check instead of in series in front of the model.
 */
async function buildMemoryPreamble(supabase: AnyAuthedClient, userId: string, userText: string, timing: ServerTiming): Promise<string | null> {
  try {
    if (!userText) return null;
    const embedding = await timing.time('embed', embed(userText));
    if (!embedding) return null;
    const { data, error } = await supabase.rpc('match_memories', { query_embedding: embedding, match_count: 5 });
    if (error) {
      reportError(error, { route: '/api/chat/gemini', stage: 'memory-rpc', userId });
      return null;
    }
    const rows = (data ?? []) as Array<{ id: string; fact: string; similarity: number }>;
    // Facts the user explicitly stored in earlier sessions, most relevant first: capped and one line each, the same
    // block every surface gives (lib/memory/context).
    return savedFactsBlock(rows.map((r) => r.fact));
  } catch (err) {
    reportError(err, { route: '/api/chat/gemini', stage: 'memory-build', userId });
    return null;
  }
}

/**
 * Cross-chat persistent profile facts (lib/chat/userMemory): read the stored facts, and fire-and-forget any explicit
 * new fact in this turn. Fully fail-open: no user / absent table / any error → null and no write.
 */
async function buildProfileFactsPreamble(supabase: AnyAuthedClient, userId: string, userText: string): Promise<string | null> {
  try {
    const facts = await getUserProfileFacts(supabase, userId);
    if (userText) {
      const fresh = extractProfileFacts(userText);
      if (fresh.length) void saveUserProfileFacts(supabase, userId, fresh);
    }
    return buildProfilePreamble(facts);
  } catch {
    return null;
  }
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Where the turn's time goes (rate, auth, body, admin, prompt before the stream; budget, profile, embed, memory,
  // model, ttft in it), only for a request that opts in with a trace id: lib/perf/serverTiming. Untraced turns are
  // answered byte for byte as before.
  const timing = serverTiming(req);
  // Cheap per-IP burst guard, before any network call (auth is a Supabase round-trip).
  const ipLimited = await timing.time('rate', checkRateLimit(req, RATE_LIMITS.READ));
  if (ipLimited) return ipLimited;

  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'Request body too large (max 16 MB)' }, 413);

  // ⚠️ SIGN-IN, SERVER-SIDE — OR THE GUEST POLICY. This route used to answer anyone at 100 turns/min per IP (a script
  // spending our Gemini balance), then refused every anonymous caller. The home page now opens on the chat, so a
  // visitor may talk to it under lib/chat/guestChat: Fast only, text only, no grounding, short answers, capped per IP
  // AND for all guests together. A failed session lookup is treated as anonymous — fail closed into that policy.
  // CHAT_GUEST_ENABLED=0 restores the 401; FILM_ALLOW_ANONYMOUS=1 (demos) keeps its older, looser meaning.
  const auth: { supabase: AnyAuthedClient | null; user: ({ id: string } & AdminCandidate) | null } =
    await timing.time('auth', authedClientFromRequest(req).catch(() => ({ supabase: null, user: null })));
  const userId = auth.user?.id ?? null;
  /** The verified ACCOUNT, or null — a session id of "anonymous" is not an account (generationGate.isAnonymousUser). */
  const accountId = isAnonymousUser(userId) ? null : userId;
  // The Veo talking avatar runs for the admin until GG opens it (app/api/avatar/veo), so the prompt offers the Avatar
  // tool only to whoever that route lets through. Known at once when it is open to all or there is no account;
  // otherwise checked from here and read in the stream, by CONTEXT_DEADLINE_MS (a late answer offers no avatar).
  const veoAvatarKnown: boolean | null = veoAvatarPublic() ? true : accountId ? null : false;
  const veoAvatarPromise: Promise<boolean> =
    veoAvatarKnown !== null ? Promise.resolve(veoAvatarKnown) : timing.time('admin', isAdminIdentity(auth.user).catch(() => false));
  const guest = !accountId && !anonymousGenerationAllowed();
  if (guest && !guestChatEnabled()) {
    const loc = requestLocale(req);
    return json({ ...signInToGenerateBody(loc), message: SIGN_IN_TO_CHAT[loc] }, 401);
  }

  let body: ChatRequestBody;
  try {
    const parsed: unknown = await timing.time('body', req.json());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('body is not an object');
    body = parsed as ChatRequestBody;
  } catch (error) {
    reportError(error, { route: '/api/chat/gemini', stage: 'request-parse' });
    return json({ error: 'Invalid request body' }, 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) return json({ error: 'messages array is required' }, 400);

  // ⚠️ THE HISTORY IS RE-VALIDATED HERE, NOT TRUSTED. A result bubble (image/video/music) has empty text; sent as-is
  // it became a model turn with no parts, which plausibly broke every later turn of that thread, and the model never
  // knew what it had generated. The serializer drops empty turns, turns results into `[generated image: <url>]`,
  // merges same-role neighbours, keeps media bytes only in the last media turns and trims the oldest turns to a
  // budget — the same rules the browser applies, run again over an untrusted body.
  const wire = serializeHistory(wireToHistory(body.messages));
  const lastTurn = wire[wire.length - 1];
  if (!lastTurn || lastTurn.role !== 'user') {
    return json({ error: 'The conversation must end with a non-empty user message' }, 400);
  }

  const v2 = body.protocol === 2 || body.protocol === '2';
  // ⚠️ THE UI LOCALE IS A HINT, NOT A LOCK — AND NOT IGNORED. It used to win outright when sent, and without it the
  // latest message's dominant script decided, so "ok" answered a Georgian user in English. The user's own words win
  // when they say a language; an "ok" keeps the conversation's, and the UI's only when none was said (lib/chat/replyLocale).
  const uiLocale: Locale | null = isReplyLocale(body.language) ? body.language : null;
  const respLocale: Locale = resolveReplyLocale(localeView(wire), uiLocale);
  /** The route's own notices are UI text: the interface's language when the client said it, else the reply's. */
  const noticeLocale: Locale = uiLocale ?? respLocale;

  // Per-ACCOUNT daily cap, keyed on the verified user id (IP rotation cannot defeat it). A guest only gets here when
  // FILM_ALLOW_ANONYMOUS re-opened chat; they are capped per IP instead. Refused IN-STREAM, like the budget: an HTTP
  // 429 renders as a dead "something went wrong" turn in the chat shell, a notice tells the user what happened.
  if (guest) {
    // What a guest turn may carry is checked BEFORE the caps, so a refused file does not spend an allowance.
    const refusal = guestTurnRefusal(wire);
    // The per-IP allowance first, then the shared ceiling — so one IP that is already capped cannot keep spending
    // the global bucket on turns it would be refused anyway.
    const guestCapped =
      !refusal &&
      ((await timing.time('rate', checkRateLimit(req, guestChatDailyLimit()))) ??
        (await timing.time('rate', checkRateLimitByKey(GUEST_GLOBAL_KEY, guestChatGlobalDailyLimit()))));
    if (refusal || guestCapped) {
      if (guestCapped) console.warn('[/api/chat/gemini] guest chat cap reached');
      const why = refusal ?? 'cap';
      const message = GUEST_NOTICE[why][noticeLocale];
      return frameResponse([
        ...(v2 ? [] : [{ text: message }]),
        { error: { code: GUEST_REFUSAL_CODE[why], retryable: false, message, lang: noticeLocale } },
        'DONE',
      ]);
    }
  }
  const capped = guest
    ? null
    : accountId
      ? await timing.time('rate', checkRateLimitByKey(accountId, RATE_LIMITS.CHAT_USER))
      : await timing.time('rate', checkRateLimit(req, RATE_LIMITS.CHAT_USER));
  if (capped) {
    console.warn('[/api/chat/gemini] daily chat cap reached');
    const message = DAILY_CAP_NOTICE[noticeLocale];
    return frameResponse([
      ...(v2 ? [] : [{ text: message }]),
      { error: { code: 'daily_cap', retryable: false, message, lang: noticeLocale } },
      'DONE',
    ]);
  }

  // ── MODE. Resolved against the catalogue (unknown → Fast, legacy tier:'pro' → Pro) — the body names a mode, the
  //    chain is chosen here. Without an ACCOUNT (a guest, or FILM_ALLOW_ANONYMOUS) the turn is always Fast: the Pro
  //    allowance is per account, and a guest has none to draw on. The `{meta}` now says so (reason 'guest') instead of
  //    the menu's choice being dropped in silence.
  const askedMode: ChatModeId = resolveChatMode(body.mode, body.tier);
  const requestedMode: ChatModeId = accountId ? askedMode : 'fast';
  let mode: ChatModeId = requestedMode;
  let downgrade: Pick<ChatMeta, 'requestedMode' | 'reason' | 'resetAt'> | null =
    !accountId && askedMode !== 'fast' ? { requestedMode: askedMode, reason: 'guest' } : null;
  /** The Pro allowance was drawn on for THIS turn (and may have to be given back — see the stream's finally). */
  let proCharged = false;
  if (requestedMode === 'pro' && accountId) {
    // AFTER CHAT_USER, so a Pro turn draws on both buckets. A spent Pro allowance does not refuse the turn — like the
    // Gemini app, it is answered by Fast and the `{meta}` says so (the stored choice stays Pro; it resumes at reset).
    const proSpent = await timing.time('rate', checkRateLimitByKey(accountId, chatProUserLimit()));
    if (proSpent) {
      mode = 'fast';
      const resetAt = resetAtOf(proSpent);
      downgrade = { requestedMode: 'pro', reason: 'pro_cap', ...(resetAt ? { resetAt } : {}) };
      console.warn('[/api/chat/gemini] daily Pro allowance spent — answering with Fast');
    } else {
      proCharged = true;
    }
  }
  const chain = chatModelChain(mode);
  // Built-ins and "no persona" resolve to exactly the old settings (0.7 / 0.95 / 40 / 4096 / google_search), then the
  // mode sets thinking (applyChatMode); a custom persona is re-sanitized and clamped here on every turn — it arrives
  // from localStorage via the body.
  const profile = resolveAgentProfile({
    personaId: typeof body.personaId === 'string' ? body.personaId : null,
    customPersona: body.customPersona,
  });
  // A guest's turn is grounded too, like the Gemini app (CHAT_GUEST_SEARCH=0 turns it off — lib/chat/guestChat), and the
  // prompt follows the config: it must not promise a search the config will not run, nor deny one it will.
  const groundingOn = profile.googleSearch && (!guest || guestSearchEnabled());
  const latestUserText = stripHistoryMarkers(textOfWire(lastTurn)).trim();
  // URL reading only for a turn that carries a link, and only behind GEMINI_CHAT_URL_CONTEXT=1
  // (lib/chat/urlContext.ts) — and never for a guest: a fetched page multiplies the input tokens, the same reason
  // grounding is off for them (lib/chat/guestChat). The prompt is told either way, so a turn without the tool says it
  // cannot open links instead of "summarizing" a page it never read.
  const urlContextOn = !guest && wantsUrlContext(latestUserText);
  const promptStarted = performance.now();
  const promptFor = (veoAvatar: boolean) =>
    buildPlatformPrompt({ locale: respLocale, googleSearch: groundingOn, urlContext: urlContextOn, veoAvatar });
  // ⚠️ THE ESTIMATE NEVER COMES IN UNDER THE TURN. While the avatar check is still out, the budget is priced on the
  // longer of the two prompts the turn can get (the one offering the avatar is a line longer); the turn gets its own
  // prompt once the check is in. Known at once, the prompt is the turn's own from the start.
  const estimatePrompt =
    veoAvatarKnown !== null ? promptFor(veoAvatarKnown) : [promptFor(true), promptFor(false)].reduce((a, b) => (b.length > a.length ? b : a));
  const modelMessages = toModelMessages(wire);
  const historyChars = wire.reduce((n, m) => n + estimateWireChars(m), 0);
  timing.add('prompt', performance.now() - promptStarted);

  // Started now, awaited inside the stream: their latencies overlap each other and the Response is returned at once.
  // The budget estimate covers the platform prompt and the history text, not just the latest message, and is priced
  // at the mode's PRIMARY model — a Pro turn pre-checked at the flat Flash rate looked cheaper than it is.
  const budgetPromise = timing.time(
    'budget',
    chatBudgetRefusal(`${estimatePrompt}\n${wire.map(textOfWire).join('\n')}`, chain[0]).catch(() => GUARD_UNAVAILABLE),
  );
  // Profile facts and memory, then read in the stream by CONTEXT_DEADLINE_MS from now.
  const contextStarted = performance.now();
  const profilePromise: Promise<string | null> =
    auth.supabase && accountId ? timing.time('profile', buildProfileFactsPreamble(auth.supabase, accountId, latestUserText)) : Promise.resolve(null);
  const memoryPromise: Promise<string | null> =
    auth.supabase && accountId ? timing.time('memory', buildMemoryPreamble(auth.supabase, accountId, latestUserText, timing)) : Promise.resolve(null);

  const abort = new AbortController();
  const onClientGone = () => abort.abort();
  req.signal?.addEventListener?.('abort', onClientGone, { once: true });
  let open = true;
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  /** True once TURN_DEADLINE_MS aborted the model call — distinguishes "too slow" from "the user left". */
  let deadlineHit = false;
  const stopTimers = () => {
    if (heartbeat !== undefined) clearInterval(heartbeat);
    if (deadline !== undefined) clearTimeout(deadline);
    heartbeat = deadline = undefined;
  };

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      /** A comment line between frames; a failed enqueue means the consumer is gone, which the frame writes handle. */
      const keepAlive = (): void => {
        if (!open) return stopTimers();
        try {
          controller.enqueue(encoder.encode(SSE_KEEPALIVE));
        } catch {
          // ⚠️ THE BROWSER LEFT WHILE THE MODEL WAS STILL THINKING. Only the heartbeat writes in that phase, and it
          // used to stop its timer and nothing else — the model call ran on (and was billed) for nobody until it
          // produced a frame to fail on. A failed enqueue now ends the turn exactly as a cancel() does.
          open = false;
          stopTimers();
          abort.abort();
        }
      };
      // The first bytes go out NOW (budget, memory and the model's thinking all come before the first frame), then
      // every HEARTBEAT_MS until the finally block — see SSE_KEEPALIVE.
      keepAlive();
      heartbeat = setInterval(keepAlive, HEARTBEAT_MS);
      deadline = setTimeout(() => {
        deadlineHit = true;
        abort.abort();
      }, TURN_DEADLINE_MS);
      /** Throws when the consumer is gone — chatStream reads that as "stop, nobody is listening". */
      const write = (frame: ChatFrame | 'DONE'): void => {
        if (!open) throw new Error('chat stream closed');
        try {
          controller.enqueue(encoder.encode(encodeFrame(frame)));
        } catch (err) {
          open = false;
          abort.abort();
          throw err;
        }
      };
      const tryWrite = (frame: ChatFrame | 'DONE'): void => {
        try {
          write(frame);
        } catch {
          /* consumer gone */
        }
      };
      /** A failure the user must see: the legacy `{text}` notice (see the header) unless text already streamed. */
      const notice = (code: ChatErrorCode, opts: { afterText: boolean; retryable?: boolean; message?: string }): void => {
        const message = opts.message ?? NOTICE[code][noticeLocale];
        if (!opts.afterText && !v2) tryWrite({ text: message });
        tryWrite({ error: { code, retryable: opts.retryable ?? RETRYABLE_BY_DEFAULT.has(code), message, lang: noticeLocale } });
      };
      const bookings: Array<Promise<void>> = [];
      /**
       * Every answer's `{meta}`: which mode answered, whether that was the mode's primary model, and — on a Pro-cap
       * downgrade — what was asked for, why, and when it resets. `fallback` is chatStream's per-attempt flag (a
       * rotation past the chain's first model; set by attempt, not by comparing ids, so an alias id is not a false
       * positive) made explicit, and always true for the non-Google fallback.
       */
      const decorate = (frame: ChatFrame): ChatFrame => {
        if (!('meta' in frame)) return frame;
        const fallback = frame.meta.fallback === true || frame.meta.provider !== 'gemini';
        return { meta: { ...frame.meta, mode, ...downgrade, fallback } };
      };

      try {
        // ── BUDGET GATE (Master Task §2.1.1) — in-stream, so a refusal is a normal assistant message, not a dead
        //    turn. Fails CLOSED on a guard fault (`guard_unavailable`, worded "try again shortly").
        const budgetRefused = await budgetPromise;
        if (budgetRefused) {
          tryWrite({ meta: { provider: 'budget', model: 'none' } });
          // Which limit, and when it lifts (2026-10-16: "try again later" left the owner guessing until midnight UTC).
          notice('budget', { afterText: false, retryable: false, message: budgetRefusalMessage(noticeLocale, budgetRefused) });
          return;
        }

        // ── CONTEXT, FAIL-SOFT: what is in by CONTEXT_DEADLINE_MS (or by now, when the budget took longer). Left out
        //    otherwise: no profile facts, no memory, no avatar offer this turn.
        const left = contextStarted + CONTEXT_DEADLINE_MS - performance.now();
        const [profilePreamble, memoryPreamble, veoAvatar] = await Promise.all([
          valueWithin(profilePromise, left, null),
          valueWithin(memoryPromise, left, null),
          valueWithin(veoAvatarPromise, left, false),
        ]);
        // The browser left while the turn waited (Stop, a closed tab): the model is never asked.
        if (abort.signal.aborted && !deadlineHit) return;
        const turnPromptStarted = performance.now();
        const platformPrompt = veoAvatarKnown !== null ? estimatePrompt : promptFor(veoAvatar);
        timing.add('prompt', performance.now() - turnPromptStarted);
        const platformSystem = [platformPrompt, profilePreamble, memoryPreamble].filter(Boolean).join('\n\n');
        // The persona block is APPENDED by the profile, so the platform rules keep precedence over what is, for a
        // custom persona, untrusted user text.
        const modeConfig = applyChatMode(toGeminiChatConfig(profile, platformSystem), mode);
        const config: GeminiChatConfig = guest
          ? {
              ...modeConfig,
              googleSearch: groundingOn,
              maxOutputTokens: Math.min(modeConfig.maxOutputTokens, GUEST_MAX_OUTPUT_TOKENS),
            }
          : modeConfig;
        if (urlContextOn) config.urlContext = true;
        const inputChars = platformSystem.length + historyChars;

        // The first model text of the turn, for the trace: `model` from the first call's start, `ttft` from the request's.
        const modelStarted = performance.now();
        let firstText = false;
        /** One chain, streamed to the browser; everything Google billed for it is booked. */
        const runChain = async (models: readonly string[], cfg: GeminiChatConfig, retryTransientOnce: boolean): Promise<StreamGeminiChatResult> => {
          const r = await streamGeminiChat({
            apiKey: resolveGeminiKey(),
            models: [...models],
            messages: modelMessages,
            config: cfg,
            abortSignal: abort.signal,
            retryTransientOnce,
            // chatStream ends every failure with an `{error}` frame worded in English. It is dropped here and re-sent
            // below, localized — or not at all when a fallback answers instead.
            onFrame: (frame) => {
              if ('error' in frame) return;
              write(decorate(frame));
              if (!firstText && 'text' in frame && frame.text) {
                firstText = true;
                timing.add('model', performance.now() - modelStarted);
                timing.since('ttft');
              }
            },
          });
          // ⚠️ BOOK WHAT GOOGLE BILLED, NOT JUST WHAT SUCCEEDED. A turn that failed mid-answer, was aborted by the
          // user, or came back empty after thinking still consumed tokens; booking only clean successes (as the old
          // route did, by character count, with no user) under-counted the platform budget.
          if (r.model && (hasTokens(r.usage) || r.text.length > 0)) {
            bookings.push(
              bookChatUsage({
                model: r.model,
                ...r.usage,
                chars: r.text.length,
                inputChars,
                userId: accountId,
                groundingQueries: r.groundingQueries ?? 0,
              }),
            );
          }
          // …and every EARLIER attempt Google billed before the rotation (a text-less 200 — thinking ate the budget —
          // still consumed tokens and search queries), each against the model that consumed it.
          for (const a of unbookedAttempts(r)) {
            bookings.push(bookChatUsage({ model: a.model, ...a.usage, inputChars, userId: accountId, groundingQueries: a.groundingQueries ?? 0 }));
          }
          return r;
        };

        // A Pro turn retries ONE transient failure (429 / 503) of its single preview model before giving up on it.
        let result = await runChain(chain, config, mode === 'pro');

        if (mode === 'pro' && !result.ok && result.text.length === 0) {
          const userLeft = abort.signal.aborted && !deadlineHit;
          // ⚠️ AN ALLOWANCE IS FOR AN ANSWER. Pro's allowance is drawn up front (two tabs cannot both slip under the
          // cap), so a Pro turn that never produced a word used to cost one of the day's few Pro turns all the same.
          // Given back when Pro failed — not when the user stopped it (the thinking was billed and is theirs).
          if (proCharged && accountId && !userLeft) {
            proCharged = false;
            bookings.push(refundRateLimitByKey(accountId, chatProUserLimit()));
          }
          // ⚠️ A BUSY PRO MINUTE USED TO FAIL THE TURN. Pro's chain is one preview model; after chatStream's one
          // same-model retry, a failure that is about the MODEL (busy, overloaded, missing, the network) hands the turn
          // to Fast — like the Gemini app — and the `{meta}` says so ('pro_busy'). Not a safety stop (another model
          // answering a blocked prompt is a filter bypass), not our account or the request, not after the deadline.
          if (!abort.signal.aborted && result.error && PRO_FALLBACK_ON.has(result.error.code)) {
            console.warn(`[/api/chat/gemini] Pro failed (${result.error.code}) — answering with Fast`);
            mode = 'fast';
            downgrade = { requestedMode: 'pro', reason: 'pro_busy' };
            const fastConfig: GeminiChatConfig = {
              ...applyChatMode(toGeminiChatConfig(profile, platformSystem), 'fast'),
              ...(urlContextOn ? { urlContext: true } : {}),
            };
            result = await runChain(chatModelChain('fast'), fastConfig, false);
          }
        }

        if (deadlineHit && !result.ok) {
          // Too slow, not gone: the browser is still listening, so say so (retryable) instead of closing in silence.
          reportError(new Error('Gemini chat turn hit the server deadline'), {
            route: 'chat.gemini',
            stage: 'turn-deadline',
            mode,
            partial: result.text.length > 0,
            attempts: result.attempts.map((a) => `${a.model}:${a.code ?? 'ok'}`).join(','),
          });
          notice('unavailable', { afterText: result.text.length > 0, retryable: true });
          return;
        }
        if (abort.signal.aborted || result.ok) return;

        const failure = result.error ?? { code: 'unavailable' as const, retryable: true, message: 'no result', status: undefined };
        const streamed = result.text.length > 0;
        if (failure.code !== 'safety') {
          // The diagnostic is key-redacted by chatStream; one Sentry event says WHY (key, prepay, quota, model).
          reportError(new Error(`Gemini chat failed: ${failure.code}`), {
            route: 'chat.gemini',
            stage: 'gemini-failed',
            code: failure.code,
            status: failure.status,
            diagnostic: failure.message,
            attempts: result.attempts.map((a) => `${a.model}:${a.code ?? 'ok'}`).join(','),
            partial: streamed,
            mode,
          });
        }

        notice(failure.code, { afterText: streamed, retryable: failure.retryable });
      } catch (err) {
        reportError(err, { route: '/api/chat/gemini', stage: 'stream' });
        if (!abort.signal.aborted) notice('unavailable', { afterText: false });
      } finally {
        stopTimers();
        // A traced turn's spans, as one SSE comment line (dropped by every SSE parser) just before [DONE].
        const spans = timing.sseComment();
        if (spans && open) {
          try {
            controller.enqueue(encoder.encode(spans));
          } catch {
            /* consumer gone */
          }
        }
        tryWrite('DONE');
        // ⚠️ THE BOOKING IS AWAITED BEFORE THE STREAM CLOSES. Once the response ends, a serverless function can be
        // frozen with the insert still in flight, and a lost booking is spend the budget guard never sees. [DONE] is
        // already out, so a client that stops at [DONE] is not delayed; the wait is capped so a hung write can't
        // hold the connection open.
        if (bookings.length) await settleWithin(Promise.allSettled(bookings), BOOKING_WAIT_MS);
        req.signal?.removeEventListener?.('abort', onClientGone);
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed by a cancelled consumer */
        }
      }
    },
    cancel() {
      open = false;
      stopTimers();
      abort.abort();
    },
  });

  return new Response(readable, { headers: { ...SSE_HEADERS, ...timing.headers('respond') } });
}
