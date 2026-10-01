import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createServiceRoleClient, isSupabaseConfiguredServer } from '@/lib/supabase/server';
import {
  buildOtpEmail,
  extractEmailOtp,
  isOtpPurpose,
  isPlausibleEmail,
  normalizeLocale,
  isUserNotFoundError,
  type OtpPurpose,
} from '@/lib/auth/otpEmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Same default as /api/mail/send on purpose: two different senders would mean two domains to verify in
// Resend, and the auth one would 403 silently if only the other had been set up.
const MAIL_FROM = process.env.MAIL_FROM || 'MyAvatar <info@myavatar.ge>';

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
  // ⚠️ TWO LIMITS, AND THEY DO DIFFERENT JOBS. A single IP-keyed 5-per-15-minutes bucket meant that
  // behind Georgian mobile CGNAT, an office or a cafe, the SIXTH sign-up attempt from that whole
  // network was refused — punishing people for a stranger's traffic. AUTH_IP is the loose network
  // ceiling that still stops one host mass-creating accounts; the tight per-user budget is applied
  // BELOW, once the body has been read and the email is known to scope it to one person.
  const ipLimited = await checkRateLimit(req, RATE_LIMITS.AUTH_IP);
  if (ipLimited) return ipLimited;

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
  // The real budget: 5 attempts per 15 minutes for THIS email, so one person's retries can never
  // consume anyone else's. Applied after validation so a malformed request cannot spend it.
  const emailLimited = await checkRateLimit(req, RATE_LIMITS.AUTH, email);
  if (emailLimited) return emailLimited;
  // …and the budget of the ADDRESS itself, whatever IP asks (lib/api/rate-limit OTP_ADDRESS*). Checked BEFORE a code
  // is generated: a refused request must not replace the code already sitting in the person's inbox.
  const addressKey = createHash('sha256').update(email).digest('hex').slice(0, 32);
  const addressLimited = await checkRateLimitByKey(addressKey, RATE_LIMITS.OTP_ADDRESS);
  if (addressLimited) return addressLimited;

  // ⚠️ THE LEGACY 'signup' PURPOSE IS RETIRED. It answered 409 `email_taken` for a registered address — an
  // account-enumeration oracle (security review, 2026-10-01) — and created the account with a password the REQUESTER
  // chose for an address they had not proven. The two-field sign-up left the UI with the one-line sheet; a tab still
  // running an older build gets 410 for EVERY address (so nothing leaks) and the sheet tells it to reload. Quietly
  // serving it as 'continue' instead would hand that old client a code its verify type rejects.
  const purpose: OtpPurpose = isOtpPurpose(body?.purpose) ? body.purpose : 'signin';
  if (purpose === 'signup') {
    return NextResponse.json({ error: 'client_outdated' }, { status: 410 });
  }
  const locale = normalizeLocale(body?.locale);

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
    // Both remaining purposes start from a sign-in (magiclink) code; only 'continue' creates a missing account below.
    let { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    // THE ONE-FIELD FLOW: an address with no account gets one. It is created UNCONFIRMED with a random password
    // nobody knows (the person signs in with codes; „forgot password" sets a real one), and the code mailed below is
    // the only way in — verifyOtp({ type: 'email' }) accepts it exactly like a sign-in code. The answer is the same
    // OK either way, so this cannot be used to learn which addresses are registered.
    if (purpose === 'continue' && error && isUserNotFoundError(error.message)) {
      ({ data, error } = await admin.auth.admin.generateLink({ type: 'signup', email, password: randomBytes(32).toString('base64url') }));
    }
    // ⚠️ PRE-ACCOUNT TAKEOVER. An address can already hold an UNCONFIRMED account whose password a stranger chose
    // (purpose 'signup' never proved the address). The code proves the address now — so whatever password the
    // unproven account carried must not survive into the owner's account.
    const pending = (data as { user?: { id?: string; email_confirmed_at?: string | null } } | null)?.user;
    if (purpose === 'continue' && !error && pending?.id && !pending.email_confirmed_at) {
      await admin.auth.admin.updateUserById(pending.id, { password: randomBytes(32).toString('base64url') });
    }

    if (error) {
      const msg = String(error.message || '').toLowerCase();
      // Sign-in for an UNKNOWN ADDRESS answers OK, because confirming which addresses have accounts
      // would turn this endpoint into an account-enumeration oracle.
      //
      // BUT ONLY FOR THAT. This used to swallow EVERY sign-in error, so a bad service-role key, a GoTrue
      // 5xx, its rate limit or a network fault all reported "code sent" — and because the branch sat
      // above the log line, nothing was recorded either. The user then waited forever for a code that
      // was never generated. That is the exact silent failure this endpoint must not have.
      if (purpose === 'signin' && isUserNotFoundError(msg)) return NextResponse.json({ ok: true });

      // Everything else is a REAL failure and is logged, whatever the purpose.
      // eslint-disable-next-line no-console
      console.error(`[email-otp/send] generateLink (${purpose}):`, error.message);
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
