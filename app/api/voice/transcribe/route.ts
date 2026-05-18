import { NextRequest, NextResponse } from 'next/server';
import { transcribeRealtimePcmChunk } from '@/lib/voice-v2v/providers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * /api/voice/transcribe — short-utterance speech-to-text for the chat mic.
 *
 * iOS Safari's SpeechRecognition is unreliable / off in many configurations,
 * so the chat falls back to recording a short blob via MediaRecorder and
 * POSTing it here. The route delegates to Whisper (openai-whisper-3-turbo)
 * via the existing voice-v2v provider abstraction.
 *
 * Request: multipart/form-data with:
 *   - audio:    Blob (audio/webm, audio/mp4, audio/wav, etc.)
 *   - language: optional 'ka-GE' | 'en-US' | 'ru-RU' (default 'ka-GE')
 *
 * Response: { text: string, provider: string }
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const audio = form.get('audio');
    const langInput = String(form.get('language') || 'ka-GE');
    const language: 'ka-GE' | 'en-US' | 'ru-RU' =
      langInput === 'en-US' || langInput === 'ru-RU' ? langInput : 'ka-GE';

    if (!audio || typeof audio === 'string') {
      return NextResponse.json({ error: 'audio is required' }, { status: 400 });
    }

    const bytes = await audio.arrayBuffer();
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: 'empty audio' }, { status: 400 });
    }
    if (bytes.byteLength > 25 * 1024 * 1024) {
      // Whisper's API hard limit is 25 MB. Keep the chat mic short.
      return NextResponse.json({ error: 'audio too large (25MB max)' }, { status: 413 });
    }

    const audioBase64 = Buffer.from(bytes).toString('base64');
    const mimeType = audio.type || 'audio/webm';

    const result = await transcribeRealtimePcmChunk({
      audioBase64,
      language,
      mimeType,
    });

    return NextResponse.json({
      text: result.text ?? '',
      provider: result.provider,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'transcription failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
