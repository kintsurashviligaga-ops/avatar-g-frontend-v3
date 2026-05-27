import { NextRequest } from 'next/server';
import { z } from 'zod';
import { executeStream } from '@/lib/ai/chatEngine';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';

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
          userId: sessionId ? `dashboard:${sessionId}` : 'dashboard-anonymous',
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
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
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