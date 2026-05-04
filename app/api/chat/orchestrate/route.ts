/**
 * app/api/chat/orchestrate/route.ts
 * ==================================
 * Unified chat orchestration endpoint.
 *
 * User Input → Intent Detection → Provider Routing → Normalized Response
 *
 * Supports:
 *  - Pure text chat (routed to OpenAI via chatEngine)
 *  - Media generation (routed to Replicate)
 *  - Polling for async generation results
 *
 * All chatboxes across the platform call this single endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { getAuthContext, checkDailyBudget, sanitizePrompt } from '@/lib/security/apiGuard';
import { orchestrate, type ChatResponse } from '@/lib/chat/providerRouter';
import { pollPrediction } from '@/lib/replicate/client';
import { detectIntent } from '@/lib/chat/intentDetector';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ─── Request validation ──────────────────────────────────────────────────────

const orchestrateSchema = z.object({
  // ── Core fields ──
  message: z.string().min(1).max(4000),
  serviceContext: z.string().default('global'),
  agentId: z.string().optional(),
  locale: z.string().default('en'),

  // ── Conversation ──
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).default([]),

  // ── Generation options ──
  selectedOptions: z.record(z.string()).optional(),
  imageUrl: z.string().url().optional(),

  // ── Polling ──
  predictionId: z.string().optional(),

  // ── Metadata ──
  serviceId: z.string().optional(),
  demoMode: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Rate limit
  const rateLimitError = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (rateLimitError) return rateLimitError;

  try {
    const body = await req.json();
    const parsed = orchestrateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // ── Poll path (check status of running prediction) ───────────────
    if (data.predictionId) {
      return handlePoll(data.predictionId, data.serviceContext);
    }

    // ── Auth ─────────────────────────────────────────────────────────
    const auth = await getAuthContext();
    const userId = auth?.userId || 'anonymous';

    if (auth) {
      const budget = checkDailyBudget(auth.userId);
      if (!budget.allowed) {
        return NextResponse.json({
          success: false,
          intent: 'text_chat',
          responseType: 'text',
          message: `Daily limit of ${budget.limit} requests reached. Resets in 24h.`,
          metadata: { provider: 'system' },
        }, { status: 429 });
      }
    }

    // Sanitize input
    const sanitizedMessage = sanitizePrompt(data.message);

    // ── Demo mode fallback ───────────────────────────────────────────
    if (data.demoMode) {
      const detected = detectIntent(sanitizedMessage, data.serviceContext);
      return NextResponse.json({
        success: true,
        intent: detected.intent,
        responseType: detected.provider === 'replicate' ? mapOutputType(data.serviceContext) : 'text',
        message: `[Demo] Request received: "${sanitizedMessage.slice(0, 80)}…"`,
        metadata: { provider: 'demo', confidence: detected.confidence },
      } satisfies ChatResponse);
    }

    // ── Orchestrate (direct in-process calls, no HTTP self-fetch) ──
    const response = await orchestrate({
      message: sanitizedMessage,
      serviceContext: data.serviceContext,
      agentId: data.agentId || '',
      userId,
      sessionId: `session_${userId}_${Date.now()}`,
      locale: data.locale,
      history: data.history,
      selectedOptions: data.selectedOptions,
      imageUrl: data.imageUrl,
      metadata: data.metadata,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Orchestrate Error]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Detect throttle / quota errors
    if (/429|rate.limit|quota|thrott/i.test(message)) {
      return NextResponse.json({
        success: false,
        intent: 'text_chat',
        responseType: 'text',
        message: 'Service temporarily rate-limited. Please retry shortly.',
        metadata: { provider: 'system', error: message },
      } satisfies ChatResponse);
    }

    return NextResponse.json(
      {
        success: false,
        intent: 'text_chat',
        responseType: 'text',
        message: 'Something went wrong. Please try again.',
        metadata: { provider: 'system' },
      } satisfies ChatResponse,
      { status: 500 },
    );
  }
}

// ─── Poll handler ────────────────────────────────────────────────────────────

async function handlePoll(predictionId: string, serviceContext: string) {
  try {
    const result = await pollPrediction(predictionId);

    if (result.status === 'succeeded') {
      const output = result.output;
      const outputUrl = extractOutputUrl(output);
      const outputText = typeof output === 'string' ? output :
        Array.isArray(output) && typeof output[0] === 'string' && !output[0].startsWith('http') ? output[0] : undefined;

      return NextResponse.json({
        success: true,
        intent: 'text_chat' as const,
        responseType: mapOutputType(serviceContext),
        message: outputText || 'Generation complete.',
        assetUrl: outputUrl,
        predictionId,
        predictionStatus: 'succeeded',
        metadata: { provider: 'replicate', durationMs: result.metrics?.predict_time ? result.metrics.predict_time * 1000 : undefined },
      } satisfies ChatResponse);
    }

    if (result.status === 'failed') {
      return NextResponse.json({
        success: false,
        intent: 'text_chat',
        responseType: 'text',
        message: result.error || 'Generation failed.',
        predictionId,
        predictionStatus: 'failed',
        metadata: { provider: 'replicate' },
      } satisfies ChatResponse);
    }

    // Still processing
    return NextResponse.json({
      success: true,
      intent: 'text_chat',
      responseType: 'text',
      message: 'Still processing…',
      predictionId,
      predictionStatus: result.status,
      metadata: { provider: 'replicate' },
    } satisfies ChatResponse);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Poll failed';
    return NextResponse.json({
      success: false,
      intent: 'text_chat',
      responseType: 'text',
      message: msg,
      predictionId,
      predictionStatus: 'error',
      metadata: { provider: 'replicate' },
    } satisfies ChatResponse, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractOutputUrl(output: unknown): string | null {
  if (typeof output === 'string' && output.startsWith('http')) return output;
  if (Array.isArray(output)) {
    const first = output[0];
    if (typeof first === 'string' && first.startsWith('http')) return first;
  }
  return null;
}

function mapOutputType(context: string): ChatResponse['responseType'] {
  if (['avatar', 'image', 'photo'].includes(context)) return 'image';
  if (context === 'video' || context === 'editing') return 'video';
  if (context === 'music') return 'audio';
  if (context === 'visual-ai' || context === 'visual-intel') return 'analysis';
  return 'text';
}
