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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service: 'visual-ai',
      prompt: body?.prompt,
      predictionId: body?.predictionId,
      variant: body?.variant || 'caption',
      imageUrl: body?.imageUrl,
    }),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
