import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min: generation (~30-90s) + transfer time

const LTX_BASE = 'https://api.ltx.video';

// Validated resolutions per model family (from LTX API docs)
const LTX_SUPPORTED_RESOLUTIONS: Record<string, string[]> = {
  'ltx-2-3-fast': ['1920x1080', '1080x1920', '2560x1440', '3840x2160'],
  'ltx-2-3-pro':  ['1920x1080', '1080x1920', '2560x1440', '3840x2160'],
  'ltx-2-fast':   ['1920x1080', '2560x1440'],
  'ltx-2-pro':    ['1920x1080', '2560x1440'],
};

function parseLtxError(text: string): string {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const err = parsed.error as Record<string, unknown> | undefined;
    if (err?.message && typeof err.message === 'string') return err.message;
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    // Not JSON — return as-is if short enough
  }
  return text.length > 200 ? text.slice(0, 200) + '…' : text;
}

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      model = 'ltx-2-3-fast',
      resolution = '1920x1080',
      duration = 6,
      fps = 24,
    } = await req.json();

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'No prompt provided' }, { status: 400 });
    }

    const apiKey = process.env.LTX_VIDEO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'LTX Video API key not configured' }, { status: 500 });
    }

    // Validate resolution for chosen model
    const supported = LTX_SUPPORTED_RESOLUTIONS[model] ?? ['1920x1080'];
    if (!supported.includes(resolution)) {
      return NextResponse.json(
        { error: `Resolution ${resolution} is not supported by model ${model}. Supported: ${supported.join(', ')}` },
        { status: 400 },
      );
    }

    const ltxRes = await fetch(`${LTX_BASE}/v1/text-to-video`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, model, resolution, duration, fps, generate_audio: false }),
    });

    if (!ltxRes.ok) {
      const errText = await ltxRes.text();
      const message = parseLtxError(errText);
      console.error('[ltx-video] API error', ltxRes.status, message);
      return NextResponse.json(
        { error: message },
        { status: ltxRes.status >= 400 && ltxRes.status < 600 ? ltxRes.status : 500 },
      );
    }

    // Forward the video stream directly — LTX returns video/mp4 synchronously
    return new Response(ltxRes.body, {
      headers: {
        'Content-Type': ltxRes.headers.get('content-type') || 'video/mp4',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[ltx-video]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
