/**
 * POST /api/chat/gemini — the product chat (OmniStudio `streamChat`): one streamed Gemini turn per request.
 *
 * Order of work, cheapest refusal first:
 *   1. per-IP burst limit (READ) and the 16 MB body cap — before any network call;
 *   2. a verified session (`mustSignInToChat` → 401 in the generationGate body shape);
 *   3. the history re-validated server-side through lib/chat/historySerializer (400 when nothing usable is left);
 *   4. the per-user daily cap (CHAT_USER, keyed on the user id) — refused IN-STREAM;
 *   5. the platform budget pre-check (BillingGuard, fails open) — refused IN-STREAM;
 *   6. platform prompt (lib/chat/platformPrompt) + the user's profile facts + vector memory, then the agent profile
 *      (lib/agents/profile) turns persona + prompt into the Gemini config;
 *   7. lib/ai/google/chatStream streams the turn across chatModelChain(tier) with typed errors;
 *   8. the Anthropic fallback ONLY when AI_GOOGLE_ONLY is off (default: Google only);
 *   9. real token usage booked with the user id, before the stream closes.
 *
 * WIRE (lib/chat/sse.ts — one encoder here, one parser in the browser):
 *   success:              {meta} {text}… [{sources}] [{usage}] [DONE]
 *   failure, no text:     [{usage}] {text: notice} {error} [DONE]
 *   failure after text:   {meta} {text}… {meta partial:true} [{sources}] [{usage}] {error} [DONE]
 *   budget refusal:       {meta provider:'budget'} {text: BUDGET_EXHAUSTED_MESSAGE} {error budget} [DONE]
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
import { getUserProfileFacts, buildProfilePreamble, extractProfileFacts, saveUserProfileFacts } from '@/lib/chat/userMemory';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { detectReplyLocale } from '@/lib/chat/replyLocale';
import { chatBudgetAllows, bookChatUsage, BUDGET_EXHAUSTED_MESSAGE } from '@/lib/services/billing/chatBudget';
import { mustSignInToChat, signInToGenerateBody } from '@/lib/auth/generationGate';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { chatModelChain, type ChatTier } from '@/lib/ai/google/models';
import { isAiGoogleOnly } from '@/lib/ai/google/policy';
import { streamGeminiChat, unbookedAttempts, type GeminiChatConfig } from '@/lib/ai/google/chatStream';
import { encodeFrame, type ChatErrorCode, type ChatFrame } from '@/lib/chat/sse';
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

/** Derived from the helper's own return type — lib/supabase/server does not export its client alias. */
type AnyAuthedClient = Awaited<ReturnType<typeof authedClientFromRequest>>['supabase'];

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Vision (multimodal) requests can take significantly longer for large photos. 120 s gives Gemini room to analyse
// and start streaming before any function timeout interrupts the connection.
export const maxDuration = 120;

type Locale = 'ka' | 'en' | 'ru';

/**
 * Body size cap. Pure-text chat fits easily under 200 KB; multimodal requests carry base64 (≈1.33× the raw bytes),
 * so 16 MB accepts a ~12 MB photo while still rejecting obvious abuse. The Paperclip picker caps the raw file at 8 MB.
 */
const MAX_BODY_BYTES = 16_000_000;

/** How long the stream may stay open after [DONE] waiting for the usage booking (see the finally block). */
const BOOKING_WAIT_MS = 1_500;

/** The Anthropic model the legacy fallback uses when AI_GOOGLE_ONLY is off — unchanged from the old route. */
const FALLBACK_MODEL_ID = 'claude-haiku-4-5-20251001';
const FALLBACK_MODEL_LABEL = 'claude-haiku-4-5';

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
  budget: { ka: BUDGET_EXHAUSTED_MESSAGE, en: BUDGET_EXHAUSTED_MESSAGE, ru: BUDGET_EXHAUSTED_MESSAGE },
  auth_required: SIGN_IN_TO_CHAT,
};

