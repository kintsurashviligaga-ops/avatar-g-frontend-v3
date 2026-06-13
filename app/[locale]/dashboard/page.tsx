import { redirect } from 'next/navigation';
import { FilmStudioHome } from '@/components/studio/FilmStudioHome';
import { createServerClient } from '@/lib/supabase/server';

// Home surface = the 30-Second Cinematic Film Studio (product decision).
// The full multimodal chat hub (MyAvatarChatV2) is preserved and demoted to
// /{locale}/chat — reachable from the studio top bar. Rollback path is a
// one-line import swap back to MyAvatarChatV2 here.

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;

  let userName = 'Guest';
  let userEmail: string | undefined;
  let isAuthenticated = false;
  let shouldOnboard = false;

  try {
    const supabase = createServerClient();
    // PERF (TTFB): the middleware (updateSession) already validated THIS request's
    // session via getUser() moments ago, so reading it from the cookie here with
    // getSession() is safe AND skips a second auth-server network round-trip on the
    // cold launch path — and the dashboard is the app's entry surface, so that
    // round-trip was directly inflating launch TTFB. All sensitive operations still
    // run through authed API routes that validate independently.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;

    if (user) {
      isAuthenticated = true;
      userName = user.user_metadata?.full_name || user.email || 'Authenticated User';
      userEmail = user.email ?? undefined;

      // First-login onboarding gate
      const { data: avatar } = await supabase
        .from('avatars')
        .select('id')
        .eq('user_id', user.id)
        .not('name', 'is', null)
        .limit(1)
        .maybeSingle();

      if (!avatar) {
        shouldOnboard = true;
      }
    }
  } catch {
    // Guest fallback
  }

  if (shouldOnboard) {
    redirect(`/${locale}/onboarding`);
  }

  return (
    <FilmStudioHome
      locale={locale}
      userName={userName}
      userEmail={userEmail}
      isAuthenticated={isAuthenticated}
    />
  );
}
