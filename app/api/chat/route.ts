/**
 * POST /api/chat — the JSON (non-streaming) chat used by the service widgets and ServiceWorkspaceView.
 *
 * Same rules as the product chat (/api/chat/gemini), because it spends the same keys:
 *   • sign-in required (mustSignInToChat → 401; FILM_ALLOW_ANONYMOUS=1 re-opens it for a demo deployment);
 *   • the per-account daily chat allowance (CHAT_USER, keyed on the verified uid);
 *   • Google only while AI_GOOGLE_ONLY is on (the default): the reply comes from the product Gemini chain and the
 *     OpenAI-backed chatEngine / Anthropic legs are skipped; with it off, the old chain runs as before;
 *   • provider wording never reaches the browser (the old `diagnostics` field carried it verbatim).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { apiSuccess, apiError } from '@/lib/api/response';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { execute } from '@/lib/ai/chatEngine';
import { getAllAgents } from '@/lib/agents/agentRegistry';
import { getAuthContext, checkDailyBudget, sanitizePrompt } from '@/lib/security/apiGuard';
import { agentGSystemPrompt } from '@/lib/agent-g-orchestrator';
import { chatBudgetAllows, bookChatUsage, BUDGET_EXHAUSTED_MESSAGE } from '@/lib/services/billing/chatBudget';
import { mustSignInToChat, signInToGenerateBody } from '@/lib/auth/generationGate';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isAiGoogleOnly } from '@/lib/ai/google/policy';
import { geminiReply } from '@/lib/ai/google/reply';

type Loc = 'ka' | 'en' | 'ru';
const locOf = (hint?: string | null): Loc => {
  const h = String(hint || '').toLowerCase();
  return h.startsWith('en') ? 'en' : h.startsWith('ru') ? 'ru' : 'ka';
};
/** What the browser sees when every leg failed — never the provider's own words (lib/api/providerError.ts). */
const UNAVAILABLE: Record<Loc, string> = {
  ka: 'AI სერვისი დროებით მიუწვდომელია. სცადე ცოტა ხანში.',
  en: 'The AI service is temporarily unavailable. Please try again a little later.',
  ru: 'Сервис ИИ временно недоступен. Попробуйте чуть позже.',
};
const SIGN_IN_TO_CHAT: Record<Loc, string> = {
  ka: 'ჩატისთვის შედი ანგარიშზე.',
  en: 'Sign in to chat.',
  ru: 'Войдите, чтобы пользоваться чатом.',
};
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// ─── Context → Agent mapping (backwards compat) ────────────────────────────
const CONTEXT_TO_AGENT: Record<string, string> = {
  global: 'main-assistant',
  music: 'audio-agent',
  video: 'video-agent',
  avatar: 'image-agent',
  image: 'image-agent',
  photo: 'image-agent',
  voice: 'audio-agent',
  business: 'business-agent',
  'visual-ai': 'research-agent',
};

function shouldProduceArtifact(message: string, context: string) {
  if (!message) return false;
  if (!['avatar', 'video', 'music', 'voice', 'image', 'photo', 'visual-ai'].includes(context)) return false;
  return /generate|create|make|render|avatar|video|music|audio|image|photo|enhance|upscale|remove.*bg|caption|analyze|describe|შექმ|გენერ|генер|созд/i.test(message);
}

