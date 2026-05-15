import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

interface TtsRequest {
  text?: string;
  voiceId?: string;
  voice_id?: string;
  locale?: string;
}

function audioResponse(buffer: ArrayBuffer, provider: string): NextResponse {
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(buffer.byteLength),
      'X-Voice-Provider': provider,
      'Cache-Control': 'no-store',
    },
  });
}

async function synthesizeWithElevenLabs(text: string, voiceId: string, apiKey: string): Promise<ArrayBuffer | null> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: text.slice(0, 5000),
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.75,
        similarity_boost: 0.85,
        style: 0.25,
        use_speaker_boost: true,
        speed: 0.95,
      },
      apply_text_normalization: 'auto',
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('[elevenlabs/tts] ElevenLabs error', res.status, errBody.slice(0, 200));
    return null;
  }

  return res.arrayBuffer();
}

async function synthesizeWithGoogleTTS(text: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
  if (!apiKey) return null;

  const isGeorgian = /[ა-ჿ]/.test(text);
  const isRussian = /[Ѐ-ӿ]/.test(text);
  const languageCode = isGeorgian ? 'ka-GE' : isRussian ? 'ru-RU' : 'en-US';
  const voiceName = isGeorgian ? 'ka-GE-Standard-A' : isRussian ? 'ru-RU-Standard-A' : 'en-US-Neural2-C';

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: text.slice(0, 4000) },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    },
  );

  if (!response.ok) {
    console.error('[elevenlabs/tts] Google TTS error', response.status);
    return null;
  }

  const data = await response.json() as { audioContent?: string };
  if (!data.audioContent) return null;

  const binary = atob(data.audioContent);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as TtsRequest;
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = body.voiceId ?? body.voice_id ?? process.env.ELEVENLABS_VOICE_ID ?? 'vWpzdSR8GpLUKR0ai8Li';

  // Primary: ElevenLabs
  if (apiKey) {
    const audio = await synthesizeWithElevenLabs(text, voiceId, apiKey);
    if (audio) return audioResponse(audio, 'elevenlabs');
  }

  // Fallback: Google TTS (uses Gemini key, works for Georgian natively)
  const googleAudio = await synthesizeWithGoogleTTS(text);
  if (googleAudio) return audioResponse(googleAudio, 'google-tts');

  return NextResponse.json({ error: 'No TTS provider available' }, { status: 502 });
}
