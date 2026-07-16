import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { i18n } from '@/i18n.config';
import { safeInternalPath } from '@/lib/auth/safeRedirect';

export const dynamic = 'force-dynamic';

// The post-login landing page. The app's HOME is the film studio at
// /{locale}/dashboard — NOT /services (which felt like "login took me elsewhere").
const DEFAULT_POST_LOGIN = `/${i18n.defaultLocale}/dashboard`;

// Shared open-redirect guard: the previous local check only blocked '//' and let control-char
// bypasses (e.g. '/\t/evil.com', which the browser normalises to '//evil.com') resolve off-origin.
// safeInternalPath uses the WHATWG URL parser + origin-equality, closing every off-origin vector.
function resolveSafeNextPath(input: string | null) {
  return safeInternalPath(input, DEFAULT_POST_LOGIN);
}

async function ensureProfile(user: User) {
  try {
    const admin = createServiceRoleClient();
    const metadata = user.user_metadata ?? {};
    const fullName =
      metadata.full_name ||
      metadata.name ||
      [metadata.first_name, metadata.last_name].filter(Boolean).join(' ').trim() ||
      null;

    const avatarUrl = metadata.avatar_url || metadata.picture || null;

    await admin
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email ?? null,
          full_name: fullName,
          avatar_url: avatarUrl,
        },
        { onConflict: 'id' }
      );
  } catch {
    // Profile bootstrap failures should not block login.
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const nextParam = requestUrl.searchParams.get('next') || requestUrl.searchParams.get('redirect');
  const next = resolveSafeNextPath(nextParam);
  const callbackError =
    requestUrl.searchParams.get('error_description') || requestUrl.searchParams.get('error');

  if (callbackError) {
    const redirectUrl = new URL('/auth', requestUrl.origin);
    redirectUrl.searchParams.set('error', callbackError);
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = createServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const redirectUrl = new URL('/auth', requestUrl.origin);
      redirectUrl.searchParams.set('error', error.message);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // FAIL-OPEN (V4): the session cookies are already written by exchangeCodeForSession above, so the profile
  // bootstrap is best-effort ONLY. A transient auth-server hiccup on getUser()/ensureProfile() must never turn a
  // COMPLETED login into a 500 dead-end on /auth/callback — always fall through to the post-login redirect.
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await ensureProfile(user);
  } catch {
    // logged in already (cookies set); the profile row self-heals on the next authed request
  }

  return NextResponse.redirect(new URL(next || DEFAULT_POST_LOGIN, requestUrl.origin));
}