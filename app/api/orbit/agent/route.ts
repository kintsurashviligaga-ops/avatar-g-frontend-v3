import { NextRequest } from 'next/server';
import { z } from 'zod';
import { executeStream } from '@/lib/ai/chatEngine';
import { applyApiGuards } from '@/lib/api/guard';
import { checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { mustSignInToChat, signInToGenerateBody } from '@/lib/auth/generationGate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const requestSchema = z.object({
  message: z.string().min(1).max(4000),
  locale: z.enum(['ka', 'en', 'ru']).optional(),
  sessionId: z.string().min(1).max(128).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(20).optional(),
});

export async function POST(request: NextRequest) {
  const gate = await applyApiGuards(request, { limit: RATE_LIMITS.AI, label: 'orbit.agent' });
  if (gate.response) return gate.response;

  // ⚠️ SIGNED-IN ONLY. This streamed an LLM answer on the platform key to anyone, capped only per IP per minute — an
  // anonymous chat tap no screen uses any more (its last caller, AgentGInterface, is unreachable). Session → per-ACCOUNT
  // daily chat cap (the same CHAT_USER bucket the product chat draws on), so rotating IPs buys nothing.
  let userId: string | null = gate.auth?.userId ?? null;
  if (!userId) {
    try {
      userId = (await authedClientFromRequest(request)).user?.id ?? null;
    } catch {
      userId = null;
    }
  }
  if (mustSignInToChat(userId)) {
    return new Response(JSON.stringify(signInToGenerateBody()), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  if (userId) {
    const capped = await checkRateLimitByKey(userId, RATE_LIMITS.CHAT_USER);
    if (capped) return capped;
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { message, history, sessionId } = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      void executeStream(
        {
          agentId: 'agent-g',
          userId: userId ?? (sessionId ? `dashboard:${sessionId}` : 'dashboard-anonymous'),
          sessionId: sessionId || `orbit_agent_${Date.now()}`,
          channel: 'web',
          messages: [
            ...(history ?? []).map((item) => ({
              role: item.role,
              content: item.content,
            })),
            { role: 'user' as const, content: message },
          ],
        },
        {
          onToken(token) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
          },
          onDone(response) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              done: true,
              model: response.model,
              tokensIn: response.tokensIn,
              tokensOut: response.tokensOut,
              costEstimate: response.costEstimate,
            })}\n\n`));
            controller.close();
          },
          onError(error) {
            // The provider's own message stays in the server log — the stream carries a fixed, non-leaking one.
            console.error('[orbit/agent] stream failed:', error.message.slice(0, 200));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'AI service temporarily unavailable' })}\n\n`));
            controller.close();
          },
        },
      );
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}