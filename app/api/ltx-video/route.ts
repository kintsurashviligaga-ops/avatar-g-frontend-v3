import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const LTX_BASE = 'https://api.ltx.video';

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      model = 'ltx-2-3-fast',
      resolution = '1920x1080',
      duration = 6,
      fps = 24,
      generate_audio = false,
    } = await req.json();

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'No prompt provided' }, { status: 400 });
    }

    const apiKey = process.env.LTX_VIDEO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'LTX Video API key not configured' }, { status: 500 });
    }

    const ltxRes = await fetch(`${LTX_BASE}/v1/text-to-video`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, model, resolution, duration, fps, generate_audio }),
    });

    if (!ltxRes.ok) {
      const errText = await ltxRes.text();
      console.error('[ltx-video] API error', ltxRes.status, errText);
      return NextResponse.json(
        { error: `LTX API error ${ltxRes.status}`, detail: errText },
        { status: ltxRes.status }
      );
    }

    const videoBuffer = await ltxRes.arrayBuffer();
    const videoBase64 = Buffer.from(videoBuffer).toString('base64');

    return NextResponse.json({ video: videoBase64 });
  } catch (err) {
    console.error('[ltx-video]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
