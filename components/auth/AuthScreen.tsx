'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createBrowserClient, isSupabaseConfigured } from '@/lib/supabase/browser';

// ─── Types ───────────────────────────────────────────────────────────────────

type AuthMode = 'login' | 'signup';

interface AuthScreenProps {
  mode: AuthMode;
  locale: string;
  redirectTo?: string;
  /** Seed the error banner (e.g. an OAuth failure the /auth/callback redirected here as ?error=…). */
  initialError?: string;
}

type OAuthProvider = 'apple' | 'google' | 'github' | 'facebook' | 'twitter' | 'linkedin_oidc' | 'discord';

interface ProviderConfig {
  id: OAuthProvider;
  label: string;
  icon: React.ReactNode;
  className: string;
  style?: React.CSSProperties;
}

/**
 * PHASE 41 §1 — Robust OAuth / magic-link callback URL builder.
 *
 * The previous logic used NEXT_PUBLIC_AUTH_REDIRECT_URL verbatim, which (a)
 * silently dropped the post-login `redirect` target and (b) hardcoded a single
 * origin — so any non-production origin (localhost, a Vercel preview URL) sent
 * the OAuth round-trip back to the wrong host and dead-ended the session
 * ("redirects into the void"). This always rebinds the callback to the LIVE
 * runtime origin (each environment completes its own handshake) and always
 * carries the redirect target forward.
 *
 * Pure + exported for unit testing — no window/env access inside.
 */
