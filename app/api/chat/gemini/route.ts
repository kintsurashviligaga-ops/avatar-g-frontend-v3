import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { AGENT_G_SYSTEM_PROMPT } from '@/lib/agent-g-orchestrator';
import { platformKnowledge } from '@/lib/chat/platformContext';
import { NextRequest } from 'next/server';
import { reportError } from '@/lib/observability/report-error';
import { authedClientFromRequest } from '@/lib/supabase/server';

/** Derived from the helper's own return type — lib/supabase/server does not export its client alias. */
type AnyAuthedClient = Awaited<ReturnType<typeof authedClientFromRequest>>['supabase'];
import { embed } from '@/lib/memory/embed';
import { getUserProfileFacts, buildProfilePreamble, extractProfileFacts, saveUserProfileFacts } from '@/lib/chat/userMemory';
import { classifyGeminiMessage, logGeminiState } from '@/lib/orchestrator/gemini-guard';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { detectReplyLocale } from '@/lib/chat/replyLocale';
import { chatBudgetAllows, bookChatUsage, BUDGET_EXHAUSTED_MESSAGE } from '@/lib/services/billing/chatBudget';
import { resolvePersona, applySystemPersona, type CustomPersonaInput } from '@/lib/services/personas/personas';


export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Vision (multimodal) requests can take significantly longer for large
// photos. 120 s gives Gemini room to analyse + start streaming before
// any function timeout interrupts the connection (the "Stream idle
// timeout" symptom the user was seeing).
export const maxDuration = 120;

// ─── 1. SYSTEM PROMPT ────────────────────────────────────────────────────────
// Agent G persona: expert creative director, Georgian-first, Markdown-rich.
// Refined for professional tone consistent with the MyAvatar.ge brand voice.

const SYSTEM_PROMPT = `${AGENT_G_SYSTEM_PROMPT}

CHAT INTERFACE — OPERATING RULES:
- Language: reply in the user's exact language. Default to Georgian (ქართული) when the language is ambiguous or mixed.
- GENERAL CAPABILITY (most important): you are a fully capable, general-purpose AI assistant. Answer ANY question the user asks — general knowledge, science, history, mathematics, programming, writing, translation, business, cooking, health, philosophy, casual conversation, anything — accurately and completely. NEVER refuse, deflect, or say a topic is "outside the platform / out of scope". There is NO such restriction. The MyAvatar.ge creative services are an ADDITIONAL power you offer on top of being a complete assistant — they are never a limit on what you may discuss or answer.
- LEGITIMATE MEDIA DISCOVERY (do NOT emit a false copyright/ethics bail): freely help users find and discuss films, series, books and music — plot and cast summaries, reviews, recommendations, and WHERE a title is legally available to watch or buy (streaming services, cinemas, official stores). A question like "where can I watch ციდან სამ მეტრზე / Three Steps Above Heaven" is normal, legal discovery — answer it directly with the legitimate options; never refuse it or open with a copyright disclaimer. (You still never help with piracy or provide illegal download links — pointing users to the legal way to watch IS the help to give.)
- LENGTH — match the answer to the question. A simple, factual, or casual question gets a tight, direct reply (often 1–3 sentences, no headers). Reserve section headers, long lists, and multi-part structure for genuinely complex or explicitly detailed requests (a plan, an article, code, a design brief). Answer the actual question first; never pad with filler, restated preambles, or generic disclaimers.
- Formatting: use rich Markdown WHEN the length warrants it — ## section headers, **bold** for emphasis, bullet lists for options, numbered steps for instructions, \`\`\`language code blocks for any code. A one-line answer needs none of this.
- Visual analysis: when you receive an image or file (uploaded or generated), analyse it fully and answer whatever the user asks about it — describe it, extract text, explain it, critique it, or use it as context for the rest of the request.
- Tone: knowledgeable, warm, and genuinely helpful — a world-class advisor who also happens to be a creative director. Be specific and precise; never generic, never evasive, never padded.
- Service routing (ONLY when clearly relevant): if (and only if) the user actually wants to GENERATE an image, video, music or avatar, briefly say which service handles it. For every other request — including general questions — just answer directly and helpfully without mentioning services.
- NEVER emit a machine-routing payload. Do NOT reply with a JSON object, a \`\`\`json code block, or any structured directive like { "service": "image", "prompt": "…" } — the platform routes generation itself; your job is only natural conversational language. Emitting such a block is a bug: describe what you'll create in plain words, never as code/JSON.
- PLATFORM KNOWLEDGE (Master Contract V1 — answer accurately in the user's language when asked who you are / what MyAvatar.ge is / what it costs; keep it natural, don't dump the whole list unprompted):
  • ვინაობა: "მე ვარ Agent G, MyAvatar.ge-ს ინტელექტუალური ასისტენტი."
  • სურათების სტუდია — აგენერირებს მაღალი ხარისხის ფოტოებს და ქმნის სცენარზე დაფუძნებულ სთორიბორდებს (Storyboard).
  • ვიდეოების სტუდია — ქმნის კინემატოგრაფიულ, უმაღლესი ხარისხის 30/60-წამიან ვიდეოებს, მუსიკალურ კლიპებს, დოკუმენტურ კადრებს და რეალისტურ Avatar Swap-ებს (მთავარი ვიდეო-ძრავა: Runway).
  • მუსიკის სტუდია — ქმნის მუსიკალურ ტრეკებსა და სიმღერებს, სადაც მომხმარებელს შეუძლია ჩაწეროს საკუთარი ხმა და დაადოს იგი პროფესიონალურ ბიტებს.
  • ფასები (USD): Starter — $15/თვე (4 ვიდეო, 10 მუსიკა, 30 სთორიბორდ სურათი, 150 კრედიტი); Pro Creator — $99/თვე (35 ვიდეო, 1200 კრედიტი, სრული Agent G წვდომა); Studio Annual — $299/წელი (120 ვიდეო, 4500 კრედიტი, ულიმიტო სწრაფი რიგი, VIP მხარდაჭერა).
- FULL SERVICE + PROVIDER MASTERY — you are the platform's expert orchestrator. Know every service and the REAL engine behind it, and when a user asks how you generate something, explain the process accurately and name the right engine:
${platformKnowledge('en')}
- You are Agent G, powered by Google Gemini on the MyAvatar.ge platform.`;

