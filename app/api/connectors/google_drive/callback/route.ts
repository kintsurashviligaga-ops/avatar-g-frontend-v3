/**
 * GET /api/connectors/google_drive/callback?code&state — Google's redirect back. The state must be this user's, unexpired,
 * HMAC-valid, and equal to the one in the httpOnly cookie; the code is exchanged with the cookie's PKCE verifier. The
 * refresh token is sealed (AES-256-GCM, the user id as associated data) and stored; the access token is dropped.
 * Always ends in a 303 back to the app with drive=linked or drive=error&reason=….
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { liveDriveDeps, driveRedirectUri } from '@/lib/connectors/google';
import { encryptToken, verifyState } from '@/lib/connectors/google/crypto';
import { exchangeCode, revokeToken } from '@/lib/connectors/google/oauth';
import { COOKIE, backTo, notFound } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(req, RATE_LIMITS.READ);
  if (limited) return limited;
  const origin = req.nextUrl.origin;
  const [verifier = '', cookieState = '', locale = 'ka'] = (req.cookies.get(COOKIE)?.value ?? '').split('~');
  const { user } = await authedClientFromRequest(req);
  if (!user) return backTo(origin, locale, 'error', 'not_signed_in');
  const deps = await liveDriveDeps(user);
  if (!deps.cfg) return notFound();
  if (!deps.store || !deps.tableReady) return backTo(origin, locale, 'error', 'unavailable');

  const q = req.nextUrl.searchParams;
  if (q.get('error')) return backTo(origin, locale, 'error', 'denied');
  const state = q.get('state') ?? '';
  const code = q.get('code') ?? '';
  if (!verifier || !cookieState || !state || !code || !same(state, cookieState)) return backTo(origin, locale, 'error', 'state');
  const check = verifyState(state, user.id, deps.cfg.keys);
  if (!check.ok) return backTo(origin, locale, 'error', 'state');

  const ex = await exchangeCode(deps.cfg, { code, verifier, redirectUri: driveRedirectUri(origin) });
  if (!ex.ok) return backTo(origin, locale, 'error', ex.reason);
  const stored = await deps.store.put({ userId: user.id, sealedRefreshToken: encryptToken(ex.refreshToken, user.id, deps.cfg.keys), scope: ex.scope, email: ex.email });
  if (!stored) {
    // Nothing kept on our side, so nothing must stay granted on Google's either.
    await revokeToken(ex.refreshToken);
    return backTo(origin, locale, 'error', 'unavailable');
  }
  return backTo(origin, locale, 'linked');
}
