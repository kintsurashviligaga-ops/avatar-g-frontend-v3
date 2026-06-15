import { NextRequest, NextResponse } from 'next/server';
import { upscaleImage } from '@/lib/ai/replicate';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { recordCompletedAsset } from '@/lib/orchestrator/jobs';
import { DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { randomUUID } from 'node:crypto';

/**
 * Upscale a generated image (Real-ESRGAN) → sharper, higher-res. POST { imageUrl,
 * scale? } → { url }. The result is re-hosted to Supabase (CSP) + filed in the Library.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { imageUrl?: unknown; scale?: unknown };
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  const scale: 2 | 4 = body.scale === 4 ? 4 : 2;
  if (!/^https?:\/\//i.test(imageUrl)) {
    return NextResponse.json({ success: false, error: 'imageUrl is required' }, { status: 400 });
  }

  try {
    const out = await upscaleImage(imageUrl, scale);

    // Re-host to a CSP-allowed Supabase URL (provider URL is temp + blocked by img-src).
    let hosted = out;
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 25_000);
      const r = await fetch(out, { signal: ac.signal }).finally(() => clearTimeout(to));
      if (r.ok) {
        const ct = r.headers.get('content-type') || 'image/png';
        const ext = /jpe?g/i.test(ct) ? 'jpg' : /webp/i.test(ct) ? 'webp' : 'png';
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.byteLength <= 25 * 1024 * 1024) {
          const path = `omni-upscale/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const signed = await uploadAndSign('uploads', path, buf.toString('base64'), ct, 604800);
          if (signed) hosted = signed;
        }
      }
    } catch {
      /* fail-open — keep the provider URL */
    }

    try {
      const { user } = await authedClientFromRequest(req);
      await recordCompletedAsset({ id: randomUUID(), userId: user?.id ?? DEMO_VOICE_USER_ID, serviceType: 'image', url: hosted, prompt: 'upscaled' });
    } catch {
      /* fail-open */
    }

    return NextResponse.json({ success: true, url: hosted });
  } catch {
    return NextResponse.json({ success: false, error: 'Upscale failed.' }, { status: 502 });
  }
}