// ─── 2. SECURITY GUARD ───────────────────────────────────────────────────────

// Body size cap. Pure-text chat fits easily under 200 KB; multimodal
// vision requests carry a base64-encoded image (≈1.33× the raw bytes)
// so we raise the cap to 16 MB to comfortably accept a ~12 MB photo
// while still rejecting obvious abuse. The Paperclip picker caps the
// raw file at 8 MB upstream.
const MAX_BODY_BYTES = 16_000_000;

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  return createGoogleGenerativeAI({ apiKey });
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  return createAnthropic({ apiKey });
}

// ─── 3. TYPES ────────────────────────────────────────────────────────────────

type IncomingPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string; mimeType?: string }
  // PRIORITY 2 — native multimodal: audio / video / pdf documents. The client
  // sends { type:'file', data:(dataURL|base64|https), mimeType } and Gemini 1.5/2.5
  // Pro ingests it via inline_data, understanding the audio + video natively.
  | { type: 'file'; data: string; mimeType: string };

type IncomingMessage = {
  role: string;
  content: string | IncomingPart[];
};

// ai SDK accepts base64 strings or URL objects for images; `file` parts carry an
// explicit mimeType so the Google provider routes audio/video as inline_data.
type ImageContent = { type: 'image'; image: string | URL };
type FileContent = { type: 'file'; data: string | URL; mediaType: string };
type TextContent = { type: 'text'; text: string };

type ModelMessage =
  | { role: 'user' | 'assistant'; content: string }
  | { role: 'user'; content: Array<TextContent | ImageContent | FileContent> };

// ─── 4. MULTIMODAL MESSAGE BUILDER ───────────────────────────────────────────
// Handles three image sources:
//   • data URLs   — "data:image/png;base64,..."  (uploaded files)
//   • base64      — raw base64 string             (from internal pipeline)
//   • HTTPS URLs  — "https://..."                 (FLUX.1 output URLs)

