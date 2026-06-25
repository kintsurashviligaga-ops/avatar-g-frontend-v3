import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/register — friction-free email/password sign-up.
 *
 * Why this exists: the Supabase project requires email confirmation
 * (`mailer_autoconfirm = false`) but its mailer doesn't reliably deliver, so the
 * plain client `auth.signUp()` created the account, returned NO session, and left
 * every new user stuck waiting for a confirmation email that never arrived — i.e.
 * "sign-up not working". The global flag can only be flipped from the dashboard /
 * Management API (the access token here is expired), so we fix it at the app layer:
 * create the user pre-confirmed with the service-role admin API, then the browser
 * signs them straight in. No email round-trip, no dead end.
 *
 * NOTE: this intentionally skips email ownership verification (same end-state the
 * "disable email confirmation" option would produce). Re-enable confirmation by
 * turning email confirmation back on in Supabase and deleting this route.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegisterBody = { email?: string; password?: string; name?: string };

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 5 attempts / 15 min per IP — same tier as the OTP auth routes.
  const limited = await checkRateLimit(req, RATE_LIMITS.AUTH);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as RegisterBody;
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const fullName = String(body.name || '').trim();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, code: 'invalid_email' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ ok: false, code: 'weak_password' }, { status: 400 });
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    // Service role not configured in this env → let the client fall back to the
    // plain signUp() path (which then shows the confirm-email notice).
    return NextResponse.json({ ok: false, code: 'unavailable' }, { status: 503 });
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    ...(fullName ? { user_metadata: { full_name: fullName } } : {}),
  });

  if (error) {
    const msg = (error.message || '').toLowerCase();
    // Already registered → tell the client so it can steer the user to sign-in.
    if (
      error.status === 422 ||
      /already|exists|registered|duplicate/.test(msg)
    ) {
      return NextResponse.json({ ok: false, code: 'exists' }, { status: 200 });
    }
    if (/password/.test(msg)) {
      return NextResponse.json({ ok: false, code: 'weak_password' }, { status: 400 });
    }
    return NextResponse.json({ ok: false, code: 'error' }, { status: 500 });
  }

  // Confirmed account created. The browser now calls signInWithPassword() to
  // obtain the session cookie — we deliberately don't mint a session here so the
  // SSR cookie is set by the Supabase client on the user's device.
  return NextResponse.json({ ok: true }, { status: 200 });
}
