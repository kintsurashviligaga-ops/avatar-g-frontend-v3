/**
 * POST /api/connectors/google_drive/disconnect — revokes the grant at Google and deletes the stored row.
 * → { ok: true, revoked } (revoked false = Google did not confirm; the row is deleted anyway, so we hold nothing).
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { liveDriveDeps } from '@/lib/connectors/google';
import { decryptToken } from '@/lib/connectors/google/crypto';
import { revokeToken } from '@/lib/connectors/google/oauth';
import { NO_STORE, notFound } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: NO_STORE });
  const limited = await checkRateLimit(req, RATE_LIMITS.READ, user.id);
  if (limited) return limited;
  const deps = await liveDriveDeps(user);
  if (!deps.cfg) return notFound();
  if (!deps.store || !deps.tableReady) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
  const row = await deps.store.get(user.id).catch(() => null);
  let revoked = true;
  if (row) {
    const token = decryptToken(row.sealedRefreshToken, user.id, deps.cfg.keys);
    revoked = token ? await revokeToken(token) : false;
  }
  const removed = await deps.store.remove(user.id);
  if (!removed) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ ok: true, revoked }, { headers: NO_STORE });
}
