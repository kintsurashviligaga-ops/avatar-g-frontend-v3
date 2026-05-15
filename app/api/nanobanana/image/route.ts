import { NextRequest, NextResponse } from 'next/server';
import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import type { NanoBananaEndpoint } from '@/lib/nanobanana/endpoints';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Quality → NanoBanana endpoint mapping
const QUALITY_ENDPOINT: Record<string, NanoBananaEndpoint> = {
  standard: 'v2-1k',  //  ~1K, 8 credits
  high:     'v2-2k',  //  ~2K, 12 credits
  ultra:    'pro-4k', //  4K Pro, 24 credits
};

// Style suffix enrichment — same as replicate schemas
const STYLE_SUFFIXES: Record<string, string> = {
  'Photorealistic': 'photorealistic, 8k uhd, sharp focus, dslr photography',
  'Digital Art':    'digital art, vibrant colors, artstation, concept art, trending',
  'Oil Painting':   'oil painting, brushstrokes, classical fine art, canvas texture',
  'Watercolor':     'watercolor illustration, soft flowing colors, paper texture, delicate washes',
  'Anime':          'anime style, manga, cel shaded, studio ghibli quality, clean line art',
  'Sketch':         'detailed pencil sketch, graphite drawing, fine line art, cross-hatching',
  '3D Render':      '3D render, octane render, cinema4d, photorealistic CGI, studio lighting',
  'Cinematic':      'cinematic photography, film grain, dramatic lighting, anamorphic, color graded',
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.NANOBANANA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'NANOBANANA_API_KEY not configured' }, { status: 500 });
  }

  try {
    const body = await req.json() as {
      prompt?: string;
      style?: string;
      quality?: string;
      aspectRatio?: string;
      endpoint?: string;
    };

    const prompt = (body.prompt ?? '').trim();
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
    }

    const quality     = body.quality ?? 'high';
    const endpoint    = (body.endpoint ?? QUALITY_ENDPOINT[quality] ?? 'v2-2k') as NanoBananaEndpoint;
    const styleLabel  = body.style ?? '';
    const styleSuffix = STYLE_SUFFIXES[styleLabel] ?? styleLabel;
    const enriched    = styleSuffix ? `${prompt}, ${styleSuffix}` : prompt;

    const result = await generateNanoBananaImage({
      prompt:      enriched,
      endpoint,
      aspectRatio: body.aspectRatio ?? '1:1',
      style:       styleLabel || undefined,
    });

    if (!result.url) {
      return NextResponse.json({
        success: false,
        error:   result.text ?? 'NanoBanana returned no image URL',
      }, { status: 502 });
    }

    return NextResponse.json({
      success:   true,
      url:       result.url,
      model:     `NanoBananaAI ${endpoint.toUpperCase()}`,
      endpoint,
      credits:   result.credits,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image generation failed';
    console.error('[nanobanana/image]', message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