function toCoreMessages(messages: IncomingMessage[]): ModelMessage[] {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
      if (m.role === 'assistant' || typeof m.content === 'string') {
        return { role: m.role as 'user' | 'assistant', content: String(m.content) };
      }

      const parts = (m.content as IncomingPart[]).map((p): TextContent | ImageContent | FileContent => {
        if (p.type === 'image') {
          // FLUX.1-schnell returns HTTPS URLs — pass as URL object so Gemini fetches them
          if (p.image.startsWith('http://') || p.image.startsWith('https://')) {
            return { type: 'image', image: new URL(p.image) };
          }
          // Everything else (data URLs, raw base64) passes through as a string
          return { type: 'image', image: p.image };
        }
        if (p.type === 'file') {
          // PRIORITY 2 — audio / video / pdf → an AI-SDK file part the Google
          // provider maps to Gemini inline_data (or fileData for an https URL),
          // so the model understands the media natively. https → URL object.
          const isHttp = p.data.startsWith('http://') || p.data.startsWith('https://');
          return { type: 'file', data: isHttp ? new URL(p.data) : p.data, mediaType: p.mimeType };
        }
        return { type: 'text', text: p.text };
      });

      return { role: 'user' as const, content: parts };
    });
}

// ─── 4b. MEMORY INJECTION ────────────────────────────────────────────────────
// Pull the latest user text, embed it, and fetch the top-k most-similar
// memories for the current authenticated user via the `match_memories` RPC.
// Failures are silent: missing OPENAI_API_KEY, no auth, embed failure, or RPC
// error all return `null` so chat never breaks because of memory.

function extractLatestUserText(messages: IncomingMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content.trim();
    if (Array.isArray(m.content)) {
      const text = (m.content as IncomingPart[])
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n')
        .trim();
      if (text) return text;
    }
  }
  return '';
}

/**
 * ⚠️ TIME-TO-FIRST-TOKEN. This used to resolve auth ITSELF, and `authedClientFromRequest` is a real
 * network call — `cookieClient.auth.getUser()` validates the JWT against Supabase, it is not a local
 * decode. The route then resolved the SAME user a second time a few lines later for profile facts, so
 * every chat message paid that round-trip twice, back to back, on the critical path.
 *
 * It also embedded FIRST and checked auth SECOND, so every anonymous message — and this route is
 * explicitly reachable without auth — paid a full HTTPS POST to gemini-embedding-001 whose result was
 * discarded two lines later. Anonymous is exactly the traffic used for preview testing.
 *
 * Auth is now resolved once by the caller and passed in, and the user check happens before the embed.
 */
async function buildMemoryPreamble(
  auth: { supabase: AnyAuthedClient; user: { id: string } | null },
  messages: IncomingMessage[],
): Promise<string | null> {
  try {
    const userText = extractLatestUserText(messages);
    if (!userText) return null;

    const { supabase, user } = auth;
    if (!user) return null;

    const embedding = await embed(userText);
    if (!embedding) return null;

    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: embedding,
      match_count: 5,
    });
    if (error) {
      reportError(error, { route: '/api/chat/gemini', stage: 'memory-rpc' });
      return null;
    }

    const rows = (data ?? []) as Array<{ id: string; fact: string; similarity: number }>;
    if (!rows.length) return null;

    const bullets = rows
      .map((r) => `- ${r.fact.replace(/\s+/g, ' ').trim()}`)
      .join('\n');

    // Make the preamble unambiguous: these are facts the user explicitly told
    // Agent G in earlier sessions (stored in their personal memory). Treat
    // them as trusted personal context — answer naturally, don't disclaim
    // "I don't have access to personal information".
    return [
      'KNOWN FACTS ABOUT THIS USER (from their personal memory store —',
      'they told you these themselves in earlier sessions; use them naturally',
      'and don\'t disclaim that you don\'t know personal info):',
      bullets,
    ].join('\n');
  } catch (err) {
    reportError(err, { route: '/api/chat/gemini', stage: 'memory-build' });
    return null;
  }
}

// ─── 5. ERROR CLASSIFICATION ─────────────────────────────────────────────────

function classifyError(err: unknown): 'rate_limit' | 'safety' | 'unknown' {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.toLowerCase();
  // Structured terminal feedback on the Gemini billing/quota/auth posture so a
  // spend wall is instantly distinguishable from a transient blip in prod logs.
  logGeminiState('chat/gemini', classifyGeminiMessage(raw), raw);
  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource_exhausted') || msg.includes('maxretriesexceeded')) {
    return 'rate_limit';
  }
  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('content_filter') || msg.includes('finish_reason: safety')) {
    return 'safety';
  }
  return 'unknown';
}

