import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { checkDailyBudget } from '@/lib/security/apiGuard';
import { agentMediaOpenTo } from '@/lib/agent/media/access';
import { readBodyWithCap } from '@/lib/security/allowlistedAudioFetch';
import { runAfterResponse } from '@/lib/platform/afterResponse';
import { randomUUID } from 'node:crypto';
import { liveImageDeps } from './live';
import { workImage, sweepImages } from './engine';
import { imageError, ImageError } from './errors';
import type { ImageDeps } from './engine';

export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
export function errorResponse(error: unknown) {
  const e = imageError(error);
  return json({ ok: false, error: e.code, message: e.message }, e.status);
}
export async function requireAuthenticatedUser(req: NextRequest, expensive = false) {
  const { user } = await authedClientFromRequest(req);
  if (!user) return { response: json({ ok: false, error: 'unauthenticated' }, 401) } as const;
  // Reuse the existing owner-controlled media access policy; no production flag is changed by this branch.
  if (!agentMediaOpenTo(user)) return { response: json({ ok: false, error: 'not_found' }, 404) } as const;
  const limited = await checkRateLimit(req, expensive ? RATE_LIMITS.EXPENSIVE : RATE_LIMITS.READ, user.id);
  if (limited) return { response: limited } as const;
  return { userId: user.id, deps: liveImageDeps() } as const;
}
export async function imageBody(req: NextRequest): Promise<Record<string, unknown>> {
  const bytes = await readBodyWithCap(req as unknown as Response, 64 * 1024);
  if (!bytes) throw new ImageError('validation_failed', 'The image request is too large.', 413);
  try {
    const body: unknown = JSON.parse(bytes.toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new ImageError('validation_failed', 'Send a valid image request.', 400); }
}
export function imageDailyBudget(userId: string) {
  if (!checkDailyBudget(userId).allowed) throw new ImageError('queue_full', 'The daily generation limit has been reached.', 429);
}
export function kickImage(deps: ImageDeps, id: string) {
  const work = () => workImage(deps, id, 'image-' + randomUUID());
  if (!runAfterResponse(work, 'image-studio-worker')) void work().catch(() => undefined);
}
export function recoverImages(deps: ImageDeps) {
  const work = () => sweepImages(deps, 'image-recovery-' + randomUUID(), false);
  if (!runAfterResponse(work, 'image-studio-recovery')) void work().catch(() => undefined);
}
