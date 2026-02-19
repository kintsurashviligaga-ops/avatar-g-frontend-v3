import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function resolveSafeNextPath(input: string | null) {
  if (!input || !input.startsWith('/')) {
    return '/workspace';
  }

  if (input.startsWith('//')) {
    return '/workspace';
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
  const next = resolveSafeNextPath(requestUrl.searchParams.get('next'));
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

  return NextResponse.redirect(new URL(next || '/workspace', requestUrl.origin));
}