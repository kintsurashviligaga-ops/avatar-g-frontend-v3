/**
 * GET /api/auth/whoami — read-only auth self-diagnostic.
 *
 * Returns ONLY the caller's own server-side auth view (their own email/flags — no other user's data,
 * no secrets, no mutation). Purpose: settle *why* /admin redirects. It reads the session exactly the
 * way the admin server component does (same createServerClient + the same middleware refresh runs for
 * /api/* too), so its `hasUser`/`email` are what the admin page sees.
 *
 *   hasUser:false                         → the session isn't readable server-side → THIS is why /admin
 *                                           redirects. Fix is in the auth/session layer, not the allowlist.
 *   hasUser:true + emailIsFounder:true    → server sees you as founder → /admin should render.
 *   hasUser:true + emailIsFounder:false   → you're signed in as a different/non-founder account.
 */
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ADMIN_EMAIL = 'kintsurashviligaga@gmail.com';

export async function GET() {
  let hasUser = false;
  let email: string | null = null;
  let metaRole = false;
  try {
    const supabase = createRouteHandlerClient();
    const { data: { user } } = await supabase.auth.getUser();
    hasUser = Boolean(user);
    email = user?.email ?? null;
    metaRole = isAdminUser(user);
  } catch {
    // fail-open: a diagnostic must never 500
  }

  const emailIsFounder = email?.trim().toLowerCase() === ADMIN_EMAIL;
  const isAdmin = emailIsFounder || metaRole;

  return NextResponse.json({
    hasUser,
    email,
    emailIsFounder,
    metaRole,
    isAdmin,
    diagnosis: !hasUser
      ? 'Server sees NO user for this request — the session is not readable server-side. This is why /admin redirects; the fix is in the auth/session/cookie layer, NOT the admin allowlist.'
      : emailIsFounder
        ? 'Server sees you as the founder email — /admin should render. If it still redirects, it is a render/caching mismatch, not authorization.'
        : `Server sees a non-founder account (${email ?? 'no email'}) — sign in as ${ADMIN_EMAIL} in this exact browser session.`,
  });
}
