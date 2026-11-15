/**
 * lib/studio3d/server/routeAuth.ts — the gate in front of every /api/studio3d route.
 *   flag off (or not this user's audience) → 404, exactly as if the route did not exist;
 *   not signed in → 401. Preview deployments refuse paid writes in the ledger itself (lib/env/previewIsolation).
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { studio3dAudience, studio3dAllowed } from '../flag';

export type Studio3dRouteContext = { ok: true; userId: string } | { ok: false; response: NextResponse };

export const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });

export async function studio3dContext(req: Request): Promise<Studio3dRouteContext> {
  if (studio3dAudience() === 'off') return { ok: false, response: notFound() };
  const { user } = await authedClientFromRequest(req);
  if (!user) {
    // Admin-only audience: an anonymous caller must not learn that the route exists.
    if (studio3dAudience() === 'admin') return { ok: false, response: notFound() };
    return { ok: false, response: NextResponse.json({ error: 'auth_required' }, { status: 401 }) };
  }
  if (!studio3dAllowed(await isAdminUserAsync(user))) return { ok: false, response: notFound() };
  return { ok: true, userId: user.id };
}
