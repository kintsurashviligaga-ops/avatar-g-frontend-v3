import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface TtsRequest {
  text?: string;
  voiceId?: string;
  voice_id?: string; // accept both naming conventions
}

async function synthesizeWithOpenAI(
  text: string,
): Promise<{ audio: string; provider: string } | { error: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: 'no OPENAI_API_KEY' };

  try {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey });
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: text.slice(0, 4000),
      speed: 0.95,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    return { audio: buffer.toString('base64'), provider: 'openai-fallback' };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : 'unknown error';
    console.error('[/api/elevenlabs/tts] OpenAI fallback also failed:', msg);
    return { error: msg };
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as TtsRequest;
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = body.voiceId ?? body.voice_id ?? process.env.ELEVENLABS_VOICE_ID ?? 'vWpzdSR8GpLUKR0ai8Li';

  // Primary: ElevenLabs
  if (apiKey) {
    try {
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

      if (res.ok) {
        const audioBuffer = await res.arrayBuffer();
        const audio = Buffer.from(audioBuffer).toString('base64');
        return NextResponse.json(
          { success: true, audio, provider: 'elevenlabs' },
          { headers: { 'X-Voice-Provider': 'elevenlabs' } },
        );
      }

      const errBody = await res.text();
      const isPermissionError =
        res.status === 401 &&
        (errBody.includes('missing_permissions') || errBody.includes('text_to_speech'));

      // 401 missing_permissions or any 5xx → try OpenAI TTS fallback.
      if (isPermissionError || res.status >= 500) {
        console.warn(`[/api/elevenlabs/tts] ElevenLabs ${res.status} — falling back to OpenAI TTS`);
        const fallback = await synthesizeWithOpenAI(text);
        if ('audio' in fallback) {
          return NextResponse.json(
            { success: true, audio: fallback.audio, provider: fallback.provider },
            { headers: { 'X-Voice-Provider': fallback.provider } },
          );
        }
        return NextResponse.json(
          {
            success: false,
            error: 'No TTS provider available',
            diagnostics: {
              elevenlabs: `HTTP ${res.status}: ${errBody.slice(0, 200)}`,
              openai: fallback.error,
            },
          },
          { status: 502 },
        );
      }

      return NextResponse.json(
        { success: false, error: `ElevenLabs TTS ${res.status}: ${errBody}` },
        { status: 502 },
      );
    } catch (err) {
      console.error('[/api/elevenlabs/tts] ElevenLabs network error — trying OpenAI:', err);
      const fallback = await synthesizeWithOpenAI(text);
      if ('audio' in fallback) {
        return NextResponse.json(
          { success: true, audio: fallback.audio, provider: fallback.provider },
          { headers: { 'X-Voice-Provider': fallback.provider } },
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: 'No TTS provider available',
          diagnostics: {
            elevenlabs: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
            openai: fallback.error,
          },
        },
        { status: 502 },
      );
    }
  }

  // No ElevenLabs key — go straight to OpenAI fallback
  const fallback = await synthesizeWithOpenAI(text);
  if ('audio' in fallback) {
    return NextResponse.json(
      { success: true, audio: fallback.audio, provider: fallback.provider },
      { headers: { 'X-Voice-Provider': fallback.provider } },
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: 'No TTS provider configured',
      diagnostics: { elevenlabs: 'no API key', openai: fallback.error },
    },
    { status: 503 },
  );
}
