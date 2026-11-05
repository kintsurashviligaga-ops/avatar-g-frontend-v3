import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { phoneCallsReady, phoneCallsUnavailableBody } from '@/lib/calls/availability';
import { chatBudgetAllows } from '@/lib/services/billing/chatBudget';
import { synthesizeSpeechChunk } from '@/lib/voice-v2v/providers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  text: z.string().min(1).max(8000),
  voiceStyle: z.string().default('default'),
  language: z.enum(['ka-GE', 'en-US', 'ru-RU']).default('ka-GE'),
});

/**
 * POST /api/agent-g/calls/tts — paid TTS (Google Cloud TTS, lib/voice-v2v/providers) for the telephony worker
 * (services/voice-v2v-node). A server-to-server route with no user session, so it is gated by the internal worker token
 * (same convention as app/worker/tick, growth/*), failing closed when WORKER_INTERNAL_TOKEN is unset.
 *
 * MASTER TASK v3.1 Phase 6: it was the one billable route with no platform budget check
 * (docs/master-v3.1/BILLABLE_ENTRYPOINTS.md), and it outlived its pipeline: no phone call can be placed
 * (lib/calls/availability.ts) and its sibling, the telephony STT (../transcribe), is retired. So while phoneCallsReady()
 * is false it refuses like every other phone-call route, before the body is read and with no provider call. When calls
 * open, the platform budget is asked first and fails closed, so a leaked token or a looping worker cannot spend past it.
 */
export async function POST(request: NextRequest) {
  const internalToken = request.headers.get('x-internal-worker-token');
  if (!process.env.WORKER_INTERNAL_TOKEN || internalToken !== process.env.WORKER_INTERNAL_TOKEN) {
    return apiError(new Error('unauthorized'), 401, 'Unauthorized');
  }
  if (!phoneCallsReady()) return NextResponse.json(phoneCallsUnavailableBody(), { status: 503 });

  try {
    const payload = schema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid TTS payload');

    // Platform budget pre-check, before any provider I/O. Fails CLOSED inside chatBudgetAllows: a guard fault is a 503.
    if (!(await chatBudgetAllows(payload.data.text))) {
      return NextResponse.json({ error: 'budget_exhausted' }, { status: 503 });
    }

    const synthesized = await synthesizeSpeechChunk({
      text: payload.data.text,
      language: payload.data.language,
    });

    return apiSuccess({
      provider: synthesized.provider,
      voiceStyle: payload.data.voiceStyle,
      audioDataUrl: `data:${synthesized.mimeType};base64,${synthesized.audioBase64}`,
      length: payload.data.text.length,
      mimeType: synthesized.mimeType,
      language: payload.data.language,
    });
  } catch (error) {
    return apiError(error, 500, 'TTS generation failed');
  }
}
