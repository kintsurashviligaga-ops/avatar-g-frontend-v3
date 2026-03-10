import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const upstream = await fetch(new URL('/api/replicate/generate', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service: 'video',
      prompt: body?.prompt,
      predictionId: body?.predictionId,
      quality: body?.quality,
      variant: body?.variant,
      negativePrompt: body?.negativePrompt,
      imageUrl: body?.imageUrl,
    }),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
