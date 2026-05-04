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
