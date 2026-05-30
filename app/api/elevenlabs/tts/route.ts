import { NextRequest, NextResponse } from 'next/server';
import {
  selectTtsModel,
  voiceSettingsForModel,
  type ElevenLabsModelId,
} from '@/lib/audio/tts-model';

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

// Progressive: hit the ElevenLabs /stream endpoint with low-latency optimization
// and PIPE the chunked body straight through — first audio bytes reach the client
// far sooner than buffering the whole file. Consumers that need a blob/arrayBuffer
// (blob playback, MCP) still work; consumers that support MSE play progressively.
async function streamElevenLabs(
  text: string,
  voiceId: string,
  apiKey: string,
  modelId: ElevenLabsModelId,
): Promise<NextResponse | null> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=3`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: text.slice(0, 5000),
      // PHASE 48 §3 — model is chosen per-language. Georgian MUST run on
      // eleven_multilingual_v2 (stable Georgian phonemes); turbo is English-first
      // and mangles Georgian. Settings are tuned to match the selected model.
      model_id: modelId,
      voice_settings: voiceSettingsForModel(modelId),
      apply_text_normalization: 'auto',
    }),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => '');
    console.error('[elevenlabs/tts] ElevenLabs error', res.status, errBody.slice(0, 200));
    return null;
  }

  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'X-Voice-Provider': 'elevenlabs',
      'X-Voice-Model': modelId,
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
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
  // Georgian text/locale → the dedicated premium Georgian voice (trained on
  // ElevenLabs) when configured; otherwise the default voice. An explicit
  // body.voiceId always wins.
  const isGeorgian = body.locale === 'ka' || /[ა-ჿ]/.test(text);
  const georgianVoiceId = process.env.ELEVENLABS_GEORGIAN_VOICE_ID;
  const voiceId = body.voiceId
    ?? body.voice_id
    ?? (isGeorgian && georgianVoiceId ? georgianVoiceId : undefined)
    ?? process.env.ELEVENLABS_VOICE_ID
    ?? 'vWpzdSR8GpLUKR0ai8Li';

  // PHASE 48 §3 — hard-force eleven_multilingual_v2 when the text/locale is
  // Georgian; everything else keeps the low-latency turbo default.
  const modelId = selectTtsModel(text, body.locale);

  // Primary: ElevenLabs (progressive streaming — minimal time-to-first-sound)
  if (apiKey) {
    const streamed = await streamElevenLabs(text, voiceId, apiKey, modelId);
    if (streamed) return streamed;
  }

  // Fallback: Google TTS (uses Gemini key, works for Georgian natively)
  const googleAudio = await synthesizeWithGoogleTTS(text);
  if (googleAudio) return audioResponse(googleAudio, 'google-tts');

  return NextResponse.json({ error: 'No TTS provider available' }, { status: 502 });
}
