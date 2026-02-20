import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';

export const dynamic = 'force-dynamic';

const schema = z.object({
  text: z.string().min(1).max(8000),
  voiceStyle: z.string().default('default'),
});

export async function POST(request: NextRequest) {
  try {
    const payload = schema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid TTS payload');

    const fakeAudio = Buffer.from(payload.data.text, 'utf8').toString('base64');

    return apiSuccess({
      provider: 'mock-tts',
      voiceStyle: payload.data.voiceStyle,
      audioDataUrl: `data:audio/wav;base64,${fakeAudio}`,
      length: payload.data.text.length,
    });
  } catch (error) {
    return apiError(error, 500, 'TTS generation failed');
  }
}
