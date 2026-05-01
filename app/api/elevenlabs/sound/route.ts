import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'ELEVENLABS_API_KEY not configured' }, { status: 500 });
  }

  const body = await req.json() as { prompt?: string; duration?: number };
  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
  }

  const duration = Math.min(body.duration ?? 22, 22);

  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: prompt.slice(0, 450),
      duration_seconds: duration,
      prompt_influence: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ success: false, error: `ElevenLabs Sound ${res.status}: ${err}` }, { status: 502 });
  }

  const audioBuffer = await res.arrayBuffer();
  const audio = Buffer.from(audioBuffer).toString('base64');
  return NextResponse.json({ success: true, audio });
}
