import { NextRequest, NextResponse } from 'next/server';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const requestId = crypto.randomUUID();

  const gate = await applyApiGuards(req, {
    limit: body?.predictionId ? RATE_LIMITS.READ : RATE_LIMITS.EXPENSIVE,
    skipBudget: !!body?.predictionId,
    label: 'replicate.video',
  });
  if (gate.response) return gate.response;

  console.info('[api/replicate/video] POST received', {
    requestId,
    hasPrompt: typeof body?.prompt === 'string' && body.prompt.trim().length > 0,
    aspectRatio: body?.aspectRatio,
    variant: body?.variant,
  });

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

  console.info('[api/replicate/video] upstream response', {
    requestId,
    status: upstream.status,
  });

  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
