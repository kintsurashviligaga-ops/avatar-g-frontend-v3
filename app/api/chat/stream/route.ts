/**
 * POST /api/chat/stream
 * Streaming chat endpoint using chatEngine.
 * Returns Server-Sent Events for real-time token streaming.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { executeStream } from '@/lib/ai/chatEngine';
import type { ChatMessage } from '@/lib/ai/chatEngine';
import { getAuthContext, checkDailyBudget, sanitizePrompt } from '@/lib/security/apiGuard';
import { detectIntent } from '@/lib/chat/intentDetector';
import { orchestrate, pollOrchestrationTask } from '@/lib/chat/providerRouter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const legacyStreamRequestSchema = z.object({
  agentId: z.string().default('main-assistant'),
  sessionId: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
  channel: z.enum(['web', 'whatsapp', 'telegram', 'phone', 'api']).default('web'),
});

const shellStreamRequestSchema = z.object({
  message: z.string().min(1),
  serviceSlug: z.string().optional(),
  agentId: z.string().default('main-assistant'),
  sessionId: z.string().optional(),
  agentMode: z.enum(['chat', 'agent']).optional(),
  options: z.record(z.unknown()).optional(),
  language: z.string().optional(),
  channel: z.enum(['web', 'whatsapp', 'telegram', 'phone', 'api']).default('web'),
});

const streamRequestSchema = z.union([legacyStreamRequestSchema, shellStreamRequestSchema]);

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

    const parsedData = parsed.data;

    // Auth + budget
    const auth = await getAuthContext();
    const userId = auth?.userId || 'anonymous';
    if (auth) {
      const budget = checkDailyBudget(auth.userId);
      if (!budget.allowed) {
        return new Response(JSON.stringify({ error: 'Daily AI limit reached' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if ('messages' in parsedData) {
      const agentId = parsedData.agentId;
      const sessionId = parsedData.sessionId;
      const channel = parsedData.channel;
      const messages = parsedData.messages;

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
    }

    const shellSessionId = parsedData.sessionId || `shell_${userId}_${randomUUID()}`;
    const serviceContext = parsedData.serviceSlug || 'global';
    const channel = parsedData.channel;

    const selectedOptions = Object.fromEntries(
      Object.entries(parsedData.options || {})
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => [key, typeof value === 'string' ? value : String(value)]),
    );

    const rawMessage = parsedData.message.trim();
    const detected = detectIntent(rawMessage, serviceContext);
    const preservePrompt = detected.intent === 'image_generation'
      || detected.intent === 'photo_edit'
      || detected.intent === 'video_generation'
      || detected.intent === 'avatar_generation';

    const routedMessage = preservePrompt ? rawMessage : sanitizePrompt(rawMessage);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const sendEvent = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        const emitTokens = (text: string) => {
          const chunks = text.split(/(\s+)/).filter(Boolean);
          for (const chunk of chunks) {
            sendEvent({ token: chunk });
          }
        };

        const emitPreview = (responseType: string | undefined, assetUrl: string | null | undefined, message: string) => {
          if (!assetUrl) {
            return;
          }

          const previewType = responseType === 'video'
            ? 'video'
            : responseType === 'audio'
              ? 'audio'
              : responseType === 'analysis'
                ? 'text'
                : 'image';

          sendEvent({
            preview: {
              id: `preview_${Date.now()}`,
              type: previewType,
              url: previewType === 'text' ? undefined : assetUrl,
              content: previewType === 'text' ? message : undefined,
              title: message,
            },
          });
        };

        void (async () => {
          try {
            const first = await orchestrate({
              message: routedMessage,
              serviceContext,
              agentId: parsedData.agentId,
              userId,
              sessionId: shellSessionId,
              locale: parsedData.language || 'en',
              history: [],
              selectedOptions,
              metadata: {
                channel,
                mode: parsedData.agentMode,
              },
            });

            const initialMessage = first.message || 'Processing…';
            emitTokens(initialMessage);
            emitPreview(first.responseType, first.assetUrl || null, initialMessage);

            if (first.predictionId && first.predictionStatus !== 'succeeded') {
              let finalStatus = first.predictionStatus;
              let lastMessage = initialMessage;

              for (let attempt = 0; attempt < 30; attempt += 1) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                const poll = await pollOrchestrationTask(first.predictionId, shellSessionId);

                finalStatus = poll.predictionStatus;

                if (poll.predictionStatus === 'succeeded') {
                  if (poll.message && poll.message !== lastMessage) {
                    emitTokens(`\n${poll.message}`);
                    lastMessage = poll.message;
                  }

                  emitPreview(poll.responseType, poll.assetUrl || null, poll.message || 'Generation complete.');

                  sendEvent({
                    done: true,
                    model: String(poll.metadata?.model || poll.metadata?.provider || 'deterministic-router'),
                    provider: poll.metadata?.provider,
                    predictionStatus: poll.predictionStatus,
                    predictionId: first.predictionId,
                  });
                  controller.close();
                  return;
                }

                if (poll.predictionStatus === 'failed' || poll.predictionStatus === 'error' || poll.predictionStatus === 'canceled') {
                  sendEvent({ error: poll.message || 'Generation failed.' });
                  controller.close();
                  return;
                }
              }

              sendEvent({ error: finalStatus ? `Timed out while waiting for provider status (${finalStatus}).` : 'Timed out while waiting for provider status.' });
              controller.close();
              return;
            }

            sendEvent({
              done: true,
              model: String(first.metadata?.model || first.metadata?.provider || 'deterministic-router'),
              provider: first.metadata?.provider,
              predictionStatus: first.predictionStatus,
              predictionId: first.predictionId,
            });
            controller.close();
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Stream setup failed';
            sendEvent({ error: message });
            controller.close();
          }
        })();
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
