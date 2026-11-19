/**
 * GET /api/connectors/google_drive/connect?locale=ka — starts linking Google Drive (scope drive.file only).
 * Signed-in and opened by CONNECTORS_DRIVE, else 404. Sets an httpOnly cookie with the PKCE verifier and the signed
 * state (10 min), then 302s to Google's consent screen. Nothing is stored server-side yet.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { liveDriveDeps, driveRedirectUri } from '@/lib/connectors/google';
import { pkcePair, signState, STATE_TTL_MS } from '@/lib/connectors/google/crypto';
import { authorizationUrl } from '@/lib/connectors/google/oauth';
import { COOKIE, backTo, localeOf, notFound } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(req, RATE_LIMITS.READ);
  if (limited) return limited;
  const locale = localeOf(req.nextUrl.searchParams.get('locale'));
  const { user } = await authedClientFromRequest(req);
  if (!user) return backTo(req.nextUrl.origin, locale, 'error', 'not_signed_in');
  const deps = await liveDriveDeps(user);
  if (!deps.cfg) return notFound();
  if (!deps.store || !deps.tableReady) return backTo(req.nextUrl.origin, locale, 'error', 'unavailable');

  const { verifier, challenge } = pkcePair();
  const onePick = req.nextUrl.searchParams.get('picker') === '1';
  const state = signState(onePick ? `${user.id}:picker` : user.id, deps.cfg.keys);
  const url = authorizationUrl(deps.cfg, { redirectUri: driveRedirectUri(req.nextUrl.origin), state, challenge, loginHint: user.email ?? undefined, onePick });
  const res = NextResponse.redirect(url, 302);
  res.cookies.set(COOKIE, `${verifier}~${state}~${locale}~${onePick ? 'picker' : 'connect'}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/connectors/google_drive',
    maxAge: Math.floor(STATE_TTL_MS / 1000),
  });
  return res;
}
