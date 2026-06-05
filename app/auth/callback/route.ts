import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { i18n } from '@/i18n.config';

export const dynamic = 'force-dynamic';

// The post-login landing page. The app's HOME is the film studio at
// /{locale}/dashboard — NOT /services (which felt like "login took me elsewhere").
const DEFAULT_POST_LOGIN = `/${i18n.defaultLocale}/dashboard`;

function resolveSafeNextPath(input: string | null) {
  // Reject empty, non-absolute, or protocol-relative (//evil.com) targets — an
  // open-redirect guard — and fall back to the home dashboard.
  if (!input || !input.startsWith('/') || input.startsWith('//')) {
    return DEFAULT_POST_LOGIN;
  }
  return input;
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await ensureProfile(user);
  }

  return NextResponse.redirect(new URL(next || DEFAULT_POST_LOGIN, requestUrl.origin));
}