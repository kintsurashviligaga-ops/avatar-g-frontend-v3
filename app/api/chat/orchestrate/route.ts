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
import { randomUUID } from 'crypto';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { sanitizePrompt } from '@/lib/security/apiGuard';
import { orchestrate, pollOrchestrationTask, type ChatResponse } from '@/lib/chat/providerRouter';
import { detectIntent } from '@/lib/chat/intentDetector';
import { retrieveContext } from '@/lib/rag/retrieve';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Synchronous provider kickoffs (HeyGen avatar, LTX video) can take 12–150s.
// Without this the route hits the ~15s platform default and 504s mid-handshake
// (matches the maxDuration the other media routes already declare).
export const maxDuration = 300;

// ─── Request validation ──────────────────────────────────────────────────────

const orchestrateSchema = z.object({
  // ── Core fields ──
  // Optional at the schema level: a POLL request sends ONLY { predictionId,
  // sessionId } and carries no message. A `.refine` below requires `message`
  // for the dispatch path. (Previously this was required outright, so every
  // poll — which the whole film/video render loop depends on — 400'd with
  // "Invalid request" and the UI froze at "processing" forever.)
  message: z.string().min(1).max(4000).optional(),
  sessionId: z.string().optional(),
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
  // PHASE 45 §2/§3 — 1–3 multimodal reference images (data:/https URLs) that lock
  // the protagonist's identity across the 30-second film. Capped server-side.
  referenceImages: z.array(z.string().min(1)).max(3).optional(),
  // Frame orientation for the 30-second film — drives the per-clip aspect ratio
  // so the stitched cut keeps ONE shape (was always 9:16 regardless of choice).
  orientation: z.enum(['landscape', 'vertical']).optional(),
  // Approved storyboard frames (ordered by scene) → per-scene identity anchors so
  // the rendered film matches the storyboard the user reviewed. Capped at 8.
  sceneFrames: z.array(z.string().min(1)).max(8).optional(),
  // Approved LLM story scenes (ordered) → the clips render from these exact scenes.
  sceneScripts: z.array(z.string().min(1).max(2000)).max(8).optional(),
  // Verbatim dialogue the user typed in the video panel → spoken as the film's voice.
  narrationScript: z.string().max(2000).optional(),

  // ── Personalization (Settings → Custom Instructions) ──
  customInstructions: z.string().max(2000).optional(),

  // ── RAG (Retrieval-Augmented Generation) ──
  // When true AND the message is a text question, ground the answer in the
  // Supabase pgvector corpus. Fail-safe: if RAG is unconfigured / empty, this
  // is a silent no-op (see lib/rag/retrieve.ts).
  useRag: z.boolean().default(false),

  // ── Polling ──
  predictionId: z.string().optional(),

  // ── Metadata ──
  serviceId: z.string().optional(),
  demoMode: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
}).refine(
  // Dispatch needs a message; a poll needs a predictionId. Require exactly one
  // of those entry points so neither a blank dispatch nor a malformed poll slips
  // through, while a normal { predictionId } poll is accepted.
  (d) => Boolean(d.predictionId) || Boolean(d.message && d.message.trim().length > 0),
  { message: 'message is required', path: ['message'] },
);

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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

    // Poll path skips budget (we already paid on the initial request).
    const gate = await applyApiGuards(req, {
      limit: data.predictionId ? RATE_LIMITS.READ : RATE_LIMITS.WRITE,
      skipBudget: !!data.predictionId,
      label: 'chat.orchestrate',
    });
    if (gate.response) return gate.response;

    // ── Poll path (check status of running prediction) ───────────────
    if (data.predictionId) {
      return handlePoll(data.predictionId, data.sessionId);
    }

    const userId = gate.auth?.userId || 'anonymous';

    // Guaranteed present here: the poll path returned above, and the schema
    // refine requires `message` whenever there's no predictionId. The `?? ''`
    // just satisfies the optional type without a non-null assertion.
    const rawMessage = (data.message ?? '').trim();
    const detectedIntent = detectIntent(rawMessage, data.serviceContext);
    const preservePrompt = detectedIntent.intent === 'image_generation'
      || detectedIntent.intent === 'photo_edit'
      || detectedIntent.intent === 'video_generation'
      || detectedIntent.intent === 'avatar_generation';

    // Keep generation prompts untouched to preserve deterministic prompt-to-payload mapping.
    const routedMessage = preservePrompt ? rawMessage : sanitizePrompt(rawMessage);
    const sessionId = data.sessionId || `session_${userId}_${randomUUID()}`;

    // ── Demo mode fallback ───────────────────────────────────────────
    if (data.demoMode) {
      const detected = detectIntent(routedMessage, data.serviceContext);
      return NextResponse.json({
        success: true,
        intent: detected.intent,
        responseType: detected.provider === 'replicate' ? mapOutputType(data.serviceContext) : 'text',
        message: `[Demo] Request received: "${routedMessage.slice(0, 80)}…"`,
        metadata: { provider: 'demo', confidence: detected.confidence },
      } satisfies ChatResponse);
    }

    // ── RAG grounding (optional, fail-safe) ──────────────────────────
    // Only for text questions — never alter deterministic generation prompts.
    // retrieveContext() never throws and returns '' when RAG is off/empty, so
    // a failure degrades to an ungrounded answer instead of breaking the chat.
    let effectiveInstructions = data.customInstructions;
    if (data.useRag && detectedIntent.intent === 'text_chat') {
      const ragContext = await retrieveContext(routedMessage, { locale: data.locale });
      if (ragContext) {
        effectiveInstructions = [ragContext, data.customInstructions]
          .filter(Boolean)
          .join('\n\n');
      }
    }

    // ── Orchestrate (direct in-process calls, no HTTP self-fetch) ──
    const response = await orchestrate({
      message: routedMessage,
      serviceContext: data.serviceContext,
      agentId: data.agentId || '',
      userId,
      sessionId,
      locale: data.locale,
      history: data.history,
      selectedOptions: data.selectedOptions,
      imageUrl: data.imageUrl,
      // PHASE 45 §2/§3 — forward reference images + frame orientation via metadata
      // so the film composite (handleFilmComposite) threads them into the identity
      // lock and the per-clip aspect ratio.
      metadata: (data.referenceImages?.length || data.orientation || data.sceneFrames?.length || data.sceneScripts?.length || data.narrationScript)
        ? {
            ...(data.metadata || {}),
            ...(data.referenceImages?.length ? { referenceImages: data.referenceImages } : {}),
            ...(data.orientation ? { orientation: data.orientation } : {}),
            ...(data.sceneFrames?.length ? { sceneFrames: data.sceneFrames } : {}),
            ...(data.sceneScripts?.length ? { sceneScripts: data.sceneScripts } : {}),
            ...(data.narrationScript ? { narrationScript: data.narrationScript } : {}),
          }
        : data.metadata,
      customInstructions: effectiveInstructions,
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

    // Surface the underlying provider/config error (mirrors the 429 branch).
    // Without this the cause is swallowed and a missing key (e.g.
    // LTX_VIDEO_API_KEY / WORLDLABS_API_KEY) is indistinguishable from a bug.
    const isConfigError = /not configured|missing|no route matched|unauthor|invalid api key/i.test(message);
    return NextResponse.json(
      {
        success: false,
        intent: 'text_chat',
        responseType: 'text',
        message: isConfigError
          ? 'This service is temporarily unavailable (provider not configured).'
          : 'Something went wrong. Please try again.',
        metadata: { provider: 'system', error: message },
      } satisfies ChatResponse,
      { status: 500 },
    );
  }
}

// ─── Poll handler ────────────────────────────────────────────────────────────

async function handlePoll(predictionId: string, sessionId?: string) {
  try {
    const result = await pollOrchestrationTask(predictionId, sessionId);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Poll failed';
    return NextResponse.json({
      success: false,
      intent: 'text_chat',
      responseType: 'text',
      message: msg,
      predictionId,
      predictionStatus: 'error',
      metadata: { provider: 'system' },
    } satisfies ChatResponse, { status: 500 });
  }
}

function mapOutputType(context: string): ChatResponse['responseType'] {
  if (['avatar', 'image', 'photo', 'interior'].includes(context)) return 'image';
  if (context === 'video' || context === 'editing') return 'video';
  if (context === 'music') return 'audio';
  if (context === 'visual-ai' || context === 'visual-intel') return 'analysis';
  return 'text';
}
