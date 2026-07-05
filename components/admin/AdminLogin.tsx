'use client';

/**
 * AdminLogin — the strict sign-in gate for the Master Control Panel (v358).
 *
 * Shown by app/[locale]/admin/page.tsx when NO user is signed in. Supports traditional email+password
 * credentials AND Google OAuth. On success the browser navigates back to /{locale}/admin, where the SERVER
 * re-checks the email allowlist / app_metadata gate before rendering the panel — so authenticating here
 * grants a session, NOT admin access. There is deliberately no signup path and no user_metadata role check:
 * admin authority is decided server-side off the allowlist, never off client-writable metadata.
 *
 * Reuses the proven, unit-tested auth primitives (callback-URL builder, timeout watchdog, OAuth error
 * translation) from the main AuthScreen so this gate inherits the same battle-tested edge handling.
 */
import { useCallback, useState } from 'react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { createBrowserClient, isSupabaseConfigured } from '@/lib/supabase/browser';
import { resolveAuthCallbackUrl, withAuthTimeout, describeOAuthError, AuthTimeoutError } from '@/components/auth/AuthScreen';

interface Props {
  locale: string;
  /** Where to land after a session is established (the server re-gates there). Defaults to /{locale}/admin. */
  redirectTo?: string;
}

export default function AdminLogin({ locale, redirectTo }: Props) {
  const ka = locale === 'ka';
  const target = redirectTo || `/${locale}/admin`;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'password' | 'google'>(null);
  const [error, setError] = useState<string | null>(null);

  const configured = isSupabaseConfigured();

  const t = {
    title: ka ? 'ადმინის შესვლა' : 'Admin sign-in',
    sub: ka ? 'მართვის პანელი — მხოლოდ ავტორიზებული ანგარიშებისთვის' : 'Control panel — authorized accounts only',
    email: ka ? 'ელ. ფოსტა' : 'Email',
    password: ka ? 'პაროლი' : 'Password',
    signIn: ka ? 'შესვლა' : 'Sign in',
    google: ka ? 'Google-ით გაგრძელება' : 'Continue with Google',
    or: ka ? 'ან' : 'or',
    working: ka ? 'მუშავდება…' : 'Working…',
    fillBoth: ka ? 'შეიყვანეთ ელ. ფოსტა და პაროლი' : 'Enter both email and password',
    timeout: ka ? 'დრო ამოიწურა. შეამოწმეთ ქსელი და სცადეთ თავიდან.' : 'The connection timed out. Check your network and try again.',
    unconfigured: ka ? 'ავთენტიფიკაცია არ არის კონფიგურირებული ამ გარემოში.' : 'Authentication is not configured in this environment.',
    note: ka ? 'ავტორიზაცია მოწმდება სერვერზე — შესვლა არ ნიშნავს ადმინ წვდომას.' : 'Authorization is checked on the server — signing in does not grant admin access.',
  };

  const signInPassword = useCallback(async () => {
    if (!email.trim() || !password) { setError(t.fillBoth); return; }
    if (!configured) { setError(t.unconfigured); return; }
    setBusy('password'); setError(null);
    try {
      const supabase = createBrowserClient();
      const { error: err } = await withAuthTimeout(
        supabase.auth.signInWithPassword({ email: email.trim(), password }),
      );
      if (err) { setError(err.message || (ka ? 'შესვლა ვერ მოხერხდა' : 'Sign-in failed')); setBusy(null); return; }
      // Session established → let the SERVER re-gate at the target (dashboard or access-denied).
      window.location.assign(target);
    } catch (e) {
      setError(e instanceof AuthTimeoutError ? t.timeout : (e instanceof Error ? e.message : 'Sign-in failed'));
      setBusy(null);
    }
  }, [email, password, configured, target, ka, t.fillBoth, t.unconfigured, t.timeout]);

  const signInGoogle = useCallback(async () => {
    if (!configured) { setError(t.unconfigured); return; }
    setBusy('google'); setError(null);
    try {
      const supabase = createBrowserClient();
      const callback = resolveAuthCallbackUrl(window.location.origin, process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL, target);
      const { error: err } = await withAuthTimeout(
        supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback } }),
      );
      if (err) { setError(describeOAuthError(err.message, 'google', locale)); setBusy(null); return; }
      // The SDK redirects the browser to Google on success; nothing more to do here.
    } catch (e) {
      setError(e instanceof AuthTimeoutError ? t.timeout : describeOAuthError(e instanceof Error ? e.message : null, 'google', locale));
      setBusy(null);
    }
  }, [configured, target, locale, t.unconfigured, t.timeout]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#06060d] px-4 py-10 text-white">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandLogo href={`/${locale}/dashboard`} size="nav" />
          <div>
            <h1 className="text-[17px] font-semibold text-white">{t.title}</h1>
            <p className="mt-1 text-[12px] text-gray-500">{t.sub}</p>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <button
            type="button"
            onClick={signInGoogle}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-white/[0.08] disabled:opacity-50"
          >
            <GoogleIcon />
            {busy === 'google' ? t.working : t.google}
          </button>

          <div className="flex items-center gap-3 py-0.5">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[10.5px] uppercase tracking-wider text-gray-600">{t.or}</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); void signInPassword(); }}
            className="space-y-2.5"
          >
            <input
              type="email"
              autoComplete="username"
              aria-label={t.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.email}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white placeholder:text-gray-600 focus:border-cyan-500/40 focus:outline-none"
            />
            <input
              type="password"
              autoComplete="current-password"
              aria-label={t.password}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.password}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white placeholder:text-gray-600 focus:border-cyan-500/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy !== null}
              className="w-full rounded-lg bg-cyan-500/90 px-4 py-2.5 text-[13px] font-semibold text-[#06060d] transition-colors hover:bg-cyan-400 disabled:opacity-50"
            >
              {busy === 'password' ? t.working : t.signIn}
            </button>
          </form>

          {error && (
            <p className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[12px] text-rose-300">{error}</p>
          )}
        </div>

        <p className="text-center text-[11px] leading-relaxed text-gray-600">{t.note}</p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.97 10.97 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
