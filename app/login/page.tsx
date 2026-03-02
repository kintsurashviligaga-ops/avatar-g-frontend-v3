'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createBrowserClient();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/';

  const loginWithGitHub = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL || `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  const loginWithEmail = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = fd.get('email') as string;
    const pass = fd.get('password') as string;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      window.location.href = redirectTo;
    }
  };

  return (
    <div className="min-h-screen bg-[#050510] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-white/40 text-sm mt-1">Sign in to MyAvatar.ge</p>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6 space-y-4">
          {/* GitHub OAuth */}
          <button
            onClick={loginWithGitHub}
            disabled={loading}
            className="
              w-full flex items-center justify-center gap-3
              bg-white text-[#050510] font-semibold text-sm
              py-3 rounded-xl hover:bg-white/90 transition-all
              disabled:opacity-50
            "
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
              <span className="px-3 bg-[#050510] rounded">or sign in with email</span>
            </div>
          </div>

          {/* Email/password */}
          <form onSubmit={loginWithEmail} className="space-y-3">
            <input
              name="email"
              type="email"
              required
              placeholder="Email"
              className="
                w-full bg-white/[0.04] border border-white/[0.08]
                rounded-xl px-4 py-2.5 text-sm text-white
                placeholder-white/20 focus:outline-none focus:border-white/20
              "
            />
            <input
              name="password"
              type="password"
              required
              placeholder="Password"
              className="
                w-full bg-white/[0.04] border border-white/[0.08]
                rounded-xl px-4 py-2.5 text-sm text-white
                placeholder-white/20 focus:outline-none focus:border-white/20
              "
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="
                w-full bg-white/10 border border-white/10 text-white
                font-semibold text-sm py-2.5 rounded-xl
                hover:bg-white/[0.15] transition-all disabled:opacity-50
              "
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs text-white/30">
            No account?{' '}
            <Link href="/signup" className="text-white/60 hover:text-white underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
