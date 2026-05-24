'use client';

/**
 * LoginCard — premium one-click social authentication block.
 *
 * High-contrast Google / Apple / GitHub buttons with official brand SVG marks,
 * bound directly to the Supabase client-side OAuth trigger:
 *
 *   await supabase.auth.signInWithOAuth({
 *     provider, options: { redirectTo: `${origin}/auth/callback?redirect=…` }
 *   })
 *
 * The /auth/callback route exchanges the code for a session and bootstraps the
 * user's profile. Fails safe in demo mode (no Supabase env) with an inline note.
 */

import { useCallback, useState } from 'react';
import { createBrowserClient, isSupabaseConfigured } from '@/lib/supabase/browser';

type Lang = 'ka' | 'en' | 'ru';
type Provider = 'google' | 'apple' | 'github';

const LABELS: Record<Lang, { continueWith: string; notConfigured: string; redirecting: string }> = {
  ka: { continueWith: 'გააგრძელე', notConfigured: 'ავთენტიფიკაცია ამ გარემოში გამორთულია (demo).', redirecting: 'გადამისამართება…' },
  en: { continueWith: 'Continue with', notConfigured: 'Authentication is disabled in this environment (demo).', redirecting: 'Redirecting…' },
  ru: { continueWith: 'Продолжить с', notConfigured: 'Аутентификация отключена в этой среде (demo).', redirecting: 'Перенаправление…' },
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path fill="#000" d="M17.05 12.54c-.02-2.05 1.68-3.03 1.75-3.08-0.95-1.4-2.44-1.59-2.97-1.61-1.27-.13-2.47.74-3.11.74-.64 0-1.63-.72-2.68-.7-1.38.02-2.65.8-3.36 2.03-1.43 2.49-.37 6.17 1.03 8.19.68.99 1.5 2.1 2.57 2.06 1.03-.04 1.42-.67 2.66-.67 1.24 0 1.59.67 2.68.65 1.1-.02 1.8-1.01 2.48-2 .78-1.15 1.1-2.26 1.12-2.32-.02-.01-2.15-.83-2.17-3.28ZM15.02 6.3c.56-.68.94-1.62.84-2.56-.81.03-1.79.54-2.37 1.22-.52.6-.98 1.56-.86 2.48.9.07 1.83-.46 2.39-1.14Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path fill="#181717" d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.21.7.82.58A12 12 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z" />
    </svg>
  );
}

const PROVIDERS: Array<{ id: Provider; name: string; icon: () => JSX.Element }> = [
  { id: 'google', name: 'Google', icon: GoogleIcon },
  { id: 'apple', name: 'Apple', icon: AppleIcon },
  { id: 'github', name: 'GitHub', icon: GitHubIcon },
];

export interface LoginCardProps {
  locale?: Lang;
  /** App-internal path to land on after auth (default /<locale>/dashboard). */
  redirectTo?: string;
  className?: string;
}

export function LoginCard({ locale = 'ka', redirectTo, className }: LoginCardProps) {
  const t = LABELS[locale] ?? LABELS.ka;
  const [loading, setLoading] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOAuth = useCallback(async (provider: Provider) => {
    setError(null);
    const supabase = createBrowserClient();
    if (!supabase || !isSupabaseConfigured()) { setError(t.notConfigured); return; }
    setLoading(provider);
    const dest = redirectTo || `/${locale}/dashboard`;
    const callbackUrl = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(dest)}`;
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: callbackUrl },
      });
      if (oauthError) { setError(oauthError.message); setLoading(null); }
      // On success the browser is redirected to the provider — no further work.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OAuth failed');
      setLoading(null);
    }
  }, [locale, redirectTo, t.notConfigured]);

  return (
    <div className={`flex flex-col gap-2.5 ${className ?? ''}`}>
      {PROVIDERS.map(({ id, name, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => void handleOAuth(id)}
          disabled={loading !== null}
          aria-label={`${t.continueWith} ${name}`}
          className="group relative w-full h-11 rounded-xl bg-white text-[#1f1f1f] text-[14px] font-semibold flex items-center justify-center gap-3 border border-white/10 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.4)] hover:bg-white/90 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150"
        >
          <span className="absolute left-3.5 flex items-center">
            {loading === id
              ? <span className="h-4 w-4 rounded-full border-2 border-[#1f1f1f]/30 border-t-[#1f1f1f] animate-spin" />
              : <Icon />}
          </span>
          <span>{loading === id ? t.redirecting : `${t.continueWith} ${name}`}</span>
        </button>
      ))}
      {error && <p className="text-[12px] text-rose-300 px-1 text-center">{error}</p>}
    </div>
  );
}

export default LoginCard;
