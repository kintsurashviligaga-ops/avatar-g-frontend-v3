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

    // ⚠️ FILL GAPS, NEVER OVERWRITE. This used to UPSERT name + avatar from the provider on every pass through the
    // callback — and since 2026-10-01 every password reset passes through here too — so a photo the person uploaded
    // was replaced by NULL (email accounts) or by the Google picture (OAuth), and a phone account's NULL email broke the
    // NOT NULL column (review, 2026-10-01). The sign-up triggers create the row; this only completes it.
    const { data: existing } = await admin
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    if (!existing) {
      await admin.from('profiles').upsert(
        { id: user.id, email: user.email ?? `${user.id}@placeholder.local`, full_name: fullName, avatar_url: avatarUrl },
        { onConflict: 'id', ignoreDuplicates: true },
      );
    } else {
      const patch: { full_name?: string; avatar_url?: string } = {};
      if (!existing.full_name && fullName) patch.full_name = fullName;
      if (!existing.avatar_url && avatarUrl) patch.avatar_url = avatarUrl;
      if (Object.keys(patch).length) await admin.from('profiles').update(patch).eq('id', user.id);
    }
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

  // A failure goes back to the sign-in sheet IN THE LANGUAGE the person was in: `next` (/en/dashboard…) says which;
  // bare /auth falls back to their NEXT_LOCALE cookie (next.config.js). It used to be /auth → always Georgian.
  // Only an EXPLICIT next counts: without one, `next` is the /ka default and would pin Georgian again.
  const lang = nextParam ? /^\/(ka|en|ru)(\/|\?|$)/.exec(next || '')?.[1] : undefined;
  // A password-reset link that failed (used, expired, opened first by a mail scanner) goes back to its own landing:
  // with no session, the studio says the link expired and offers sign-in again (lib/routing/signIn.ts `recover`).
  const isRecover = !!nextParam && /[?&]auth=recover(&|$)/.test(next || '');
  const signInAgain = isRecover ? (next as string) : lang ? `/${lang}/auth` : '/auth';

  if (callbackError) {
    const redirectUrl = new URL(signInAgain, requestUrl.origin);
    redirectUrl.searchParams.set('error', callbackError);
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = createServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const redirectUrl = new URL(signInAgain, requestUrl.origin);
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