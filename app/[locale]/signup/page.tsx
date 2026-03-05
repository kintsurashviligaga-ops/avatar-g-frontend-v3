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
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-42"
          style={{ backgroundImage: "url('/brand/background-main.svg')" }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(34,211,238,0.16),transparent_52%),radial-gradient(circle_at_80%_82%,rgba(139,92,246,0.16),transparent_52%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.62),rgba(2,6,23,0.4)_35%,rgba(2,6,23,0.66)_100%)]" />
        <div className="relative z-10 w-full max-w-sm text-center space-y-4 bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6">
          <div className="w-16 h-16 mx-auto bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center">
            <span className="text-2xl">✓</span>
          </div>
          <h2 className="text-xl font-bold text-white">Check your email</h2>
          <p className="text-sm text-white/50">We sent a confirmation link to your email. Click it to activate your account.</p>
          <Link href={`/${locale}/login`} className="text-sm text-cyan-300 hover:text-cyan-200 transition-colors">
            ← Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-transparent flex items-center justify-center px-4 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-42"
        style={{ backgroundImage: "url('/brand/background-main.svg')" }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(34,211,238,0.16),transparent_52%),radial-gradient(circle_at_80%_82%,rgba(139,92,246,0.16),transparent_52%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.62),rgba(2,6,23,0.4)_35%,rgba(2,6,23,0.66)_100%)]" />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Create account</h1>
          <p className="text-white/40 text-sm mt-1">Join MyAvatar.ge for free</p>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6 space-y-4">
          {/* GitHub OAuth */}
          <button
            onClick={signUpWithGitHub}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white text-[#050510] font-semibold text-sm py-3 rounded-xl hover:bg-white/90 transition-all disabled:opacity-50"
          >
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.38.6.1.82-.26.82-.58l-.02-2.03c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 013.01-.4c1.02 0 2.05.14 3.01.4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.9 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22l-.01 3.3c0 .32.21.69.82.57C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            {loading ? 'Redirecting...' : 'Continue with GitHub'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.08]" />
            </div>
            <div className="relative flex justify-center text-xs text-white/30">
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
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20"
            />
            <input
              name="password"
              type="password"
              required
              placeholder="Password (min 6 characters)"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white/10 border border-white/10 text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-white/[0.15] transition-all disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-xs text-white/30">
            Already have an account?{' '}
            <Link href={`/${locale}/login`} className="text-white/60 hover:text-white underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
