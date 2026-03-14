'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/browser';

export default function LocaleSignupPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale || 'ka';
  const supabase = createBrowserClient();

  const signUpWithGitHub = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL || `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  const signUpWithEmail = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = fd.get('email') as string;
    const pass = fd.get('password') as string;

    if (pass.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="relative min-h-screen bg-transparent flex items-center justify-center px-4 overflow-hidden">
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 20% 18%, rgba(34,211,238,0.08), transparent 52%), radial-gradient(circle at 80% 82%, rgba(6,182,212,0.08), transparent 52%)' }} />
        <div className="relative z-10 w-full max-w-sm text-center space-y-4 rounded-3xl p-6" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
          <div className="w-16 h-16 mx-auto bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center">
            <span className="text-2xl">✓</span>
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Check your email</h2>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>We sent a confirmation link to your email. Click it to activate your account.</p>
          <Link href={`/${locale}/login`} className="text-sm transition-colors" style={{ color: 'var(--color-accent)' }}>
            ← Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-transparent flex items-center justify-center px-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 20% 18%, rgba(34,211,238,0.08), transparent 52%), radial-gradient(circle at 80% 82%, rgba(6,182,212,0.08), transparent 52%)' }} />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Create account</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>Join MyAvatar.ge for free</p>
        </div>

        <div className="rounded-3xl p-6 space-y-4" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
          {/* GitHub OAuth */}
          <button
            onClick={signUpWithGitHub}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 font-semibold text-sm py-3 rounded-xl transition-all disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.38.6.1.82-.26.82-.58l-.02-2.03c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 013.01-.4c1.02 0 2.05.14 3.01.4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.9 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22l-.01 3.3c0 .32.21.69.82.57C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            {loading ? 'Redirecting...' : 'Continue with GitHub'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: 'var(--color-border)' }} />
            </div>
            <div className="relative flex justify-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              <span className="px-3 bg-transparent rounded">or sign up with email</span>
            </div>
          </div>

          {/* Email/password */}
          <form onSubmit={signUpWithEmail} className="space-y-3">
            <input
              name="email"
              type="email"
              required
              placeholder="Email"
              className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
              style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--color-text)' }}
            />
            <input
              name="password"
              type="password"
              required
              placeholder="Password (min 6 characters)"
              className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
              style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--color-text)' }}
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full font-semibold text-sm py-2.5 rounded-xl transition-all disabled:opacity-50 hover:opacity-90"
              style={{ backgroundColor: 'var(--card-hover)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Already have an account?{' '}
            <Link href={`/${locale}/login`} className="underline transition-colors" style={{ color: 'var(--color-text-secondary)' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
