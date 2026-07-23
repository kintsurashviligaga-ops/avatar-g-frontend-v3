import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { synthesizeSpeechChunk } from '@/lib/voice-v2v/providers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  text: z.string().min(1).max(8000),
  voiceStyle: z.string().default('default'),
  language: z.enum(['ka-GE', 'en-US', 'ru-RU']).default('ka-GE'),
});

export async function POST(request: NextRequest) {
  // WS2 — paid TTS (ElevenLabs/Cartesia) for the telephony call flow. This is a server-to-server sub-route
  // (no user session), so it's gated by the internal worker token (same convention as app/worker/tick,
  // growth/*). Fail-closed: with WORKER_INTERNAL_TOKEN unset the route rejects all calls — was anonymous.
  const internalToken = request.headers.get('x-internal-worker-token');
  if (!process.env.WORKER_INTERNAL_TOKEN || internalToken !== process.env.WORKER_INTERNAL_TOKEN) {
    return apiError(new Error('unauthorized'), 401, 'Unauthorized');
  }
  try {
    const payload = schema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid TTS payload');

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
