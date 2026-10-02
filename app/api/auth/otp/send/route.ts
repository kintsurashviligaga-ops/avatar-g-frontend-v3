import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/otp/send — RETIRED (2026-10-02). Always 410.
 *
 * WHAT IT USED TO DO: send a Twilio Verify SMS code to ANY phone number the body named, for anyone, throttled only per
 * IP (5 per 15 minutes). That is the textbook shape of SMS-pumping toll fraud: a script on rotating IPs aims it at
 * premium-rate numbers and every message is billed to us. It belonged to the old Avatar Builder phone check; nothing in
 * the app calls it any more (phone sign-in runs through Supabase Auth in components/chat/AuthModal).
 *
 * WHY 410 RATHER THAN A DELETE: an old client gets an explicit "retired" answer instead of a bare 404, and there is no
 * provider code left here to re-wire by accident (__tests__/api-lockdown.test.ts keeps it that way).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Still rate-limited: the endpoint is retired, not a free thing to hammer.
  const limited = await checkRateLimit(req, RATE_LIMITS.AUTH);
  if (limited) return limited;
  return NextResponse.json(
    { ok: false, code: 'deprecated', message: 'Phone codes are sent by the sign-in sheet now. This endpoint has been retired.' },
    { status: 410 },
  );
}
