import type { Metadata } from 'next';
import { FilmStudioHome } from '@/components/studio/FilmStudioHome';
import { createServerClient } from '@/lib/supabase/server';
import { STUDIO_EMPTY, studioLang } from '@/lib/copy/studioEmpty';
import { BRAND_V1 } from '@/lib/brand/v1';

// Home surface = the 30-Second Cinematic Film Studio (product decision).
// The full multimodal chat hub (MyAvatarChatV2) is preserved and demoted to
// /{locale}/chat — reachable from the studio top bar. Rollback path is a
// one-line import swap back to MyAvatarChatV2 here.

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
};

/**
 * The studio's own <head>. The body is client-rendered, so this is where the server HTML carries the locked
 * video-first copy (lib/copy/studioEmpty.ts — the same strings the client shows). It also stops the page from
 * inheriting the layout's og:url of /ka and the old share image.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const lang = studioLang(locale);
  const c = STUDIO_EMPTY[lang];
  return {
    title: { absolute: c.title },
    description: c.sub,
    alternates: {
      canonical: `/${lang}/dashboard`,
      languages: { ka: '/ka/dashboard', en: '/en/dashboard', ru: '/ru/dashboard', 'x-default': '/ka/dashboard' },
    },
    openGraph: {
      type: 'website',
      title: c.title,
      description: c.sub,
      url: `/${lang}/dashboard`,
      siteName: 'MyAvatar.ge',
      images: [{ url: BRAND_V1.og.src, width: BRAND_V1.og.width, height: BRAND_V1.og.height, alt: c.title }],
    },
    twitter: { card: 'summary_large_image', title: c.title, description: c.sub, images: [BRAND_V1.og.src] },
  };
}

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;

  let userName = 'Guest';
  let userEmail: string | undefined;
  let isAuthenticated = false;

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
    }
  } catch {
    // Guest fallback
  }

  // AUTH JOURNEY (product decision): a first-time sign-in now lands DIRECTLY in the chat
  // workspace — no forced full-page /onboarding interstitial. The in-place WelcomeOnboarding
  // overlay (ChatChrome) greets new users instead. The avatar-naming wizard at /{locale}/onboarding
  // is no longer force-triggered but stays reachable by direct URL as an OPTIONAL step (it
  // self-guards: named-avatar → dashboard, unauthed → login). This removes the post-OAuth
  // "landing screen" bounce that made signing in feel like it took you somewhere else.

  return (
    <FilmStudioHome
      locale={locale}
      userName={userName}
      userEmail={userEmail}
      isAuthenticated={isAuthenticated}
    />
  );
}
