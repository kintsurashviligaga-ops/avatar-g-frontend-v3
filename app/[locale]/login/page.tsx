import { redirect } from 'next/navigation';
import AuthScreen from '@/components/auth/AuthScreen';
import { createServerClient } from '@/lib/supabase/server';
import { safeInternalPath } from '@/lib/auth/safeRedirect';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string; error?: string }>;
};

// BOUNDARY LEAK GUARD: an ALREADY-authenticated visitor who lands on /login (or /auth) is
// short-circuited straight into the workspace, server-side, so they never see the login form
// flash. `getUser()` (not getSession()) makes the gate authoritative — a server-revoked session
// can't slip through — and /login is not the hot launch path, so the extra round-trip is cheap.
// The post-login target is sanitised (safeInternalPath) against open-redirect, defaulting to the
// CURRENT locale's dashboard so OAuth + email login keep the user on the locale they signed in from.
export default async function LocaleLoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  const dest = safeInternalPath(sp?.redirect, `/${locale}/dashboard`);

  let authed = false;
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    authed = !!user;
  } catch {
    // Treat any auth-read failure as a guest → render the form.
  }
  // NOTE: redirect() throws NEXT_REDIRECT, so it MUST run OUTSIDE the try/catch above
  // (a catch would swallow the control-flow throw and wrongly render the form to an
  // authenticated user).
  if (authed) redirect(dest);

  // Surface an OAuth / code-exchange failure (the callback redirects here as ?error=…) instead
  // of dead-ending on a blank login form.
  const initialError = typeof sp?.error === 'string' && sp.error ? sp.error : undefined;
  return <AuthScreen mode="login" locale={locale} redirectTo={dest} initialError={initialError} />;
}
