import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { GenerateLinkParams } from '@supabase/supabase-js';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createServiceRoleClient, isSupabaseConfiguredServer } from '@/lib/supabase/server';
import { accountExists } from '@/lib/auth/accountStatus';
import {
  buildOtpEmail,
  describeOtpShape,
  extractEmailOtp,
  isEmailTakenError,
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
    let data: unknown = null;
    let error: { message?: string; code?: string } | null = null;
    const randomPassword = () => randomBytes(32).toString('base64url');
    // Every code is asked for through here, so the takeover guard below can ask for the same code again.
    let lastLink: GenerateLinkParams | null = null;
    const generateLink = (params: GenerateLinkParams) => {
      lastLink = params;
      return admin.auth.admin.generateLink(params);
    };

    if (purpose === 'register') {
      // SIGN-UP (2026-10-03). A new address gets an UNCONFIRMED account with a random password nobody knows — the code
      // mailed below proves the address, and the sheet then asks for the person's own password. `password_set: false`
      // tells /api/auth/lookup that this account signs in by code until they choose one.
      // ⚠️ AN ADDRESS THAT ALREADY HAS AN ACCOUNT MUST NOT REGISTER AGAIN (owner, 2026-10-03). Supabase refuses a
      // signup link for a CONFIRMED address with `email_exists`; that becomes `account_exists`, and the sheet sends the
      // person to log in. It says the address is registered — the answer sign-up exists to give — under the same
      // AUTH_IP / per-address limits as every code. An UNCONFIRMED row (a sign-up nobody finished) is not an account:
      // it gets a fresh code below.
      ({ data, error } = await generateLink({
        type: 'signup', email, password: randomPassword(), options: { data: { password_set: false } },
      }));
      if (error && (error.code === 'email_exists' || isEmailTakenError(error.message))) {
        return NextResponse.json({ error: 'account_exists' }, { status: 409 });
      }
    } else if (purpose === 'recovery') {
      // „Forgot password": Supabase's own RECOVERY code (generateLink sends nothing; we mail it). It verifies with
      // type 'recovery', which signs the person in, and the sheet asks for the new password.
      ({ data, error } = await generateLink({ type: 'recovery', email }));
    } else {
      // 'signin' and the legacy 'continue' start from a sign-in (magiclink) code.
      // ⚠️ LOG-IN MUST NOT CREATE AN ACCOUNT. For an address with no account GoTrue does not answer „user not found" to
      // a magiclink: it quietly runs a sign-up and creates the user (proven on Production 2026-10-09). So 'signin' asks
      // the database first and answers no_account without touching Supabase Auth. If the database cannot answer, it
      // falls through as before ('continue' creates on purpose, below).
      if (purpose === 'signin' && (await accountExists(admin, email)) === false) {
        return NextResponse.json({ error: 'no_account' }, { status: 404 });
      }
      ({ data, error } = await generateLink({ type: 'magiclink', email }));
      // THE 2026-10-01 ONE-FIELD FLOW ('continue', still answered for tabs running that build): an address with no
      // account gets one, created UNCONFIRMED with a random password, and the code is the only way in. Same OK either way.
      if (purpose === 'continue' && error && isUserNotFoundError(error.message)) {
        ({ data, error } = await generateLink({ type: 'signup', email, password: randomPassword() }));
      }
    }

    // ⚠️ PRE-ACCOUNT TAKEOVER. An address can already hold an UNCONFIRMED account whose password a stranger chose (the
    // retired two-field sign-up never proved the address). The code proves the address now — so whatever password the
    // unproven account carried must not survive into the owner's account.
    // ⚠️ …AND THE CODE WE MAIL MUST BE ASKED FOR AFTER THAT. GoTrue clears every pending one-time token of a user whose
    // password changes (confirmation_token, recovery_token, auth.one_time_tokens), so the code generated above dies with
    // the rotation. Proven on Production 2026-10-09: generate_link → PUT /admin/users → /verify 403 otp_expired 13 s
    // later, confirmation_token empty — every email sign-up was mailed a dead code. Ask again; that code is the one mailed.
    const pending = (data as { user?: { id?: string; email_confirmed_at?: string | null } } | null)?.user;
    if ((purpose === 'continue' || purpose === 'register') && !error && pending?.id && !pending.email_confirmed_at && lastLink) {
      await admin.auth.admin.updateUserById(pending.id, { password: randomPassword() });
      ({ data, error } = await generateLink(lastLink));
    }

    if (error) {
      const msg = String(error.message || '').toLowerCase();
      // LOG-IN AND „FORGOT PASSWORD" FOR AN UNKNOWN ADDRESS SAY SO (2026-10-03): the sheet answers „no account with
      // this email — create one" instead of leaving the person waiting for a code that was never sent. (It used to
      // answer OK here to hide which addresses are registered; sign-up has to say that now, so hiding it here only
      // cost people a dead wait.) Nothing is generated and nothing is mailed.
      if ((purpose === 'signin' || purpose === 'recovery') && isUserNotFoundError(msg)) {
        return NextResponse.json({ error: 'no_account' }, { status: 404 });
      }

      // Everything else is a REAL failure and is logged, whatever the purpose. (It used to be swallowed as „code
      // sent" for sign-in — a bad service-role key or a GoTrue 5xx then left people waiting forever, unlogged.)
      // eslint-disable-next-line no-console
      console.error(`[email-otp/send] generateLink (${purpose}):`, error.message);
      return NextResponse.json({ error: 'send_failed' }, { status: 502 });
    }

    const code = extractEmailOtp(data);
    if (!code) {
      // The provider answered but without a usable code — a contract change. Fail rather than mail a
      // blank or wrong code, which is indistinguishable from a broken account to the person receiving it.
      // The shape only (key names, the value's type and length), never the value: enough to see the next contract change.
      // eslint-disable-next-line no-console
      console.error(`[email-otp/send] no email_otp in generateLink response: ${describeOtpShape(data)}`);
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

    // `ok` and the code's LENGTH (a project-wide Supabase setting, 6–10, the same for every address) so the sheet knows
    // when the code is complete — never the code, never whether the account already existed.
    return NextResponse.json({ ok: true, length: code.length });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email-otp/send]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'send_failed' }, { status: 502 });
  }
}
