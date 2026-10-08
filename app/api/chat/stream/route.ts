/**
 * POST /api/chat/stream
 * Streaming chat endpoint (the service widgets, Matilda voice chat, ChatShell / UniversalChat).
 * Returns Server-Sent Events: `{token}` chunks, then `{done}` or `{error}`.
 *
 * Same rules as the product chat (/api/chat/gemini), because it spends the same key:
 *   • sign-in required (mustSignInToChat → 401; FILM_ALLOW_ANONYMOUS=1 re-opens it for a demo deployment);
 *   • the per-account daily chat allowance (CHAT_USER, keyed on the verified uid — IP rotation buys nothing);
 *   • Google only while AI_GOOGLE_ONLY is on (the default) — the Anthropic leg runs only when it is off;
 *   • the text leg streams through lib/ai/google/chatStream (current model chain, typed errors — the old loop read
 *     `textStream`, which in ai@6 swallows error parts, and still rotated through retired gemini-2.0 ids);
 *   • provider wording never reaches the browser — a generic, localized notice does.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { ChatMessage } from '@/lib/ai/chatEngine';
import { getAuthContext, checkDailyBudget, sanitizePrompt } from '@/lib/security/apiGuard';
import { detectIntent } from '@/lib/chat/intentDetector';
import { orchestrate, pollOrchestrationTask } from '@/lib/chat/providerRouter';
import { agentGSystemPrompt } from '@/lib/agent-g-orchestrator';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { chatBudgetAllows, bookChatUsage, BUDGET_EXHAUSTED_MESSAGE } from '@/lib/services/billing/chatBudget';
import { mustSignInToChat, signInToGenerateBody } from '@/lib/auth/generationGate';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isAiGoogleOnly } from '@/lib/ai/google/policy';
import { chatModelChain } from '@/lib/ai/google/models';
import { streamGeminiChat, unbookedAttempts } from '@/lib/ai/google/chatStream';
import { resolveAgentProfile, toGeminiChatConfig } from '@/lib/agents/profile';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';

type Loc = 'ka' | 'en' | 'ru';
const locOf = (req: NextRequest, hint?: string): Loc => {
  const h = (hint || req.headers.get('accept-language') || '').toLowerCase();
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
const hasTokens = (u?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }): boolean =>
  !!u && ((u.inputTokens ?? 0) > 0 || (u.outputTokens ?? 0) > 0 || (u.totalTokens ?? 0) > 0);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Match the other chat streaming routes — without this, Vercel kills the
// function at the default ~15s and the stream returns FUNCTION_INVOCATION_TIMEOUT.
export const maxDuration = 60;

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
  const rl = await checkRateLimit(req, RATE_LIMITS.READ);
  if (rl) return rl;

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

    // Auth — a verified session (cookie, then bearer), refused before anything is spent.
    const loc = locOf(req, 'language' in parsedData ? parsedData.language : undefined);
    const auth = await getAuthContext();
    const verifiedId = auth?.userId
      ?? (await authedClientFromRequest(req).catch(() => ({ user: null }))).user?.id
      ?? null;
    if (mustSignInToChat(verifiedId)) {
      return new Response(JSON.stringify({ ...signInToGenerateBody(loc), message: SIGN_IN_TO_CHAT[loc] }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // 'anonymous' only survives the gate on a demo deployment (FILM_ALLOW_ANONYMOUS=1).
    const userId = verifiedId || 'anonymous';
    if (verifiedId) {
      const capped = await checkRateLimitByKey(verifiedId, RATE_LIMITS.CHAT_USER);
      if (capped) return capped;
      const budget = checkDailyBudget(verifiedId);
      if (!budget.allowed) {
        return new Response(JSON.stringify({ error: 'Daily AI limit reached' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if ('messages' in parsedData) {
      const agentId = parsedData.agentId;
      const sessionId = parsedData.sessionId;
      const messages = parsedData.messages;

      // BUDGET GATE (§2.1.1) — refuse before any provider is touched.
      const budgetText = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
      if (!(await chatBudgetAllows(budgetText))) {
        return new Response(BUDGET_EXHAUSTED_MESSAGE, {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      // Sanitize last user message
      const sanitizedMessages = messages.map((m, i) =>
        i === messages.length - 1 && m.role === 'user' ? { ...m, content: sanitizePrompt(m.content) } : m
      );

      const encoder = new TextEncoder();
      const sessionForStream = sessionId || `stream_${Date.now()}`;
      const chatMessages: ChatMessage[] = sanitizedMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));
      // Strip any system messages — the SDK takes the system prompt as a
      // separate `system` parameter; passing role: 'system' in messages would
      // be rejected by Gemini.
      const userAssistantMessages = chatMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // One profile and one prompt per request: the prompt says whether this turn has Google Search, and carries
      // today's date in Tbilisi (lib/chat/platformPrompt).
      const profile = resolveAgentProfile({});
      const systemPrompt = agentGSystemPrompt({ locale: loc, googleSearch: profile.googleSearch });

      const stream = new ReadableStream({
        async start(controller) {
          const startTime = Date.now();
          const send = (payload: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

          let lastError: string | undefined;
          let succeeded = false;
          let streamedAny = false;

          // Gemini — the product chain with typed errors (rotation only before the first token).
          const result = await streamGeminiChat({
            apiKey: resolveGeminiKey(),
            models: chatModelChain('standard'),
            messages: userAssistantMessages,
            config: toGeminiChatConfig(profile, systemPrompt),
            abortSignal: req.signal,
            onFrame: (frame) => {
              if ('text' in frame && frame.text) { streamedAny = true; send({ token: frame.text }); }
            },
          });
          if (result.model && (hasTokens(result.usage) || result.text.length > 0)) {
            void bookChatUsage({
              model: result.model,
              ...result.usage,
              chars: result.text.length,
              inputChars: systemPrompt.length + budgetText.length,
              userId: verifiedId,
              groundingQueries: result.groundingQueries ?? 0,
            });
          }
          for (const a of unbookedAttempts(result)) {
            void bookChatUsage({
              model: a.model, ...a.usage, inputChars: systemPrompt.length + budgetText.length,
              userId: verifiedId, groundingQueries: a.groundingQueries ?? 0,
            });
          }
          if (result.ok && result.model) {
            send({
              done: true,
              model: result.model,
              provider: 'gemini',
              agentId,
              sessionId: sessionForStream,
              durationMs: Date.now() - startTime,
            });
            succeeded = true;
          } else {
            lastError = result.error ? `${result.error.code}: ${result.error.message}` : 'no result';
            console.warn(`[chat/stream] Gemini failed — ${lastError.slice(0, 200)}`);
          }

          // Anthropic fallback ONLY when Google-only is off, and never after a partial Gemini answer (it would
          // restart the reply mid-sentence in another voice).
          if (!succeeded && !streamedAny && !isAiGoogleOnly()) {
            const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
            if (anthropicKey) {
              try {
                const anthropic = createAnthropic({ apiKey: anthropicKey });
                const result = streamText({
                  model: anthropic('claude-haiku-4-5-20251001'),
                  system: agentGSystemPrompt({ locale: loc, googleSearch: false }), // no search tool on this leg
                  messages: userAssistantMessages,
                  maxOutputTokens: 2048,
                  temperature: 0.7,
                  maxRetries: 0,
                });
                for await (const chunk of result.textStream) {
                  send({ token: chunk });
                }
                send({
                  done: true,
                  model: 'claude-haiku-4-5',
                  provider: 'anthropic',
                  agentId,
                  sessionId: sessionForStream,
                  durationMs: Date.now() - startTime,
                });
                succeeded = true;
              } catch (err) {
                lastError = err instanceof Error ? err.message.slice(0, 200) : String(err);
                console.error('[chat/stream] Anthropic also failed:', lastError);
              }
            }
          }

          if (!succeeded) {
            // The diagnostic stays in the server log; the browser gets a generic, localized notice.
            send({ error: UNAVAILABLE[loc] });
          }
          controller.close();
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
              locale: parsedData.language || 'ka',
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
            console.error('[chat/stream] orchestrate failed:', error instanceof Error ? error.message.slice(0, 200) : String(error));
            sendEvent({ error: UNAVAILABLE[loc] });
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
