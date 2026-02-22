import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { normalizePhoneE164, sendOtpSms } from '@/lib/server/twilio-verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SendOtpBody = {
  phone?: string;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limitError = await checkRateLimit(req, RATE_LIMITS.AUTH);
  if (limitError) return limitError;

  try {
    const body = (await req.json().catch(() => ({}))) as SendOtpBody;
    const phone = normalizePhoneE164(String(body.phone || ''));

    const result = await sendOtpSms(phone);

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_phone') {
      return NextResponse.json({ ok: false, error: 'Invalid phone format' }, { status: 400 });
    }

    return NextResponse.json({ ok: false, error: 'Failed to send verification code' }, { status: 500 });
  }
}
