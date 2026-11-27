/**
 * lib/studio3d/server/routeAuth.ts — the gate in front of every /api/studio3d route.
 *   flag off (or not this user's audience) → 404, exactly as if the route did not exist;
 *   not signed in → 401. Preview deployments refuse paid writes in the ledger itself (lib/env/previewIsolation).
 */
import 'server-only';
import type { RateLimitConfig } from '@/lib/api/rate-limit';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { studio3dAudience, studio3dAllowed } from '../flag';

export type Studio3dRouteContext = { ok: true; userId: string } | { ok: false; response: NextResponse };

export const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });

/**
 * The route reads the session itself (`authedClientFromRequest` in its own code, so __tests__/api-lockdown.test.ts sees
 * the gate) and hands the user here: flag, audience and admin rules stay in one place.
 */
export async function studio3dContext(user: User | null): Promise<Studio3dRouteContext> {
  if (studio3dAudience() === 'off') return { ok: false, response: notFound() };
  if (!user) {
    // Admin-only audience: an anonymous caller must not learn that the route exists.
    if (studio3dAudience() === 'admin') return { ok: false, response: notFound() };
    return { ok: false, response: NextResponse.json({ error: 'auth_required' }, { status: 401 }) };
  }
  if (!studio3dAllowed(await isAdminUserAsync(user))) return { ok: false, response: notFound() };
  return { ok: true, userId: user.id };
}

/**
 * Phase 8.14: new jobs per USER per day, on top of the burst limit (which is now keyed on the user, not the IP, so a
 * carrier's shared IP cannot lock strangers out and a changing IP cannot slip past it). One job at a time per user is
 * still enforced by admit(); the site-wide STUDIO_3D_DAILY_CAP (default 200) and the 3 GPUs stay the outer bounds.
 */
export const STUDIO3D_USER_DAILY: RateLimitConfig = { maxRequests: 20, windowMs: 24 * 60 * 60_000, keyPrefix: 'rl:3d:user' };
