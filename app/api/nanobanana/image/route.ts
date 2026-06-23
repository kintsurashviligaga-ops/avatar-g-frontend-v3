import { NextRequest, NextResponse } from 'next/server';
import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import type { NanoBananaEndpoint } from '@/lib/nanobanana/endpoints';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { recordCompletedAsset } from '@/lib/orchestrator/jobs';
import { DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { randomUUID } from 'node:crypto';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';
// 300s headroom so the higher-resolution tiers (2K/4K) have time to finish on the
// provider instead of timing out at the old 120s ceiling (the "image won't
// generate" report on `high`). 1K still returns in ~50s; the poll exits on success.
export const maxDuration = 300;

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
  'Cyberpunk':      'cyberpunk, neon-lit futuristic dystopia, blade runner aesthetic, holographic signage, rain-soaked streets',
  'Fantasy':        'epic fantasy art, magical ethereal lighting, detailed concept art, mythical atmosphere, painterly',
  'Minimalist':     'minimalist, clean composition, generous negative space, simple flat design, muted palette',
  'Line Art':       'clean line art, bold confident outlines, monochrome ink illustration, vector style',
  'Pixel Art':      '16-bit pixel art, retro game sprite, dithering, limited palette, crisp pixels',
};

// Host a data: reference image to a signed https URL — NanoBanana's img2img only
// accepts an https reference (extractImageUrls drops data: URLs), so a freshly
// uploaded/attached image must be copied to Supabase first. Fail-open → null.
async function hostReferenceImage(dataUrl: string): Promise<string | null> {
  try {
    const m = dataUrl.match(/^data:([^;,]+)[;,]/);
    const mime = (m?.[1] || 'image/png').toLowerCase();
    const ext = /jpe?g/i.test(mime) ? 'jpg' : /webp/i.test(mime) ? 'webp' : 'png';
    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : '';
    if (!b64) return null;
    const path = `omni-ref/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    return (await uploadAndSign('uploads', path, b64, mime, 7200)) || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (rl) return rl;

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
      /** Img2img / edit: a source image (data: upload OR an https URL to edit). */
      referenceImage?: string;
      /** P7 — what to AVOID in the image (folded into the prompt as a negative clause). */
      negativePrompt?: string;
    };

    const prompt = (body.prompt ?? '').trim();
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
    }

    const quality     = body.quality ?? 'high';
    const endpoint    = (body.endpoint ?? QUALITY_ENDPOINT[quality] ?? 'v2-2k') as NanoBananaEndpoint;
    const styleLabel  = body.style ?? '';
    const styleSuffix = STYLE_SUFFIXES[styleLabel] ?? styleLabel;
    // A style brings its own quality descriptors; an un-styled ("Auto") prompt gets a
    // light universal boost so every image is crisp + detailed, not flat.
    const base        = styleSuffix ? `${prompt}, ${styleSuffix}` : `${prompt}, ultra detailed, sharp focus, professional quality`;
    // P7 — negative prompt: NanoBanana has no dedicated negative field, so the things to
    // avoid are appended as an explicit exclusion clause the model honours.
    const negative    = typeof body.negativePrompt === 'string' ? body.negativePrompt.trim().slice(0, 400) : '';
    const enriched    = negative ? `${base}. Do NOT include: ${negative}.` : base;

    // Img2img / edit — resolve the reference image to an https URL the provider
    // accepts: data: uploads are hosted to Supabase; https URLs (e.g. editing a
    // previously generated image) pass straight through.
    let referenceImageUrl: string | undefined;
    const ref = typeof body.referenceImage === 'string' ? body.referenceImage.trim() : '';
    if (ref.startsWith('data:')) referenceImageUrl = (await hostReferenceImage(ref)) || undefined;
    else if (/^https?:\/\//i.test(ref)) referenceImageUrl = ref;

    // Give 2K/4K a long-enough result-poll window (≈250s) so they complete rather
    // than timing out; 1K finishes far sooner and exits the poll early.
    const result = await generateNanoBananaImage({
      prompt:      enriched,
      endpoint,
      aspectRatio: body.aspectRatio ?? '1:1',
      style:       styleLabel || undefined,
      ...(referenceImageUrl ? { referenceImageDataUrl: referenceImageUrl } : {}),
      pollMaxAttempts: 100,
      pollIntervalMs:  2500,
    });

    if (!result.url) {
      return NextResponse.json({
        success: false,
        error:   result.text ?? 'NanoBanana returned no image URL',
      }, { status: 502 });
    }

    // RE-HOST to Supabase Storage so the image renders in-app. The provider
    // returns a URL on its own CDN, which (a) is NOT in our CSP img-src — so the
    // browser would block the <img> — and (b) is a short-lived temp link. Copying
    // the bytes to our `*.supabase.co` bucket (CSP-allowed) returns a stable,
    // signed URL the client can display + download. Fail-open: if the copy fails,
    // fall back to the raw provider URL (better than nothing).
    let hostedUrl = result.url;
    try {
      // Time-box the copy: a slow provider CDN must NOT hang the function until the
      // Vercel maxDuration limit (that surfaced as an intermittent platform 500).
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 25_000);
      const r = await fetch(result.url, { signal: ac.signal }).finally(() => clearTimeout(to));
      if (r.ok) {
        const ct = r.headers.get('content-type') || 'image/png';
        const ext = /jpe?g/i.test(ct) ? 'jpg' : /webp/i.test(ct) ? 'webp' : 'png';
        const buf = Buffer.from(await r.arrayBuffer());
        // Guard against pathologically large payloads blowing the function's memory.
        if (buf.byteLength <= 18 * 1024 * 1024) {
          const b64 = buf.toString('base64');
          const path = `omni/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const signed = await uploadAndSign('uploads', path, b64, ct, 604800); // 7-day signed URL
          if (signed) hostedUrl = signed;
        }
      }
    } catch {
      /* fail-open — keep the provider URL */
    }

    // Best-effort: file the image into the signed-in user's Library so it appears
    // in the media grid immediately. Anonymous callers simply aren't filed; a
    // Library-write failure never blocks returning the image.
    try {
      const { user } = await authedClientFromRequest(req);
      await recordCompletedAsset({ id: randomUUID(), userId: user?.id ?? DEMO_VOICE_USER_ID, serviceType: 'image', url: hostedUrl, prompt });
    } catch {
      /* fail-open */
    }

    return NextResponse.json({
      success:   true,
      url:       hostedUrl,
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
