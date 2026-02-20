import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';

export const dynamic = 'force-dynamic';

const jsonSchema = z.object({
  audioBlobRef: z.string().min(1),
  hint: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const hint = String(form.get('hint') || '');
      const audio = form.get('audio');
      const transcript = hint.trim() || (audio ? 'Voice command received from web microphone.' : 'No audio provided.');
      return apiSuccess({ transcript, provider: 'mock-stt' });
    }

    const payload = jsonSchema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid transcribe payload');

    return apiSuccess({
      transcript: payload.data.hint || `Transcribed audio from ${payload.data.audioBlobRef}`,
      provider: 'mock-stt',
    });
  } catch (error) {
    return apiError(error, 500, 'Transcription failed');
  }
}
