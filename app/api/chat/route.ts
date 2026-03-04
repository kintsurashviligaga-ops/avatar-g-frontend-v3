import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { execute } from '@/lib/ai/chatEngine';
import { getAllAgents } from '@/lib/agents/agentRegistry';
import { getAuthContext, checkDailyBudget, sanitizePrompt } from '@/lib/security/apiGuard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ─── Context → Agent mapping (backwards compat) ────────────────────────────
const CONTEXT_TO_AGENT: Record<string, string> = {
  global: 'main-assistant',
  music: 'audio-agent',
  video: 'video-agent',
  avatar: 'image-agent',
  voice: 'audio-agent',
  business: 'business-agent',
};

function shouldProduceArtifact(message: string, context: string) {
  if (!message) return false;
  if (!['avatar', 'video', 'music', 'voice'].includes(context)) return false;
  return /generate|create|make|render|avatar|video|music|audio|image|შექმ|генер|созд/i.test(message);
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
  <circle cx='512' cy='390' r='120' fill='#8b5cf6' fill-opacity='0.2'/>
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
  context: z.enum(['global', 'music', 'video', 'avatar', 'voice', 'business']).default('global'),
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

    // Auth context (optional — allows unauthenticated for public chat)
    const auth = await getAuthContext();
    const userId = auth?.userId || 'anonymous';

    // Budget check for authenticated users
    if (auth) {
      const budget = checkDailyBudget(auth.userId);
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

    // Execute through central chatEngine
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
      return apiSuccess({
        response: throttled
          ? 'AI provider is temporarily rate-limited. Your request was accepted; please retry in a moment.'
          : 'AI provider is temporarily unavailable. Your request was accepted in fallback mode.',
        provider: throttled ? 'throttled-fallback' : 'provider-fallback',
        model: 'none',
        agentId: 'main-assistant',
        artifacts: fallbackArtifacts,
      });
    }

    return apiError(error, 500, 'Chat service error');
  }
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
