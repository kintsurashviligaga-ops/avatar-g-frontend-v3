import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'ELEVENLABS_API_KEY not configured' }, { status: 500 });
  }

  const body = await req.json() as { text?: string; voiceId?: string };
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 });
  }

  const voiceId = body.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? 'vWpzdSR8GpLUKR0ai8Li';

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
    const err = await res.text();
    return NextResponse.json({ success: false, error: `ElevenLabs TTS ${res.status}: ${err}` }, { status: 502 });
  }

  const audioBuffer = await res.arrayBuffer();
  const audio = Buffer.from(audioBuffer).toString('base64');
  return NextResponse.json({ success: true, audio });
}