const SAFETY_MESSAGE_KA = '⚠️ შეტყობინება Google-ის უსაფრთხოების ფილტრებს ეჯახება. გთხოვ, შეცვალე ფორმულირება და სცადე თავიდან.';
const SAFETY_MESSAGE_EN = '⚠️ This request was blocked by safety filters. Please rephrase and try again.';

// Used when BOTH Gemini and Anthropic return empty output — most often a
// quota/rate-limit issue on the provider side that doesn't surface as an
// HTTP error. Tells the user what to do instead of a misleading "safety" claim.
const PROVIDERS_DOWN_KA = '⚠️ AI სერვისები დროებით მიუწვდომელია (Gemini + Anthropic ცარიელ პასუხს აბრუნებენ). სცადე რამდენიმე წუთში — ეს ხშირად ლიმიტის ან მცირე outage-ის შედეგია. თუ პრობლემა გრძელდება, შეტყობინე ადმინს.';
const PROVIDERS_DOWN_EN = '⚠️ AI services temporarily unavailable (Gemini + Anthropic both returned empty responses). Please try again in a few minutes — this is usually a rate-limit or brief outage. If it persists, contact support.';
const PROVIDERS_DOWN_RU = '⚠️ AI-сервисы временно недоступны (Gemini и Anthropic вернули пустой ответ). Повторите через пару минут — обычно это лимит запросов или кратковременный сбой. Если не проходит, напишите в поддержку.';
const providersDownMsg = (loc: 'ka' | 'en' | 'ru'): string => (loc === 'en' ? PROVIDERS_DOWN_EN : loc === 'ru' ? PROVIDERS_DOWN_RU : PROVIDERS_DOWN_KA);

// Reply-language detection (3-script, prose-only) lives in a pure, unit-tested lib so it's testable without the
// route's env/SDK import chain. See lib/chat/replyLocale.ts.
const localeFromMessages = (messages: IncomingMessage[]): 'ka' | 'en' | 'ru' => detectReplyLocale(messages);

