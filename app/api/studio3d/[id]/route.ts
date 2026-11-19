/**
 * GET  /api/studio3d/:id — the job's step, its reference picture and, when done, signed links to the model.
 *                          Each poll also reads the worker's manifest: delivery settles the charge, failure refunds.
 * POST /api/studio3d/:id — { action: 'approve' | 'cancel' }. Cancel is allowed only before the GPU starts.
 * Flag STUDIO_3D_V2; 404 while off. Only the owner sees a job (anyone else gets 404).
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { studio3dContext } from '@/lib/studio3d/server/routeAuth';
import { actOnJob, pollJob, type JobView, type ServiceError } from '@/lib/studio3d/server/service';
import { studio3dDeps } from '@/lib/studio3d/server/deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const reply = (r: JobView | ServiceError) =>
  r.ok ? NextResponse.json(r, { headers: { 'cache-control': 'no-store' } }) : NextResponse.json({ error: r.code, ...(r.message ? { message: r.message } : {}) }, { status: r.status });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await studio3dContext((await authedClientFromRequest(req)).user);
  if (!ctx.ok) return ctx.response;
  const limited = await checkRateLimit(req, RATE_LIMITS.TASKS);
  if (limited) return limited;
  const { id } = await params;
  return reply(await pollJob(studio3dDeps(), ctx.userId, id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await studio3dContext((await authedClientFromRequest(req)).user);
  if (!ctx.ok) return ctx.response;
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;
  const { id } = await params;
  let body: { action?: unknown } = {};
  try {
    body = (await req.json()) as { action?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  return reply(await actOnJob(studio3dDeps(), ctx.userId, id, body.action));
}