export function resolveAuthCallbackUrl(
  origin: string,
  configured: string | undefined,
  redirectTo: string,
): string {
  let path = '/auth/callback';
  if (configured) {
    try {
      // A full URL was configured — keep its PATH but discard its origin so we
      // never cross-redirect between environments.
      path = new URL(configured).pathname || path;
    } catch {
      // Not a full URL (likely a bare path) — normalize to an absolute path.
      path = configured.startsWith('/') ? configured : `/${configured}`;
    }
  }
  const base = `${origin}${path}`;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}redirect=${encodeURIComponent(redirectTo || '/')}`;
}

/**
 * PHASE 48 §1 — Auth handshake watchdog.
 *
 * THE PRODUCTION BUG THIS FIXES
 * -----------------------------
 * Every auth handler did `setLoading(true)` and only reset it on the Supabase
 * promise resolving. If that promise never settles — network stall, Supabase
 * unreachable, a token handshake that hangs — the client is left in an INFINITE
 * frozen spinner with no escape, exactly the "fail to hydrate or maintain a
 * session state" symptom from the live audit.
 *
 * `withAuthTimeout` races the auth call against a bounded deadline so a hung
 * handshake rejects deterministically; the handler then clears loading and
 * surfaces an honest, actionable error instead of freezing forever.
 *
 * On the OAuth/sign-in SUCCESS path the SDK redirects (or we navigate), so the
 * promise settles well before the deadline and the timer is discarded — the
 * watchdog only ever fires on a genuine stall.
 */
export const AUTH_TIMEOUT_MS = 15000;

export class AuthTimeoutError extends Error {
  constructor() {
    super('AUTH_TIMEOUT');
    this.name = 'AuthTimeoutError';
  }
}

export function withAuthTimeout<T>(promise: PromiseLike<T>, ms: number = AUTH_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AuthTimeoutError()), ms);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

const TIMEOUT_MESSAGE =
  'The connection timed out. Please check your network and try again.';

/**
 * PHASE 49 §2 — Honest OAuth error translation.
 *
 * THE LIVE FAILURE
 * ----------------
 * Clicking "Continue with Google" surfaced the raw GoTrue payload
 *   {"code":400,"error_code":"validation_failed",
 *    "msg":"Unsupported provider: provider is not enabled"}
 * The client ALREADY sends the correct payload (`provider: 'google'`); GoTrue
 * returns this ONLY when the Google provider is toggled OFF in the Supabase
 * dashboard (Authentication → Providers → Google). That is a server-side
 * configuration state the browser cannot fix — but it must NOT dead-end the user
 * with an opaque JSON blob. We detect that exact condition and return a clear,
 * localized, actionable message that steers the user to a working path (email).
 *
 * Pure + exported so the mapping is unit-tested without a live Supabase.
 */
export function describeOAuthError(
  rawMessage: string | null | undefined,
  provider: string,
  locale: string = 'en',
): string {
  const raw = (rawMessage || '').toLowerCase();
  const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'OAuth';
  const providerDisabled =
    raw.includes('provider is not enabled') ||
    raw.includes('unsupported provider') ||
    raw.includes('validation_failed');

  if (providerDisabled) {
    switch (locale) {
      case 'ka':
        return `${providerLabel}-ით შესვლა ამჟამად მიუწვდომელია. გთხოვთ, გამოიყენოთ ელ. ფოსტით შესვლა.`;
      case 'ru':
        return `Вход через ${providerLabel} сейчас недоступен. Пожалуйста, войдите по электронной почте.`;
      default:
        return `${providerLabel} sign-in is temporarily unavailable. Please sign in with your email instead.`;
    }
  }

  if (rawMessage && rawMessage.trim().length > 0) return rawMessage;

  switch (locale) {
    case 'ka':
      return 'შესვლა ვერ მოხერხდა. გთხოვთ, სცადოთ თავიდან.';
    case 'ru':
      return 'Не удалось войти. Пожалуйста, попробуйте снова.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

// ─── Provider Icons ──────────────────────────────────────────────────────────

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.97 10.97 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.38.6.1.82-.26.82-.58l-.02-2.03c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016.02 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.9 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22l-.01 3.3c0 .32.21.69.82.57C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function XTwitterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

function DemoScreen({ locale }: { locale: string }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-md w-full text-center space-y-6 rounded-3xl border border-white/10 bg-white/5 p-10 backdrop-blur-xl">
        <div className="text-4xl">🚀</div>
        <h2 className="text-2xl font-bold text-white">MyAvatar</h2>
        <p className="text-slate-300">Running in demo mode — full auth requires Supabase configuration.</p>
        <a
          href={`/${locale}/dashboard`}
          className="block w-full rounded-2xl py-3 text-center font-semibold text-white transition-all"
          style={{ background: 'var(--color-accent)' }}
        >
          Continue to Dashboard →
        </a>
      </div>
    </div>
  );
}

export default function AuthScreen({ mode: initialMode, locale, redirectTo = '/', initialError }: AuthScreenProps) {
  if (!isSupabaseConfigured()) {
    return <DemoScreen locale={locale} />;
  }
  return <AuthScreenInner mode={initialMode} locale={locale} redirectTo={redirectTo} initialError={initialError} />;
}

function AuthScreenInner({ mode: initialMode, locale, redirectTo = '/', initialError }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  // Seed with any callback-supplied error (?error=…) so a failed OAuth handshake shows a reason
  // instead of a blank form; cleared as soon as the user retries (every handler calls setError(null)).
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showMoreProviders, setShowMoreProviders] = useState(false);
  // Which OAuth providers the Supabase project ACTUALLY has enabled. null =
  // not yet known (show none → email-only, never a dead button). Self-configuring:
  // we ask GoTrue's public /settings so we never render "Continue with Google"
  // when Google is toggled off (the live "login doesn't work" — a dead button).
  const [enabledOAuth, setEnabledOAuth] = useState<Set<string> | null>(null);

  const searchParams = useSearchParams();
  const supabase = createBrowserClient();

  // Capture referral code from URL (?ref=CODE) and store for auto-redeem after auth
  useEffect(() => {
    const refCode = searchParams?.get('ref');
    if (refCode && refCode.length >= 6 && typeof window !== 'undefined') {
      localStorage.setItem('agentg_pending_referral', refCode.toUpperCase());
    }
  }, [searchParams]);

  // Discover the enabled OAuth providers from GoTrue's public settings endpoint,
  // so the UI only ever offers buttons that actually work. Fail-safe: on any
  // error we fall back to GitHub (the confirmed-enabled provider) so the social
  // path never vanishes; email/password is always available regardless.
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      setEnabledOAuth(new Set(['github']));
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon }, signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { external?: Record<string, boolean> } | null) => {
        const ext = j?.external ?? {};
        const enabled = Object.keys(ext).filter((k) => ext[k]);
        setEnabledOAuth(new Set(enabled.length ? enabled : ['github']));
      })
      .catch(() => setEnabledOAuth(new Set(['github'])))
      .finally(() => clearTimeout(t));
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, []);

  const callbackUrl = typeof window !== 'undefined'
    ? resolveAuthCallbackUrl(window.location.origin, process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL, redirectTo)
    : '/auth/callback';

  // ─── OAuth handler ───────────────────────────────────────────────────────

  const handleOAuth = useCallback(async (provider: OAuthProvider) => {
    setLoading(true);
    setLoadingProvider(provider);
    setError(null);

    try {
      const { error } = await withAuthTimeout(
        supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: callbackUrl },
        }),
      );

      if (error) {
        // Translate the cryptic GoTrue "provider is not enabled" payload into an
        // honest, localized, actionable message instead of dumping raw JSON.
        setError(describeOAuthError(error.message, provider, locale));
        setLoading(false);
        setLoadingProvider(null);
      }
      // Success: the SDK is redirecting to the provider — keep the spinner.
    } catch (err) {
      // Hung handshake (timeout or network failure) — never freeze the screen.
      setError(err instanceof AuthTimeoutError ? TIMEOUT_MESSAGE : describeOAuthError(null, provider, locale));
      setLoading(false);
      setLoadingProvider(null);
    }
  }, [supabase, callbackUrl, locale]);

  // ─── Email handler ───────────────────────────────────────────────────────

  const handleEmailSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setLoadingProvider('email');
    setError(null);

    const fd = new FormData(e.currentTarget);
    const email = fd.get('email') as string;
    const password = fd.get('password') as string;
    const confirmPassword = fd.get('confirmPassword') as string;

    if (mode === 'signup') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        setLoading(false);
        setLoadingProvider(null);
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        setLoadingProvider(null);
        return;
      }

      try {
        const { error } = await withAuthTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: callbackUrl },
          }),
        );

        if (error) {
          setError(error.message);
        } else {
          setSuccess(true);
        }
      } catch (err) {
        setError(err instanceof AuthTimeoutError ? TIMEOUT_MESSAGE : 'Sign-up failed. Please try again.');
      }
    } else {
      try {
        const { error } = await withAuthTimeout(
          supabase.auth.signInWithPassword({ email, password }),
        );

        if (error) {
          setError(error.message);
        } else {
          window.location.href = redirectTo;
          return;
        }
      } catch (err) {
        setError(err instanceof AuthTimeoutError ? TIMEOUT_MESSAGE : 'Sign-in failed. Please try again.');
      }
    }

    setLoading(false);
    setLoadingProvider(null);
  }, [supabase, mode, redirectTo, callbackUrl]);

  // ─── Forgot password ────────────────────────────────────────────────────

  const handleForgotPassword = useCallback(async () => {
    const email = (document.querySelector('input[name="email"]') as HTMLInputElement)?.value;
    if (!email) {
      setError('Enter your email address first');
      return;
    }

    setLoading(true);
    setLoadingProvider('forgot');
    setError(null);

    try {
      const { error } = await withAuthTimeout(
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback',
        }),
      );

      if (error) {
        setError(error.message);
      } else {
        setError(null);
        setSuccess(true);
      }
    } catch (err) {
      setError(err instanceof AuthTimeoutError ? TIMEOUT_MESSAGE : 'Request failed. Please try again.');
    }

    setLoading(false);
    setLoadingProvider(null);
  }, [supabase]);

  // ─── Provider configs ────────────────────────────────────────────────────

  const primaryProviders: ProviderConfig[] = [
    {
      id: 'apple',
      label: 'Continue with Apple',
      icon: <AppleIcon />,
      className: 'bg-white text-black hover:bg-gray-100',
    },
    {
      id: 'google',
      label: 'Continue with Google',
      icon: <GoogleIcon />,
      className: 'bg-white text-gray-800 hover:bg-gray-100',
    },
    {
      id: 'github',
      label: 'Continue with GitHub',
      icon: <GitHubIcon />,
      className: 'bg-[#24292f] text-white hover:bg-[#2f363d]',
    },
  ];

  const secondaryProviders: ProviderConfig[] = [
    {
      id: 'facebook',
      label: 'Facebook',
      icon: <FacebookIcon />,
      className: 'text-white hover:opacity-90',
      style: { backgroundColor: '#1877F2' },
    },
    {
      id: 'twitter',
      label: 'X / Twitter',
      icon: <XTwitterIcon />,
      className: 'text-white hover:opacity-90',
      style: { backgroundColor: '#000000' },
    },
    {
      id: 'linkedin_oidc',
      label: 'LinkedIn',
      icon: <LinkedInIcon />,
      className: 'text-white hover:opacity-90',
      style: { backgroundColor: '#0A66C2' },
    },
    {
      id: 'discord',
      label: 'Discord',
      icon: <DiscordIcon />,
      className: 'text-white hover:opacity-90',
      style: { backgroundColor: '#5865F2' },
    },
  ];

  // Only surface providers the project has enabled. While discovery is pending
  // (enabledOAuth === null) we show none — email/password stays the reliable
  // path and no dead OAuth button ever flashes.
  const isProviderLive = (id: string) => enabledOAuth?.has(id) ?? false;
  const livePrimary = primaryProviders.filter((p) => isProviderLive(p.id));
  const liveSecondary = secondaryProviders.filter((p) => isProviderLive(p.id));

  // ─── Success state (email confirmation) ──────────────────────────────────

  if (success) {
    const isForgot = loadingProvider === 'forgot';
    return (
      <div className="relative min-h-[100dvh] flex items-center justify-center px-4 overflow-hidden">
        <BgGlow />
        <div className="relative z-10 w-full max-w-[420px] text-center p-8 rounded-2xl holo-panel">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            {isForgot ? 'Check your email' : 'Verify your email'}
          </h2>
          <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            {isForgot
              ? 'We sent a password reset link to your email.'
              : 'We sent a confirmation link to your email. Click it to activate your account.'}
          </p>
          <button
            onClick={() => { setSuccess(false); setMode('login'); setLoadingProvider(null); }}
            className="text-sm font-medium transition-colors"
            style={{ color: 'var(--color-accent)' }}
          >
            ← Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  // ─── Main auth screen ────────────────────────────────────────────────────

  return (
    <div className="relative min-h-[100dvh] flex items-center justify-center px-4 py-12 overflow-hidden">
      <BgGlow />

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Logo + Title */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto mb-4 relative">
            <Image
              src="/brand/gemini-rocket-clean.png"
              alt="MyAvatar"
              fill
              sizes="48px"
              className="object-contain"
            />
          </div>
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
            {mode === 'signup' ? 'Create account' : 'Welcome back'}
          </h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            {mode === 'signup'
              ? 'Join MyAvatar and start creating with AI'
              : 'Sign in to MyAvatar'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="rounded-2xl p-6 sm:p-8 holo-panel">

          {/* Primary Social Providers — only the ones the project enabled. */}
          {livePrimary.length > 0 && (
            <div className="space-y-3">
              {livePrimary.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => handleOAuth(provider.id)}
                  disabled={loading}
                  className={`w-full flex items-center justify-center gap-3 font-medium text-[15px] h-12 rounded-xl transition-all duration-200 disabled:opacity-50 ${provider.className}`}
                  style={provider.style}
                >
                  {loadingProvider === provider.id ? <SpinnerIcon /> : provider.icon}
                  <span>{loadingProvider === provider.id ? 'Redirecting…' : provider.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Secondary Providers — only shown when some are actually enabled. */}
          {liveSecondary.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowMoreProviders(!showMoreProviders)}
                className="w-full flex items-center justify-center gap-2 text-xs py-2 transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <span>{showMoreProviders ? 'Fewer options' : 'More options'}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform duration-200 ${showMoreProviders ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{
                  maxHeight: showMoreProviders ? '200px' : '0',
                  opacity: showMoreProviders ? 1 : 0,
                }}
              >
                <div className="grid grid-cols-4 gap-2 pt-1 pb-2">
                  {liveSecondary.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => handleOAuth(provider.id)}
                      disabled={loading}
                      title={provider.label}
                      className={`flex items-center justify-center h-10 rounded-lg transition-all duration-200 disabled:opacity-50 ${provider.className}`}
                      style={provider.style}
                    >
                      {loadingProvider === provider.id ? <SpinnerIcon /> : provider.icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Divider — only meaningful when social buttons appear above it. */}
          {(livePrimary.length > 0 || liveSecondary.length > 0) && (
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full" style={{ borderTop: '1px solid var(--color-border)' }} />
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 text-xs" style={{ color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-surface)' }}>
                  or continue with email
                </span>
              </div>
            </div>
          )}

          {/* Email Form */}
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <div>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="Email address"
                className="w-full h-12 rounded-xl px-4 text-sm transition-all duration-200 focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  color: 'var(--color-text)',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(34,211,238,0.5)'; e.target.style.boxShadow = '0 0 0 2px rgba(34,211,238,0.15)'; }}
                onBlur={(e) => { e.target.style.borderColor = ''; e.target.style.boxShadow = ''; }}
              />
            </div>

            {/* Password field */}
            <div className="relative">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder={mode === 'signup' ? 'Create password (min 6 characters)' : 'Password'}
                minLength={mode === 'signup' ? 6 : undefined}
                className="w-full h-12 rounded-xl px-4 pr-11 text-sm transition-all duration-200 focus:outline-none"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  color: 'var(--color-text)',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(34,211,238,0.5)'; e.target.style.boxShadow = '0 0 0 2px rgba(34,211,238,0.15)'; }}
                onBlur={(e) => { e.target.style.borderColor = ''; e.target.style.boxShadow = ''; }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            {/* Confirm password for signup */}
            {mode === 'signup' && (
              <div className="relative">
                <input
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  minLength={6}
                  className="w-full h-12 rounded-xl px-4 pr-11 text-sm transition-all duration-200 focus:outline-none"
                  style={{
                    backgroundColor: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--color-text)',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'rgba(34,211,238,0.5)'; e.target.style.boxShadow = '0 0 0 2px rgba(34,211,238,0.15)'; }}
                  onBlur={(e) => { e.target.style.borderColor = ''; e.target.style.boxShadow = ''; }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            )}

            {/* Forgot password link */}
            {mode === 'login' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="text-xs transition-colors hover:underline disabled:opacity-50"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="cinematic-btn cinematic-btn-primary w-full h-12 text-[15px] rounded-xl disabled:opacity-50"
            >
              {loading && loadingProvider === 'email' ? (
                <span className="flex items-center justify-center gap-2">
                  <SpinnerIcon />
                  {mode === 'signup' ? 'Creating account…' : 'Signing in…'}
                </span>
              ) : (
                mode === 'signup' ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          {/* Mode toggle */}
          <p className="text-center text-sm mt-6" style={{ color: 'var(--color-text-tertiary)' }}>
            {mode === 'login' ? (
              <>
                New to MyAvatar?{' '}
                <button
                  onClick={() => { setMode('signup'); setError(null); }}
                  className="font-medium transition-colors hover:underline"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Create account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => { setMode('login'); setError(null); }}
                  className="font-medium transition-colors hover:underline"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs mt-6 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
          By continuing, you agree to MyAvatar&apos;s{' '}
          <Link href={`/${locale}/terms`} className="underline hover:no-underline" style={{ color: 'var(--color-text-secondary)' }}>
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href={`/${locale}/privacy`} className="underline hover:no-underline" style={{ color: 'var(--color-text-secondary)' }}>
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}

// ─── Background Glow ─────────────────────────────────────────────────────────

function BgGlow() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0" style={{
        background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(34,211,238,0.05) 0%, transparent 60%)',
      }} />
      <div className="pointer-events-none absolute inset-0 glow-drift" style={{
        background: 'radial-gradient(circle at 20% 80%, rgba(6,182,212,0.03) 0%, transparent 40%), radial-gradient(circle at 80% 20%, rgba(34,211,238,0.025) 0%, transparent 40%)',
      }} />
      {/* Structural grid hint */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.3) 0.5px, transparent 0.5px)',
        backgroundSize: '32px 32px',
      }} />
    </>
  );
}
