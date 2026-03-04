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

    const incomingMessages = messages ?? [];
    const lastUserFromMessages = [...incomingMessages].reverse().find((m) => m.role === 'user')?.content;
    const effectiveMessage = (message ?? lastUserFromMessages ?? '').trim();
    if (!effectiveMessage) {
      return apiError(new Error('Validation failed'), 400, 'Missing user message');
    }

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
    });
  } catch (error) {
    console.error('[Chat API Error]', error);

    // Graceful fallback if chatEngine fails entirely
    if (error instanceof Error && error.message.includes('ENV_MISSING')) {
      return apiSuccess({
        response: 'AI service is being configured. Please try again shortly.',
        provider: 'fallback',
        model: 'none',
        agentId: 'main-assistant',
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
