/**
 * GET /api/health/embed?key=$ADMIN_KEY
 *
 * Admin-gated diagnostic for the OpenAI embeddings API. Returns the
 * shape and (partial) values of an embedding so we can verify whether
 * `embed()` is working in production. If the call fails, the actual
 * upstream error (status + body) is surfaced.
 */

import { NextRequest, NextResponse } from 'next/server';
import { embed } from '@/lib/memory/embed';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.nextUrl.searchParams.get('key') !== adminKey) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const t0 = Date.now();
  const vec = await embed('health check — embedding probe');

  return NextResponse.json({
    ok: !!vec,
    latencyMs: Date.now() - t0,
    embedding_length: vec?.length ?? null,
    embedding_first_5: vec?.slice(0, 5) ?? null,
    gemini_key_present: !!(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    openai_key_present: !!process.env.OPENAI_API_KEY,
  });
}
