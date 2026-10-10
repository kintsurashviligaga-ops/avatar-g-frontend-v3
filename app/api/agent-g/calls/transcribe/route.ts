import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { transcribeRealtimePcmChunk } from '@/lib/voice-v2v/providers';
import { isAiGoogleOnly } from '@/lib/ai/google/policy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const jsonSchema = z.object({
  audioBlobRef: z.string().min(1).optional(),
  audioBase64: z.string().min(1).max(35_000_000).optional(),
  language: z.enum(['ka-GE', 'en-US', 'ru-RU']).default('ka-GE'),
  hint: z.string().optional(),
  sampleRate: z.number().int().min(8000).max(48000).optional(),
  mimeType: z.string().optional(),
  isFinal: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  // WS2 — paid STT for the telephony call flow. Server-to-server sub-route (no user session) → gated by
  // the internal worker token (same convention as app/worker/tick, growth/*). Fail-closed: with
  // WORKER_INTERNAL_TOKEN unset the route rejects all calls — it was previously anonymous.
  const internalToken = request.headers.get('x-internal-worker-token');
  if (!process.env.WORKER_INTERNAL_TOKEN || internalToken !== process.env.WORKER_INTERNAL_TOKEN) {
    return apiError(new Error('unauthorized'), 401, 'Unauthorized');
  }
  // AI_GOOGLE_ONLY (on by default): this STT runs on OpenAI / Deepgram only, so it is refused before the body is read.
  if (isAiGoogleOnly()) return apiError(new Error('google_only'), 503, 'Speech-to-text runs on Google models only.');
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const hint = String(form.get('hint') || '');
      const language = String(form.get('language') || 'ka-GE');
      const audio = form.get('audio');

      if (audio && typeof audio !== 'string') {
        if (!audio.size || audio.size > 25_000_000) return apiError(new Error('invalid_audio_size'), 400, 'Invalid audio size');
        const mimeType = String(audio.type || 'audio/wav');
        const bytes = await audio.arrayBuffer();
        const audioBase64 = Buffer.from(bytes).toString('base64');

        const result = await transcribeRealtimePcmChunk({
          audioBase64,
          language: language === 'en-US' || language === 'ru-RU' || language === 'ka-GE' ? language : 'ka-GE',
          hint,
          mimeType,
        });

        return apiSuccess({
          transcript: result.text,
          provider: result.provider,
          isFinal: result.isFinal,
          confidence: result.confidence ?? null,
          language: language === 'en-US' || language === 'ru-RU' || language === 'ka-GE' ? language : 'ka-GE',
        });
      }

      return apiError(new Error('audio_missing'), 400, 'Audio data is required');
    }

    const payload = jsonSchema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid transcribe payload');

    const base64Audio = payload.data.audioBase64;
    if (!base64Audio) return apiError(new Error('audio_missing'), 400, 'Audio data is required');

    const result = await transcribeRealtimePcmChunk({
      audioBase64: base64Audio,
      language: payload.data.language,
      sampleRate: payload.data.sampleRate,
      hint: payload.data.hint,
      mimeType: payload.data.mimeType,
    });

    return apiSuccess({
      transcript: result.text,
      provider: result.provider,
      isFinal: result.isFinal,
      confidence: result.confidence ?? null,
      language: payload.data.language,
    });
  } catch (error) {
    return apiError(error, 500, 'Transcription failed');
  }
}
