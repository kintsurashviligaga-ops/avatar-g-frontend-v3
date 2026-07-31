import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createServiceRoleClient, isSupabaseConfiguredServer } from '@/lib/supabase/server';
import {
  buildOtpEmail,
  extractEmailOtp,
  isOtpPurpose,
  isPlausibleEmail,
  linkTypeFor,
  normalizeLocale,
  type OtpPurpose,
} from '@/lib/auth/otpEmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAIL_FROM = process.env.MAIL_FROM || 'MyAvatar <noreply@myavatar.ge>';

/**
 * POST /api/auth/email-otp/send — issue a 6-digit EMAIL code and deliver it ourselves.
 *
 * (Not to be confused with /api/auth/otp/send, which is the Twilio SMS code.)
 *
 * WHY: Supabase's own mail renders its "Confirm signup" / "Magic Link" templates, which ship with
 * `{{ .ConfirmationURL }}` and therefore send a LINK. This project cannot edit those templates — the
 * dashboard editor locks the token variables — so no client-side change can turn that into a code.
 *
 * WHAT THIS DOES NOT DO: invent its own credential. `admin.generateLink()` generates a code WITHOUT
 * SENDING ANY EMAIL and returns Supabase's own `email_otp`. We take over the TRANSPORT only. The code
 * stays Supabase's, so the client's `verifyOtp()` validates it natively — its expiry, its single-use
 * rule, its session. No custom OTP table, no custom session minting, no new trust boundary, and nothing
 * to keep in sync when Supabase rotates its own rules.
 *
 * THE CODE IS NEVER RETURNED TO THE CLIENT. It lives in this function and in the outgoing email.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // AUTH limit (5 / 15min): this both writes auth state and sends mail — the two things worth abusing.
  const limited = await checkRateLimit(req, RATE_LIMITS.AUTH);
  if (limited) return limited;

  if (!isSupabaseConfiguredServer()) {
    return NextResponse.json({ error: 'not_configured', message: 'Authentication is not configured.' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as
    | { email?: unknown; purpose?: unknown; password?: unknown; locale?: unknown }
    | null;

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isPlausibleEmail(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  const purpose: OtpPurpose = isOtpPurpose(body?.purpose) ? body.purpose : 'signin';
  const locale = normalizeLocale(body?.locale);
  const password = typeof body?.password === 'string' ? body.password : '';

  // A sign-up link CREATES the account, so it needs the password the user just chose. Without one,
  // Supabase would create a passwordless account they could never sign into with a password again.
  if (purpose === 'signup' && password.length < 6) {
    return NextResponse.json({ error: 'weak_password' }, { status: 400 });
  }

  // Delivery must be configured. /api/mail/send fails OPEN because a missing newsletter is harmless; an
  // auth code that silently is not sent locks the user out with no explanation, so this fails LOUD.
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'mail_not_configured', message: 'Email delivery is not configured — RESEND_API_KEY is missing.' },
      { status: 503 },
    );
  }

  try {
    const admin = createServiceRoleClient();
    // GenerateLinkParams is a discriminated union — 'signup' carries a password, 'magiclink' does not,
    // so the two cases cannot be merged into one spread.
    const { data, error } = linkTypeFor(purpose) === 'signup'
      ? await admin.auth.admin.generateLink({ type: 'signup', email, password })
      : await admin.auth.admin.generateLink({ type: 'magiclink', email });

    if (error) {
      const msg = String(error.message || '').toLowerCase();
      // Sign-up on an existing address: say so. They need the sign-in tab, and hiding it just makes them
      // retry forever. A sign-up form reveals this either way.
      if (purpose === 'signup' && (msg.includes('already') || msg.includes('registered') || msg.includes('exists'))) {
        return NextResponse.json({ error: 'email_taken' }, { status: 409 });
      }
      // Sign-in for an unknown address: answer OK anyway. Confirming which addresses have accounts would
      // turn this endpoint into an account-enumeration oracle.
      if (purpose === 'signin') return NextResponse.json({ ok: true });
      // eslint-disable-next-line no-console
      console.error('[email-otp/send] generateLink:', error.message);
      return NextResponse.json({ error: 'send_failed' }, { status: 502 });
    }

    const code = extractEmailOtp(data);
    if (!code) {
      // The provider answered but without a usable code — a contract change. Fail rather than mail a
      // blank or wrong code, which is indistinguishable from a broken account to the person receiving it.
      // eslint-disable-next-line no-console
      console.error('[email-otp/send] no email_otp in generateLink response');
      return NextResponse.json({ error: 'send_failed' }, { status: 502 });
    }

    const mail = buildOtpEmail(code, purpose, locale);
    if (!mail) return NextResponse.json({ error: 'send_failed' }, { status: 502 });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to: [email], subject: mail.subject, html: mail.html, text: mail.text }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error('[email-otp/send] resend', res.status, detail.slice(0, 200));
      return NextResponse.json({ error: 'send_failed' }, { status: 502 });
    }

    // `ok` and nothing else — never the code, never whether the account already existed.
    return NextResponse.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email-otp/send]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'send_failed' }, { status: 502 });
  }
}
