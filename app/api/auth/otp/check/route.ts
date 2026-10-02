import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/otp/check — RETIRED (2026-10-02) with its sender, /api/auth/otp/send. Always 410.
 *
 * It checked a Twilio Verify code (a billed verification) and pinged our Telegram chat on success. With the sender
 * retired there is no code to check, and nothing in the app calls it.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(req, RATE_LIMITS.AUTH);
  if (limited) return limited;
  return NextResponse.json(
    { ok: false, status: 'deprecated', code: 'deprecated', message: 'This endpoint has been retired.' },
    { status: 410 },
  );
}
