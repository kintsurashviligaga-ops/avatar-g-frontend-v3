/**
 * GET /api/health/embed   (header `x-admin-key: $ADMIN_KEY`, or a signed-in admin)
 *
 * ⚠️ The key used to ride in `?key=` — a URL lands in access logs, traces and error reports. Header only now.
 * Admin-gated diagnostic for the OpenAI embeddings API. Returns the
 * shape and (partial) values of an embedding so we can verify whether
 * `embed()` is working in production. If the call fails, the actual
 * upstream error (status + body) is surfaced.
 */

import { NextRequest, NextResponse } from 'next/server';
import { embed } from '@/lib/memory/embed';
import { adminKeyHeaderMatches } from '@/lib/security/opsAccess';
import { isAdmin } from '@/lib/auth/adminGuard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!adminKeyHeaderMatches(req) && !(await isAdmin().catch(() => false))) {
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