/** Mirrors lib/chat/sse.ts: codes worth a retry button when nothing more specific is known. */
const RETRYABLE_BY_DEFAULT: ReadonlySet<ChatErrorCode> = new Set<ChatErrorCode>(['rate_limited', 'network', 'unavailable']);

// ─── Request helpers ─────────────────────────────────────────────────────────

interface ChatRequestBody {
  messages?: unknown;
  language?: unknown;
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
async function buildMemoryPreamble(supabase: AnyAuthedClient, userId: string, userText: string): Promise<string | null> {
  try {
    if (!userText) return null;
    const embedding = await embed(userText);
    if (!embedding) return null;
    const { data, error } = await supabase.rpc('match_memories', { query_embedding: embedding, match_count: 5 });
    if (error) {
      reportError(error, { route: '/api/chat/gemini', stage: 'memory-rpc', userId });
      return null;
    }
    const rows = (data ?? []) as Array<{ id: string; fact: string; similarity: number }>;
    if (!rows.length) return null;
    const bullets = rows.map((r) => `- ${String(r.fact ?? '').replace(/\s+/g, ' ').trim()}`).join('\n');
    // Facts the user explicitly stored in earlier sessions: trusted personal context — use them naturally,
    // don't disclaim "I don't have access to personal information".
    return [
      'KNOWN FACTS ABOUT THIS USER (from their personal memory store —',
      'they told you these themselves in earlier sessions; use them naturally',
      "and don't disclaim that you don't know personal info):",
      bullets,
    ].join('\n');
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

// ─── Anthropic fallback (AI_GOOGLE_ONLY=0 only) ──────────────────────────────

interface FallbackOutcome {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

/**
 * The legacy multi-vendor fallback, kept ONLY behind the AI_GOOGLE_ONLY kill switch. Text-only (the old route did
 * the same: Haiku got "[image attached]" in place of media). Loaded lazily so a Google-only deployment never even
 * imports the Anthropic SDK.
 *
 * ⚠️ `fullStream`, not `textStream`, for the same reason as chatStream.ts: `textStream` swallows the error part.
 * ⚠️ `onError: () => {}` — the SDK default console.error()s the whole request, i.e. the user's conversation.
 */
async function streamAnthropicFallback(input: {
  config: GeminiChatConfig;
  wire: readonly WireMessage[];
  signal: AbortSignal;
  write: (frame: ChatFrame) => void;
}): Promise<FallbackOutcome> {
  const out: FallbackOutcome = { text: '' };
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!apiKey) return out;
  try {
    const [{ streamText }, { createAnthropic }] = await Promise.all([import('ai'), import('@ai-sdk/anthropic')]);
    const anthropic = createAnthropic({ apiKey });
    const messages: ModelMessage[] = input.wire.map((m): ModelMessage => {
      const text = textOfWire(m) || '[attachment]';
      return m.role === 'assistant' ? { role: 'assistant', content: text } : { role: 'user', content: text };
    });
    const result = streamText({
      model: anthropic(FALLBACK_MODEL_ID),
      system: input.config.system,
      messages,
      temperature: Math.min(1, input.config.temperature),
      maxOutputTokens: input.config.maxOutputTokens,
      maxRetries: 1,
      abortSignal: input.signal,
      onError: () => {},
    });
    for await (const part of result.fullStream) {
      if (input.signal.aborted) break;
      if (part.type === 'text-delta') {
        if (!part.text) continue;
        if (!out.text) input.write({ meta: { provider: 'anthropic', model: FALLBACK_MODEL_LABEL } });
        input.write({ text: part.text });
        out.text += part.text;
      } else if (part.type === 'finish') {
        const u = part.totalUsage;
        const usage = { inputTokens: u?.inputTokens, outputTokens: u?.outputTokens, totalTokens: u?.totalTokens };
        if (hasTokens(usage)) out.usage = usage;
      } else if (part.type === 'error') {
        console.warn('[/api/chat/gemini] Anthropic fallback stream error');
        break;
      }
    }
    if (out.usage) input.write({ usage: { model: FALLBACK_MODEL_LABEL, ...out.usage } });
  } catch (err) {
    console.warn('[/api/chat/gemini] Anthropic fallback failed:', err instanceof Error ? err.name : 'error');
  }
  return out;
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Cheap per-IP burst guard, before any network call (auth is a Supabase round-trip).
  const ipLimited = await checkRateLimit(req, RATE_LIMITS.READ);
  if (ipLimited) return ipLimited;

  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'Request body too large (max 16 MB)' }, 413);

  // ⚠️ SIGN-IN, SERVER-SIDE. This route used to answer anyone: the studio stopped guests in the browser only, so the
  // one anonymous caller left was a script spending our Gemini balance (plus grounding) at 100 turns/min per IP.
  // A failed session lookup is treated as anonymous — fail closed. FILM_ALLOW_ANONYMOUS=1 re-opens it for demos.
  const auth: { supabase: AnyAuthedClient | null; user: { id: string } | null } =
    await authedClientFromRequest(req).catch(() => ({ supabase: null, user: null }));
  const userId = auth.user?.id ?? null;
  if (mustSignInToChat(userId)) {
    const loc = requestLocale(req);
    return json({ ...signInToGenerateBody(loc), message: SIGN_IN_TO_CHAT[loc] }, 401);
  }

  let body: ChatRequestBody;
  try {
    const parsed: unknown = await req.json();
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
  // An explicit UI selection wins; otherwise lock the reply to the latest message's dominant script (prose only).
  const explicitLang = body.language === 'en' || body.language === 'ru' || body.language === 'ka' ? body.language : null;
  const respLocale: Locale = explicitLang ?? detectReplyLocale(localeView(wire));

  // Per-ACCOUNT daily cap, keyed on the verified user id (IP rotation cannot defeat it). A guest only gets here when
  // FILM_ALLOW_ANONYMOUS re-opened chat; they are capped per IP instead. Refused IN-STREAM, like the budget: an HTTP
  // 429 renders as a dead "something went wrong" turn in the chat shell, a notice tells the user what happened.
  const capped = userId
    ? await checkRateLimitByKey(userId, RATE_LIMITS.CHAT_USER)
    : await checkRateLimit(req, RATE_LIMITS.CHAT_USER);
  if (capped) {
    console.warn('[/api/chat/gemini] daily chat cap reached');
    const message = DAILY_CAP_NOTICE[respLocale];
    return frameResponse([
      ...(v2 ? [] : [{ text: message }]),
      { error: { code: 'rate_limited', retryable: false, message } },
      'DONE',
    ]);
  }

  const tier: ChatTier = body.tier === 'pro' ? 'pro' : 'standard';
  // Built-ins and "no persona" resolve to exactly the old settings (0.7 / 0.95 / 40 / 4096 / google_search); a
  // custom persona is re-sanitized and clamped here on every turn — it arrives from localStorage via the body.
  const profile = resolveAgentProfile({
    personaId: typeof body.personaId === 'string' ? body.personaId : null,
    customPersona: body.customPersona,
  });
  const platformPrompt = buildPlatformPrompt({ locale: respLocale, googleSearch: profile.googleSearch });
  const modelMessages = toModelMessages(wire);
  const latestUserText = stripHistoryMarkers(textOfWire(lastTurn)).trim();
  const historyChars = wire.reduce((n, m) => n + estimateWireChars(m), 0);

  // Started now, awaited inside the stream: their latencies overlap each other and the Response is returned at once.
  // The budget estimate covers the platform prompt and the history text, not just the latest message.
  const budgetPromise = chatBudgetAllows(`${platformPrompt}\n${wire.map(textOfWire).join('\n')}`).catch(() => true);
  const preamblesPromise: Promise<[string | null, string | null]> =
    auth.supabase && userId
      ? Promise.all([
          buildProfileFactsPreamble(auth.supabase, userId, latestUserText),
          buildMemoryPreamble(auth.supabase, userId, latestUserText),
        ])
      : Promise.resolve([null, null]);

  const abort = new AbortController();
  const onClientGone = () => abort.abort();
  req.signal?.addEventListener?.('abort', onClientGone, { once: true });
  let open = true;
  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
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
        const message = opts.message ?? NOTICE[code][respLocale];
        if (!opts.afterText && !v2) tryWrite({ text: message });
        tryWrite({ error: { code, retryable: opts.retryable ?? RETRYABLE_BY_DEFAULT.has(code), message } });
      };
      const bookings: Array<Promise<void>> = [];

      try {
        // ── BUDGET GATE (Master Task §2.1.1) — in-stream, so a refusal is a normal assistant message, not a dead
        //    turn. Fails OPEN on a guard fault.
        if (!(await budgetPromise)) {
          tryWrite({ meta: { provider: 'budget', model: 'none' } });
          notice('budget', { afterText: false, retryable: false, message: BUDGET_EXHAUSTED_MESSAGE });
          return;
        }

        const [profilePreamble, memoryPreamble] = await preamblesPromise;
        const platformSystem = [platformPrompt, profilePreamble, memoryPreamble].filter(Boolean).join('\n\n');
        // The persona block is APPENDED by the profile, so the platform rules keep precedence over what is, for a
        // custom persona, untrusted user text.
        const config = toGeminiChatConfig(profile, platformSystem);
        const inputChars = platformSystem.length + historyChars;

        const result = await streamGeminiChat({
          apiKey: resolveGeminiKey(),
          models: chatModelChain(tier),
          messages: modelMessages,
          config,
          abortSignal: abort.signal,
          // chatStream ends every failure with an `{error}` frame worded in English. It is dropped here and re-sent
          // below, localized — or not at all when the fallback answers instead.
          onFrame: (frame) => {
            if ('error' in frame) return;
            write(frame);
          },
        });

        // ⚠️ BOOK WHAT GOOGLE BILLED, NOT JUST WHAT SUCCEEDED. A turn that failed mid-answer, was aborted by the
        // user, or came back empty after thinking still consumed tokens; booking only clean successes (as the old
        // route did, by character count, with no user) under-counted the platform budget.
        if (result.model && (hasTokens(result.usage) || result.text.length > 0)) {
          bookings.push(
            bookChatUsage({
              model: result.model,
              ...result.usage,
              chars: result.text.length,
              inputChars,
              userId,
              groundingQueries: result.groundingQueries ?? 0,
            }),
          );
        }
        // …and every EARLIER attempt Google billed before the rotation (a text-less 200 — thinking ate the budget —
        // still consumed tokens and search queries), each against the model that consumed it.
        for (const a of unbookedAttempts(result)) {
          bookings.push(bookChatUsage({ model: a.model, ...a.usage, inputChars, userId, groundingQueries: a.groundingQueries ?? 0 }));
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
          });
        }

        // ⚠️ A SAFETY STOP IS NEVER RE-ASKED ELSEWHERE. Another vendor answering a prompt Google blocked is a filter
        // bypass, not resilience. And once text has streamed, a second answer would be appended to the first.
        if (!streamed && failure.code !== 'safety' && !isAiGoogleOnly()) {
          const fb = await streamAnthropicFallback({ config, wire, signal: abort.signal, write });
          if (fb.text || fb.usage) {
            bookings.push(
              bookChatUsage({
                model: FALLBACK_MODEL_LABEL,
                ...fb.usage,
                chars: fb.text.length,
                inputChars,
                userId,
              }),
            );
          }
          if (fb.text || abort.signal.aborted) return;
        }

        notice(failure.code, { afterText: streamed, retryable: failure.retryable });
      } catch (err) {
        reportError(err, { route: '/api/chat/gemini', stage: 'stream' });
        if (!abort.signal.aborted) notice('unavailable', { afterText: false });
      } finally {
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
      abort.abort();
    },
  });

  return new Response(readable, { headers: SSE_HEADERS });
}
