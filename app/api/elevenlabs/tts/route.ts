import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface TtsRequest {
  text?: string;
  voiceId?: string;
  voice_id?: string; // accept both naming conventions
}

type TtsResult = { audio: string; provider: string } | { error: string };

async function synthesizeWithOpenAI(text: string): Promise<TtsResult> {
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

// Google Cloud TTS — uses the same Google project key as Gemini and has a
// generous free tier (~1M chars/month). Also handles Georgian (ka-GE) natively.
async function synthesizeWithGoogleTTS(text: string): Promise<TtsResult> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
  if (!apiKey) return { error: 'no GEMINI_API_KEY' };

  const isGeorgian = /[ა-ჿ]/.test(text);
  const isRussian = /[Ѐ-ӿ]/.test(text);
  const languageCode = isGeorgian ? 'ka-GE' : isRussian ? 'ru-RU' : 'en-US';
  const voiceName = isGeorgian
    ? 'ka-GE-Standard-A'
    : isRussian
      ? 'ru-RU-Standard-A'
      : 'en-US-Neural2-C';

  try {
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
      const errBody = await response.text().catch(() => '');
      return { error: `Google TTS HTTP ${response.status}: ${errBody.slice(0, 160)}` };
    }

    const data = (await response.json()) as { audioContent?: string };
    if (!data.audioContent) {
      return { error: 'Google TTS returned no audioContent' };
    }
    // audioContent is already base64-encoded MP3 — pass through directly.
    return { audio: data.audioContent, provider: 'google-tts-fallback' };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : 'unknown error';
    console.error('[/api/elevenlabs/tts] Google TTS fallback failed:', msg);
    return { error: msg };
  }
}

// Try OpenAI, then Google TTS in order. Returns the first successful synthesis,
// or all collected errors if both fail.
async function tryFallbackChain(
  text: string,
): Promise<
  { audio: string; provider: string } | { errors: { openai: string; google: string } }
> {
  const openaiResult = await synthesizeWithOpenAI(text);
  if ('audio' in openaiResult) return openaiResult;

  const googleResult = await synthesizeWithGoogleTTS(text);
  if ('audio' in googleResult) return googleResult;

  return {
    errors: {
      openai: openaiResult.error,
      google: googleResult.error,
    },
  };
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

      // 401 missing_permissions or any 5xx → run the full fallback chain.
      if (isPermissionError || res.status >= 500) {
        console.warn(`[/api/elevenlabs/tts] ElevenLabs ${res.status} — running fallback chain`);
        const fallback = await tryFallbackChain(text);
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
              openai: fallback.errors.openai,
              google: fallback.errors.google,
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
      console.error('[/api/elevenlabs/tts] ElevenLabs network error — running fallback chain:', err);
      const fallback = await tryFallbackChain(text);
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
            openai: fallback.errors.openai,
            google: fallback.errors.google,
          },
        },
        { status: 502 },
      );
    }
  }

  // No ElevenLabs key — go straight to OpenAI → Google chain
  const fallback = await tryFallbackChain(text);
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
      diagnostics: {
        elevenlabs: 'no API key',
        openai: fallback.errors.openai,
        google: fallback.errors.google,
      },
    },
    { status: 503 },
  );
}