function demoImageUrl(title: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'>
  <defs>
    <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='#0b1020'/>
      <stop offset='100%' stop-color='#1f2a5a'/>
    </linearGradient>
  </defs>
  <rect width='100%' height='100%' fill='url(#bg)'/>
  <circle cx='512' cy='390' r='190' fill='#22d3ee' fill-opacity='0.16'/>
  <circle cx='512' cy='390' r='120' fill='#22d3ee' fill-opacity='0.2'/>
  <text x='50%' y='66%' dominant-baseline='middle' text-anchor='middle' fill='#e2e8f0' font-family='Inter, Arial, sans-serif' font-size='44' font-weight='700'>${title}</text>
  <text x='50%' y='74%' dominant-baseline='middle' text-anchor='middle' fill='#94a3b8' font-family='Inter, Arial, sans-serif' font-size='22'>Demo preview artifact</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildDemoArtifacts(context: string, message: string) {
  if (!shouldProduceArtifact(message, context)) return undefined;

  if (context === 'avatar') {
    return [{
      type: 'image',
      label: 'Avatar Preview',
      mimeType: 'image/svg+xml',
      url: demoImageUrl('Avatar Output'),
    }];
  }

  if (context === 'video') {
    return [{
      type: 'image',
      label: 'Video Storyboard Preview',
      mimeType: 'image/svg+xml',
      url: demoImageUrl('Video Output'),
    }];
  }

  return [{
    type: 'text',
    label: 'Music Draft',
    mimeType: 'text/plain',
    content: 'Intro (0:00-0:15)\nVerse (0:15-0:45)\nHook (0:45-1:05)\nDrop (1:05-1:35)\nOutro (1:35-1:50)',
  }];
}

const chatRequestSchema = z.object({
  message: z.string().min(1).max(4000).optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
  agentId: z.string().optional(),
  context: z.enum(['global', 'music', 'video', 'avatar', 'voice', 'business', 'image', 'photo', 'visual-ai']).default('global'),
  serviceId: z.string().optional(),
  conversationId: z.string().optional(),
  sessionId: z.string().optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
  attachments: z.array(z.object({
    name: z.string(),
    type: z.string().optional(),
    content: z.string().optional(),
  })).optional(),
  flags: z.object({
    demoMode: z.boolean().optional(),
    agentEnabled: z.boolean().optional(),
  }).optional(),
  locale: z.string().optional(),
  language: z.string().default('en'),
  channel: z.enum(['web', 'whatsapp', 'telegram', 'phone', 'api']).default('web'),
  metadata: z.record(z.unknown()).optional(),
}).refine((value) => {
  if (value.message && value.message.trim().length > 0) return true;
  const list = value.messages ?? [];
  return list.some((m) => m.role === 'user' && m.content.trim().length > 0);
}, { message: 'message or messages[] is required' });

export async function POST(req: NextRequest) {
  // Rate limiting
  const rateLimitError = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (rateLimitError) return rateLimitError;

  let demoModeRequested = false;
  let fallbackContext = 'global';
  let fallbackMessage = '';
  let fallbackHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let fallbackUserId: string | null = null;
  let fallbackLoc: Loc = 'ka';

  try {
    const body = await req.json();
    const parsed = chatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(new Error('Validation failed'), 400, 'Invalid request format');
    }

    const {
      message,
      messages,
      agentId,
      context,
      serviceId,
      conversationId,
      sessionId,
      history,
      attachments,
      flags,
      locale,
      language,
      channel,
      metadata,
    } = parsed.data;
    demoModeRequested = flags?.demoMode ?? false;
    fallbackContext = context;

    const incomingMessages = messages ?? [];
    const lastUserFromMessages = [...incomingMessages].reverse().find((m) => m.role === 'user')?.content;
    const effectiveMessage = (message ?? lastUserFromMessages ?? '').trim();
    if (!effectiveMessage) {
      return apiError(new Error('Validation failed'), 400, 'Missing user message');
    }
    fallbackMessage = effectiveMessage;

    // Security: sanitize prompt
    const sanitizedMessage = sanitizePrompt(effectiveMessage);

    // Capture history for fallback path (used if primary engine fails)
    fallbackHistory = [
      ...((history?.length ? history : incomingMessages.slice(0, -1)) ?? []).map(h => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user' as const, content: sanitizedMessage },
    ];

    // Auth — a verified session (cookie, then bearer), refused before anything is spent.
    const loc = locOf(locale || language);
    const auth = await getAuthContext();
    const verifiedId = auth?.userId
      ?? (await authedClientFromRequest(req).catch(() => ({ user: null }))).user?.id
      ?? null;
    if (mustSignInToChat(verifiedId)) {
      return NextResponse.json({ ...signInToGenerateBody(loc), message: SIGN_IN_TO_CHAT[loc] }, { status: 401 });
    }
    // 'anonymous' only survives the gate on a demo deployment (FILM_ALLOW_ANONYMOUS=1).
    const userId = verifiedId || 'anonymous';
    fallbackUserId = verifiedId;
    fallbackLoc = loc;

    // Per-account daily allowance (shared with /api/chat/gemini) + the legacy per-user budget.
    if (verifiedId) {
      const capped = await checkRateLimitByKey(verifiedId, RATE_LIMITS.CHAT_USER);
      if (capped) return capped;
      const budget = checkDailyBudget(verifiedId);
      if (!budget.allowed) {
        return apiError(new Error('Daily AI limit reached'), 429, `Daily limit of ${budget.limit} requests reached. Resets in 24h.`);
      }
    }

    // Resolve agent: explicit agentId > context mapping > default
    const resolvedAgentId = agentId || CONTEXT_TO_AGENT[context] || 'main-assistant';

    // Build message history
    const mergedHistory = history?.length ? history : incomingMessages.slice(0, -1);
    const messageHistory = [
      ...(mergedHistory || []).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user' as const, content: sanitizedMessage },
    ];

    // BUDGET GATE (§2.1.1). This is the main chat surface; `execute()` fans out to the provider chain, so
    // the guard sits in front of it. A refusal is a normal 200 response — the shell renders it as an
    // assistant turn rather than an error state.
    const budgetText = messageHistory.map((m: { content?: unknown }) => (typeof m.content === 'string' ? m.content : '')).join(' ');
    if (!(await chatBudgetAllows(budgetText))) {
      return apiSuccess({ response: BUDGET_EXHAUSTED_MESSAGE, provider: 'budget', model: 'none', agentId: resolvedAgentId });
    }

    // GOOGLE ONLY (the default): the product Gemini chain answers; the OpenAI-backed chatEngine is not called.
    if (isAiGoogleOnly()) {
      const g = await geminiReply(messageHistory, verifiedId, req.signal, { locale: loc });
      return apiSuccess({
        response: g ? g.text : UNAVAILABLE[loc],
        provider: g ? 'gemini' : 'provider-fallback',
        model: g ? g.model : 'none',
        agentId: resolvedAgentId,
        context,
        serviceId,
        demoMode: flags?.demoMode ?? false,
        agentEnabled: flags?.agentEnabled ?? true,
        conversationId: conversationId || `conv_${Date.now()}`,
        language: locale || language,
        metadata: { ...(metadata || {}), serviceId },
        artifacts: buildDemoArtifacts(context, sanitizedMessage),
      });
    }

    // Execute through central chatEngine (multi-vendor; only when AI_GOOGLE_ONLY=0)
    const result = await execute({
      agentId: resolvedAgentId,
      userId,
      sessionId: sessionId || conversationId || `chat_${Date.now()}`,
      channel,
      messages: messageHistory,
      files: attachments?.map((file) => ({
        name: file.name,
        type: file.type || 'application/octet-stream',
        content: file.content || '',
      })),
    });

    void bookChatUsage(budgetText, (result.text || '').length, result.model || 'chat');

    const artifacts = buildDemoArtifacts(context, sanitizedMessage);

    return apiSuccess({
      response: result.text,
      provider: result.model,
      model: result.model,
      agentId: result.agentId,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costEstimate: result.costEstimate,
      durationMs: result.durationMs,
      dualStage: result.dualStage,
      context,
      serviceId,
      demoMode: flags?.demoMode ?? false,
      agentEnabled: flags?.agentEnabled ?? true,
      conversationId: conversationId || `conv_${Date.now()}`,
      language: locale || language,
      metadata: {
        ...(metadata || {}),
        serviceId,
      },
      artifacts,
    });
  } catch (error) {
    console.error('[Chat API Error]', error);

    const fallbackArtifacts = buildDemoArtifacts(fallbackContext, fallbackMessage || 'generation fallback');

    const normalized = error instanceof Error ? error.message : 'Unknown provider error';
    const throttled = /429|quota|rate limit|thrott/i.test(normalized);
    const unavailable = /MODEL_FAILURE|ENV_MISSING|provider|openai/i.test(normalized);

    if (demoModeRequested) {
      return apiSuccess({
        response: 'Demo mode response: request accepted. AI provider is temporarily unavailable, but chat flow is active.',
        provider: 'demo-fallback',
        model: 'fallback',
        agentId: 'main-assistant',
        artifacts: fallbackArtifacts,
      });
    }

    if (throttled || unavailable) {
      // Real fallback: try Gemini, then Anthropic, before giving up
      const failures: FallbackFailures = {};
      const realFallback = await tryRealFallback(fallbackHistory, failures, fallbackUserId, fallbackLoc);
      if (realFallback) {
        return apiSuccess({
          response: realFallback.text,
          provider: realFallback.provider,
          model: realFallback.model,
          agentId: 'main-assistant',
          artifacts: fallbackArtifacts,
        });
      }

      // All providers failed — the diagnostic goes to the server log (operators), never to the browser.
      const diag = [
        `openai: ${normalized.slice(0, 120)}`,
        failures.gemini && `gemini: ${failures.gemini}`,
        failures.anthropic && `anthropic: ${failures.anthropic}`,
      ].filter(Boolean).join(' | ');
      console.error('[Chat API] every provider failed:', diag);

      return apiSuccess({
        response: UNAVAILABLE[fallbackLoc],
        provider: throttled ? 'throttled-fallback' : 'provider-fallback',
        model: 'none',
        agentId: 'main-assistant',
        artifacts: fallbackArtifacts,
      });
    }

    return apiError(error, 500, 'Chat service error');
  }
}

// ─── Real-AI fallback chain (Gemini rotation → Anthropic) ────────────────────
// Used when chatEngine (OpenAI) throws a quota/rate-limit/availability error.
// Each Gemini model variant has a separate free-tier quota bucket, so we
// rotate through them on quota errors before giving up.
// Returns null only if all Gemini variants and Anthropic fail.

// Tiny in-memory cache so identical messages don't re-hit the quota.
// 5-minute TTL, capped at 100 entries to bound memory.
interface CacheEntry { text: string; provider: string; model: string; ts: number }
const chatCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// ⚠️ SCOPED PER USER. The key used to be the last message alone, so one account's answer to "what is my name?"
// (with that account's history behind it) was served to the next account that asked the same words.
function cacheKeyFor(messages: Array<{ role: 'user' | 'assistant'; content: string }>, userId: string | null): string {
  const last = messages[messages.length - 1]?.content ?? '';
  const q = last.trim().toLowerCase().slice(0, 200);
  return q && userId ? `${userId}:${q}` : '';
}

function getCached(messages: Array<{ role: 'user' | 'assistant'; content: string }>, userId: string | null): CacheEntry | null {
  const key = cacheKeyFor(messages, userId);
  if (!key) return null;
  const entry = chatCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry;
  if (entry) chatCache.delete(key);
  return null;
}

function setCached(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  value: Omit<CacheEntry, 'ts'>,
  userId: string | null,
): void {
  const key = cacheKeyFor(messages, userId);
  if (!key) return;
  chatCache.set(key, { ...value, ts: Date.now() });
  if (chatCache.size > 100) {
    const firstKey = chatCache.keys().next().value;
    if (firstKey !== undefined) chatCache.delete(firstKey);
  }
}

interface FallbackFailures {
  gemini?: string;
  anthropic?: string;
}

async function tryRealFallback(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  failures: FallbackFailures = {},
  userId: string | null = null,
  loc: Loc = 'ka',
): Promise<{ text: string; provider: string; model: string } | null> {
  if (!messages.length) return null;

  // Cache hit short-circuits the whole chain — saves quota on duplicate prompts (per user; see cacheKeyFor).
  const cached = getCached(messages, userId);
  if (cached) {
    return { text: cached.text, provider: `${cached.provider}-cached`, model: cached.model };
  }

  // Gemini — the product chain (current models, typed errors, rotation), booked with real usage.
  const g = await geminiReply(messages, userId, undefined, { locale: loc });
  if (g) {
    setCached(messages, { text: g.text, provider: 'gemini', model: g.model }, userId);
    return { text: g.text, provider: 'gemini', model: g.model };
  }
  failures.gemini = 'no Gemini model answered';

  // Anthropic Claude Haiku — never while Google-only is on.
  if (isAiGoogleOnly()) return null;
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
    if (apiKey) {
      const anthropic = createAnthropic({ apiKey });
      const result = await generateText({
        model: anthropic('claude-haiku-4-5-20251001'),
        // No Google Search tool on this leg, so the prompt must not promise one.
        system: agentGSystemPrompt({ locale: loc, googleSearch: false }),
        messages,
        maxOutputTokens: 2048,
        temperature: 0.7,
        maxRetries: 0,
      });
      if (result.text?.trim()) {
        setCached(messages, { text: result.text, provider: 'anthropic', model: 'claude-haiku-4-5' }, userId);
        return { text: result.text, provider: 'anthropic', model: 'claude-haiku-4-5' };
      }
      failures.anthropic = 'empty response';
    } else {
      failures.anthropic = 'no API key';
    }
  } catch (err) {
    failures.anthropic = err instanceof Error ? err.message.slice(0, 200) : 'unknown error';
    console.error('[Chat fallback] Anthropic also failed:', failures.anthropic);
  }

  return null;
}

export async function GET() {
  const agents = getAllAgents();
  return apiSuccess({
    status: 'ok',
    service: 'Avatar G Chat API (chatEngine)',
    agents: agents.map(a => ({ id: a.id, name: a.name, icon: a.icon, service: a.service })),
    contexts: ['global', 'music', 'video', 'avatar', 'voice', 'business'],
  });
}
