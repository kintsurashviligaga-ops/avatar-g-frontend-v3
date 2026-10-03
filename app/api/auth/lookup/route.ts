import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createServiceRoleClient, isSupabaseConfiguredServer } from '@/lib/supabase/server';
import { parseIdentifier } from '@/lib/auth/identifier';
import { lookupAccountStatus } from '@/lib/auth/accountStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/lookup — { identifier } → { status: 'none' | 'password' | 'code' | 'unknown' } (lib/auth/accountStatus).
 *
 * The sign-in sheet asks this after the first step, so log-in can say „no account with this email — create one" and
 * skip a password that does not exist, and sign-up can say „already registered — log in" (owner, 2026-10-03: an
 * address that has an account must not register again).
 *
 * ⚠️ IT REVEALS WHETHER AN ADDRESS IS REGISTERED — on purpose, and only as much as sign-up has to: that is the answer
 * the owner asked for, and every mainstream sign-up gives it. What keeps it from being a cheap oracle: the AUTH_IP
 * ceiling (40 per 15 minutes per IP, shared with the code sends) and a per-address bucket, the status is all it
 * returns (never a name, an id or a date), and it mints nothing — no code, no account, no mail.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ipLimited = await checkRateLimit(req, RATE_LIMITS.AUTH_IP);
  if (ipLimited) return ipLimited;

  if (!isSupabaseConfiguredServer()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { identifier?: unknown } | null;
  const raw = typeof body?.identifier === 'string' ? body.identifier.slice(0, 320) : '';
  const id = parseIdentifier(raw, { phone: true });
  if (id.kind === 'invalid') return NextResponse.json({ error: 'invalid_identifier' }, { status: 400 });

  const key = createHash('sha256').update(id.kind === 'email' ? id.email : id.phone).digest('hex').slice(0, 32);
  const addressLimited = await checkRateLimitByKey(key, RATE_LIMITS.AUTH_LOOKUP);
  if (addressLimited) return addressLimited;

  const status = await lookupAccountStatus(createServiceRoleClient(), id);
  return NextResponse.json({ status }, { headers: { 'Cache-Control': 'no-store' } });
}
