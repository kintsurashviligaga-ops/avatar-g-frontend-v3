import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // MEDIA_GOOGLE_ONLY (lib/providers/mediaPolicy): this entry reaches an outside engine, so the switch refuses it here,
  // before any charge. Off (the default) → no-op.
  const outside = refuseOutsideEngine(req);
  if (outside) return outside;
  const body = await req.json();
  const upstream = await fetch(new URL('/api/replicate/generate', req.url), {
    method: 'POST',
    // Forward the caller's session cookie so /api/replicate/generate's guardGeneration sees the
    // authenticated user (this proxy is otherwise anonymous server-to-server).
    headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
    body: JSON.stringify({
      service: 'photo',
      prompt: body?.prompt,
      predictionId: body?.predictionId,
      quality: body?.quality,
      variant: body?.variant || (body?.removeBackground ? 'remove-bg' : 'upscale'),
      imageUrl: body?.imageUrl,
    }),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
