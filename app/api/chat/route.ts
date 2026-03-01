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
  message: z.string().min(1).max(4000),
  agentId: z.string().optional(),
  context: z.enum(['global', 'music', 'video', 'avatar', 'voice', 'business']).default('global'),
  conversationId: z.string().optional(),
  sessionId: z.string().optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
  language: z.string().default('en'),
  channel: z.enum(['web', 'whatsapp', 'telegram', 'phone', 'api']).default('web'),
  metadata: z.record(z.unknown()).optional(),
});

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

    const { message, agentId, context, conversationId, sessionId, history, language, channel, metadata } = parsed.data;

    // Security: sanitize prompt
    const sanitizedMessage = sanitizePrompt(message);

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
    const messages = [
      ...(history || []).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user' as const, content: sanitizedMessage },
    ];

    // Execute through central chatEngine
    const result = await execute({
      agentId: resolvedAgentId,
      userId,
      sessionId: sessionId || conversationId || `chat_${Date.now()}`,
      channel,
      messages,
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
      conversationId: conversationId || `conv_${Date.now()}`,
      language,
      metadata,
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
