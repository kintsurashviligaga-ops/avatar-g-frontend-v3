import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { transcribeRealtimePcmChunk } from '@/lib/voice-v2v/providers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const jsonSchema = z.object({
  audioBlobRef: z.string().min(1).optional(),
  audioBase64: z.string().min(1).optional(),
  language: z.enum(['ka-GE', 'en-US', 'ru-RU']).default('ka-GE'),
  hint: z.string().optional(),
  sampleRate: z.number().int().min(8000).max(48000).optional(),
  mimeType: z.string().optional(),
  isFinal: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const hint = String(form.get('hint') || '');
      const language = String(form.get('language') || 'ka-GE');
      const audio = form.get('audio');

      if (audio && typeof audio !== 'string') {
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

      const transcript = hint.trim() || 'No audio provided.';
      return apiSuccess({ transcript, provider: 'mock-stt', isFinal: Boolean(transcript) });
    }

    const payload = jsonSchema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid transcribe payload');

    if (!payload.data.audioBase64 && !payload.data.audioBlobRef) {
      const transcript = String(payload.data.hint || '').trim();
      if (!transcript) {
        return apiError(new Error('audio_missing'), 400, 'Audio data is required');
      }

      return apiSuccess({
        transcript,
        provider: 'mock-stt',
        isFinal: Boolean(payload.data.isFinal ?? true),
        language: payload.data.language,
      });
    }

    const base64Audio = payload.data.audioBase64 || '';
    if (!base64Audio) {
      return apiSuccess({
        transcript: payload.data.hint || `Transcribed audio from ${payload.data.audioBlobRef || 'blob'}`,
        provider: 'mock-stt',
        isFinal: Boolean(payload.data.isFinal ?? true),
        language: payload.data.language,
      });
    }

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
