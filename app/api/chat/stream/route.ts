/**
 * POST /api/chat/stream
 * Streaming chat endpoint using chatEngine.
 * Returns Server-Sent Events for real-time token streaming.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { executeStream } from '@/lib/ai/chatEngine';
import type { ChatMessage } from '@/lib/ai/chatEngine';
import { getAuthContext, checkDailyBudget, sanitizePrompt } from '@/lib/security/apiGuard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const streamRequestSchema = z.object({
  agentId: z.string().default('main-assistant'),
  sessionId: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
  channel: z.enum(['web', 'whatsapp', 'telegram', 'phone', 'api']).default('web'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = streamRequestSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid request', details: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { agentId, sessionId, messages, channel } = parsed.data;

    // Auth + budget
    const auth = await getAuthContext();
    const userId = auth?.userId || 'anonymous';
    if (auth) {
      const budget = checkDailyBudget(auth.userId);
      if (!budget.allowed) {
        return new Response(JSON.stringify({ error: 'Daily AI limit reached' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Sanitize last user message
    const sanitizedMessages = messages.map((m, i) =>
      i === messages.length - 1 && m.role === 'user' ? { ...m, content: sanitizePrompt(m.content) } : m
    );

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const chatMessages: ChatMessage[] = sanitizedMessages.map(m => ({
          role: m.role,
          content: m.content,
        }));

        executeStream(
          {
            agentId,
            userId,
            sessionId: sessionId || `stream_${Date.now()}`,
            channel,
            messages: chatMessages,
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
                agentId: response.agentId,
                durationMs: response.durationMs,
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
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (_error) {
    return new Response(JSON.stringify({ error: 'Stream setup failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