// ─── 6. ROUTE HANDLER ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Cost/abuse guard — reachable without auth (anonymous chat), and each call hits
  // paid Gemini + optional Tavily search. Generous IP limit (CGNAT-safe) that still
  // blocks scripted abuse.
  const rateLimitError = await checkRateLimit(req, RATE_LIMITS.READ);
  if (rateLimitError) return rateLimitError;

  // API key guard — fail fast before reading body
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
  if (!geminiKey) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Request size guard — reject oversized bodies immediately
  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return new Response(
      JSON.stringify({ error: 'Request body too large (max 16 MB)' }),
      { status: 413, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const body = (await req.json()) as { messages: IncomingMessage[]; webSearch?: boolean; language?: string; tier?: string; personaId?: string; customPersona?: CustomPersonaInput };
    const { messages = [] } = body;
    // P5 / P83 — response language. An explicit UI selection wins; otherwise (auto mode) DETERMINISTICALLY lock the
    // reply to the latest message's dominant script (localeFromMessages, prose-only) so a Russian or short Georgian
    // turn is answered in the SAME language — not skewed to Georgian by the "default when ambiguous" prompt rule.
    const explicitLang = body.language === 'en' || body.language === 'ru' || body.language === 'ka' ? body.language : null;
    const respLocale: 'ka' | 'en' | 'ru' = explicitLang ?? (Array.isArray(messages) ? localeFromMessages(messages) : 'ka');
    const langName = respLocale === 'en' ? 'English' : respLocale === 'ru' ? 'Russian (Русский)' : 'Georgian (ქართული)';
    const langDirective = `RESPONSE LANGUAGE: reply in ${langName} — match the exact language/script the user wrote in.`;
    const isPro = body.tier === 'pro';

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const modelMessages = toCoreMessages(messages);

    // ⚠️ SIX TO EIGHT SERIAL ROUND-TRIPS USED TO RUN HERE, ONE AFTER ANOTHER, BEFORE THE MODEL WAS EVEN
    // DIALLED: an Upstash rate-limit pipeline, a Gemini embedContent POST, `auth.getUser()`, the
    // match_memories pgvector RPC, a SECOND `auth.getUser()`, a user_profile_facts select, and a billing
    // scan. Every one was an independent lookup awaited in sequence, so their latencies ADDED — several
    // hundred ms to over a second of dead air on every single turn, before the first token was requested.
    //
    // Three changes, no behaviour lost:
    //   · auth is resolved ONCE here and threaded down (it was two identical network validations),
    //   · the memory and profile lookups now run CONCURRENTLY — they never depended on each other,
    //   · the budget gate is STARTED here and awaited inside the stream, so it overlaps everything above
    //     instead of sitting alone in front of the model.
    // All three remain fail-open exactly as before.
    const auth: { supabase: AnyAuthedClient | null; user: { id: string } | null } =
      await authedClientFromRequest(req).catch(() => ({ supabase: null, user: null }));
    const budgetText = modelMessages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
    const budgetPromise = chatBudgetAllows(budgetText).catch(() => true); // fail OPEN, as before

    const [memoryPreamble, profilePreamble] = await Promise.all([
      auth.supabase
        ? buildMemoryPreamble(auth as { supabase: AnyAuthedClient; user: { id: string } | null }, messages)
        : Promise.resolve(null),
      // VECTOR 3 — cross-chat PERSISTENT user memory. Read the user's stored facts (name/weight/height/age,
      // preferred companion name) → inject them so Agent G remembers the user across every separate chat, and
      // (fire-and-forget) extract any explicit new fact from this turn. Fully fail-open: no user / absent table
      // (pre-migration 007) / any error → null preamble + no write. See lib/chat/userMemory.
      (async (): Promise<string | null> => {
        try {
          const { supabase: memClient, user: memUser } = auth;
          if (!memClient) return null;
          const facts = await getUserProfileFacts(memClient, memUser?.id ?? null);
          const latestUser = extractLatestUserText(messages);
          if (memUser?.id && latestUser) {
            const fresh = extractProfileFacts(latestUser);
            if (fresh.length) void saveUserProfileFacts(memClient, memUser.id, fresh);
          }
          return buildProfilePreamble(facts);
        } catch {
          return null; // memory is best-effort — never block the chat
        }
      })(),
    ]);

    // Live web facts now come from OFFICIAL Google Search grounding (the googleSearch tool on the Gemini
    // streamText call below), which the model invokes in real time — far more accurate than the old
    // Tavily preamble, which is retired here to avoid a redundant second search + conflicting context.

    // Ground the model in the REAL current date/time (Tbilisi, UTC+4). Without this an
    // LLM has no clock and answers "what time is it?" with a "[current time]" placeholder.
    const nowTbilisi = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Tbilisi', dateStyle: 'full', timeStyle: 'short' });
    const datePreamble = `CURRENT DATE & TIME in Tbilisi, Georgia (UTC+4): ${nowTbilisi}. When the user asks the time, date, or day, answer using THIS exact value — never output a placeholder like "[current time]".`;

    // Google Search grounding is model-discretionary: without a firm directive Gemini often answers
    // current-fact questions ("who is the president", prices, scores, "latest …") from STALE training
    // memory and hallucinates (e.g. a past US president). This forces a real-time search on anything
    // time-sensitive so the answer reflects 2026, not the training cutoff. Kept tight so it doesn't
    // trigger a needless search on evergreen/creative turns.
    const groundingDirective =
      'You have a real-time Google Search tool. For ANY question whose answer can change over time — current events, news, "who/what is the current …", people currently in office, sports results, prices, exchange rates, weather, "latest/newest", releases, or anything dated after your training — you MUST call Google Search FIRST and base the answer on the results. Never answer such questions from memory; your training data is out of date and will be wrong. Trust fresh search results over anything you recall. (Evergreen facts, math, coding and creative requests need no search.)';

    // CUSTOM PERSONAS — a selected specialist (or a user-authored one) reshapes tone, emphasis and which
    // studio the Master Agent reaches for. `applySystemPersona` APPENDS it, so the platform rules assembled
    // above keep precedence over what is, for a custom persona, untrusted user text.
    const activePersona = resolvePersona(body.personaId ?? null, body.customPersona ?? null);
    const effectiveSystem = applySystemPersona(
      [datePreamble, groundingDirective, langDirective, profilePreamble, memoryPreamble, SYSTEM_PROMPT]
        .filter(Boolean)
        .join('\n\n'),
      activePersona,
    );

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (text: string) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        // Provider/model marker so the client can SHOW which engine actually answered (Gemini vs the
        // Anthropic fallback). Without this, an invalid GEMINI_API_KEY silently degrades every reply to
        // Haiku with zero signal — the exact "Gemini isn't being used" symptom.
        const sendMeta = (meta: { provider: string; model: string; partial?: boolean }) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta })}\n\n`));

        try {
          // ── BUDGET GATE (Master Task §2.1.1) ───────────────────────────────
          // Chat is token-metered and by far the highest-VOLUME service (~15,000 messages against the
          // $45 chat slice of the budget), so it passes the same guard as image/video/music. The check
          // runs INSIDE the stream so a refusal is delivered as a normal assistant message rather than
          // an HTTP error the chat shell would render as a dead turn. Fails OPEN on a guard fault.
          // Started before the preambles above, so its latency overlaps them instead of adding to them.
          if (!(await budgetPromise)) {
            sendMeta({ provider: 'budget', model: 'none' });
            send(BUDGET_EXHAUSTED_MESSAGE);
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          }

          // ── Primary: Gemini 2.0 Flash ──────────────────────────────────────
          // Try Gemini models in order — fail fast (maxRetries:0) so the fallback
          // chain runs within the 60s Vercel timeout instead of burning it on retries.
          // gemini-2.5-flash has a separate quota bucket and is the most capable.
          // P5 — "Pro" tier tries the more capable gemini-2.5-pro first, then falls
          // back through the standard flash chain (so Pro never hard-fails).
          const GEMINI_MODELS: string[] = isPro
            ? ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash']
            : ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash'];

          let geminiOk = false;

          /** The last model's real error text — see the exhaustion report below. */

          let lastGeminiFailure = '';
          for (const modelName of GEMINI_MODELS) {
            let streamed = 0; // hoisted so the catch can tell if the turn already partly committed
            try {
              const google = getGeminiClient();
              const result = streamText({
                model: google(modelName),
                system: effectiveSystem,
                messages: modelMessages,
                // OFFICIAL Google Search grounding — the model searches Google in real time when a
                // question needs current or factual info, so answers about 2026 / live events are
                // accurate instead of hallucinated from stale training data (matches the official
                // Gemini app). The model decides when to search, so everyday chat stays instant.
                // Cast: ai@6 and @ai-sdk/google@3 have a minor Tool inputSchema type skew (<{}> vs
                // <never>); the provider-defined googleSearch tool is valid at runtime.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                tools: { google_search: google.tools.googleSearch({}) as any },
                maxOutputTokens: 4096,
                temperature: 0.7,
                // Explicit nucleus + top-k sampling: broadens vocabulary and curbs cyclic
                // phrasing on long conversational turns. topP is the dominant limiter; topK is
                // a mild guard that rarely binds under 0.95. @ai-sdk/google maps both into the
                // Gemini generationConfig. Matches the REST client's DEFAULT_TOP_P/DEFAULT_TOP_K.
                topP: 0.95,
                topK: 40,
                maxRetries: 0, // fail instantly on quota/error — we rotate ourselves
              });
              for await (const chunk of result.textStream) {
                if (chunk) {
                  // ⚠️ THE ENGINE BADGE USED TO ARRIVE ONLY AFTER THE WHOLE ANSWER HAD STREAMED. The
                  // marker exists precisely so a silently-degraded provider is visible — and it was
                  // emitted last, the moment it is least useful: through the entire wait, the one span
                  // where you would want to know whether you are on Gemini or the Anthropic fallback,
                  // there was nothing to show. Sent on the FIRST chunk instead, which is the earliest
                  // point it is actually TRUE (the model has committed to answering). The terminal
                  // sendMeta calls stay: they correct the badge if the turn ends up partial or rotates.
                  if (streamed === 0) sendMeta({ provider: 'gemini', model: modelName });
                  send(chunk);
                  streamed += chunk.length;
                }
              }
              // Gemini occasionally completes with zero text chunks (silent
              // safety pass-through, empty finish_reason, or quota throttling
              // that doesn't surface as an error). Treat that as a miss and
              // fall through to the next model / fallback.
              if (streamed === 0) {
                console.warn('[/api/chat/gemini]', modelName, 'returned 0 chars — rotating');
                continue;
              }
              geminiOk = true;
              // Book the turn against the platform budget (best-effort, after the reply is delivered).
              void bookChatUsage(budgetText, streamed, modelName);
              sendMeta({ provider: 'gemini', model: modelName });
              break;
            } catch (geminiErr) {
              const kind = classifyError(geminiErr);
              if (kind === 'safety') {
                console.warn('[/api/chat/gemini] Safety block on', modelName);
                send(SAFETY_MESSAGE_KA + '\n\n' + SAFETY_MESSAGE_EN);
                return;
              }
              // audit MED — if this model ALREADY streamed text before erroring, the turn is
              // partially committed to the client. Rotating to another model (or the Anthropic
              // fallback) would append a SECOND full answer on top of the partial one → duplicated,
              // garbled output. Keep the partial answer and stop.
              if (streamed > 0) {
                console.warn('[/api/chat/gemini]', modelName, kind, '— erred after partial stream; keeping partial (no rotation)');
                geminiOk = true;
                sendMeta({ provider: 'gemini', model: modelName, partial: true });
                break;
              }
              console.warn('[/api/chat/gemini]', modelName, kind, '— trying next model');
              // Keep the reason. Without it the exhaustion report below could only say THAT every model
              // failed, never WHY — and "why" is the entire diagnosis: an invalid key, a quota, a
              // region restriction and a model the project cannot see all look identical from outside.
              lastGeminiFailure = `${modelName}: ${kind} — ${geminiErr instanceof Error ? geminiErr.message.slice(0, 200) : String(geminiErr).slice(0, 200)}`;
            }
          }

          if (!geminiOk) {
            // ── Fallback: Anthropic Claude Haiku ────────────────────────────
            console.error('[/api/chat/gemini] All Gemini models exhausted — falling back to Anthropic');
            // The message carries the LAST model's actual error, so one Sentry event is enough to tell
            // an invalid key from a quota from a missing model grant. Production ran on this fallback
            // for every request while every dashboard reported healthy; the report is what makes the
            // next occurrence diagnosable instead of merely visible.
            reportError(
              new Error(`All Gemini models exhausted — Anthropic fallback engaged. Last failure: ${lastGeminiFailure || 'no error captured'}`),
              { route: 'chat.gemini', stage: 'gemini-exhausted', lastFailure: lastGeminiFailure },
            );
            // Hoisted so the catch below can tell whether the fallback already committed partial text to the
            // client — if it did, appending a "providers down" notice would garble the bubble (partial answer
            // + full error notice). Mirrors the Gemini loop's partial-commit handling above.
            let streamed = 0;
            try {
              const anthropic = getAnthropicClient();
              const fallback = streamText({
                model: anthropic('claude-haiku-4-5-20251001'),
                system: effectiveSystem,
                // Haiku doesn't support image URLs inline — strip to text-only
                messages: modelMessages.map(m => ({
                  role: m.role,
                  content: typeof m.content === 'string'
                    ? m.content
                    : (m.content as Array<TextContent | ImageContent>)
                        .filter((p): p is TextContent => p.type === 'text')
                        .map(p => p.text)
                        .join('\n') || '[image attached]',
                })),
                maxOutputTokens: 4096,
                temperature: 0.7,
                maxRetries: 1,
              });
              for await (const chunk of fallback.textStream) {
                if (chunk) {
                  send(chunk);
                  streamed += chunk.length;
                }
              }
              if (streamed === 0) {
                send(providersDownMsg(respLocale));
              } else {
                sendMeta({ provider: 'anthropic', model: 'claude-haiku-4-5' });
              }
            } catch (anthropicErr) {
              console.error('[/api/chat/gemini] Anthropic fallback failed:', anthropicErr);
              // Only surface the failure notice if NOTHING streamed yet — otherwise it would be appended
              // on top of a partial answer, producing a garbled bubble.
              if (streamed === 0) send(providersDownMsg(respLocale));
            }
          }

        } catch (err) {
          const msg = err instanceof Error ? err.message : 'AI service unavailable';
          console.error('[/api/chat/gemini] Unhandled error:', err);
          send(`⚠️ ${msg}`);
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        // Its sibling /api/chat/claude sets this and the other three streaming chat routes did not. Any
        // nginx-class buffering proxy in front of the app will otherwise accumulate the whole SSE body
        // and deliver it in one piece — turning a correctly-implemented token stream into exactly the
        // "it all appears at once, late" symptom, with nothing wrong in the code to find.
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (error) {
    reportError(error, { route: '/api/chat/gemini', stage: 'request-parse' });
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
