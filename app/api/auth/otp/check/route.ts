import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { checkOtpCode, normalizeOtpCode, normalizePhoneE164 } from '@/lib/server/twilio-verify';
import { sendTelegramTextMessage } from '@/lib/server/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckOtpBody = {
  phone?: string;
  code?: string;
};

function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 4)}***${phone.slice(-2)}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limitError = await checkRateLimit(req, RATE_LIMITS.AUTH);
  if (limitError) return limitError;

  try {
    const body = (await req.json().catch(() => ({}))) as CheckOtpBody;
    const phone = normalizePhoneE164(String(body.phone || ''));
    const code = normalizeOtpCode(String(body.code || ''));

    const result = await checkOtpCode({ phone, code });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: result.status,
          ...(result.error ? { error: result.error } : {}),
        },
        { status: 200 }
      );
    }

    void sendTelegramTextMessage({
      text: `✅ Avatar Builder OTP verified: ${maskPhone(phone)}`,
    });

    return NextResponse.json({ ok: true, status: 'approved' }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'invalid_phone' || error.message === 'invalid_code')) {
      return NextResponse.json({ ok: false, status: 'invalid', error: 'Invalid phone or code format' }, { status: 400 });
    }

    return NextResponse.json({ ok: false, status: 'error', error: 'Verification check failed' }, { status: 500 });
  }
}
