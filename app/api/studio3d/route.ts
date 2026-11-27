/**
 * POST /api/studio3d — start a 3D Studio job (Phase 8.8, flag STUDIO_3D_V2; 404 while off).
 * Body: { mode: 'text'|'image'|'retexture', prompt, imageUrl?, meshUrl?, detail?, faces? }.
 * Text / retexture first draw a reference picture (✦8, charged when delivered) and wait for "approve"; image mode goes
 * straight to the GPU queue. The model price is reserved when queued and refunded on any failure.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { studio3dContext, STUDIO3D_USER_DAILY } from '@/lib/studio3d/server/routeAuth';
import { createJob } from '@/lib/studio3d/server/service';
import { studio3dDeps } from '@/lib/studio3d/server/deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // the reference picture is drawn inside this request

/** GET /api/studio3d — 200 { ok, on: true } when this user may use the 3D Studio, 404 otherwise (the chat's 3D panel asks). */
export async function GET(req: NextRequest) {
  const ctx = await studio3dContext((await authedClientFromRequest(req)).user);
  if (!ctx.ok) return ctx.response;
  return NextResponse.json({ ok: true, on: true }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  const ctx = await studio3dContext((await authedClientFromRequest(req)).user);
  if (!ctx.ok) return ctx.response;
  const limited = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE, ctx.userId);
  if (limited) return limited;
  const daily = await checkRateLimitByKey(ctx.userId, STUDIO3D_USER_DAILY);
  if (daily) return daily;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const r = await createJob(studio3dDeps(), ctx.userId, body);
  if (!r.ok) return NextResponse.json({ error: r.code, ...(r.message ? { message: r.message } : {}) }, { status: r.status });
  return NextResponse.json(r, { status: 201 });
}
