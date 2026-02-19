'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Github, Mail, Smartphone, ShieldCheck, Loader2 } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser';

type AuthMode = 'github' | 'email' | 'phone';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<AuthMode>('github');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);

  const [busyGithub, setBusyGithub] = useState(false);
  const [busyEmail, setBusyEmail] = useState(false);
  const [busyPhoneSend, setBusyPhoneSend] = useState(false);
  const [busyPhoneVerify, setBusyPhoneVerify] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const phoneAuthEnabled = process.env.NEXT_PUBLIC_SUPABASE_PHONE_AUTH_ENABLED === 'true';

  const redirectTo = useMemo(() => {
    if (typeof window === 'undefined') {
      return process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL || '/auth/callback';
    }

    return (
      process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL ||
      `${window.location.origin}/auth/callback`
    );
  }, []);

  const clearMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const nextPath = searchParams.get('next') || '/workspace';

  useEffect(() => {
    const callbackError = searchParams.get('error');
    if (callbackError) {
      setErrorMessage(callbackError);
    }
  }, [searchParams]);

  const onGithubLogin = async () => {
    clearMessages();
    setBusyGithub(true);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo,
          queryParams: {
            next: nextPath,
          },
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'GitHub sign-in failed. Please retry.');
    } finally {
      setBusyGithub(false);
    }
  };

  const onEmailOtp = async (event: FormEvent) => {
    event.preventDefault();
    clearMessages();

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setBusyEmail(true);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${redirectTo}?next=${encodeURIComponent(nextPath)}`,
        },
      });

      if (error) {
        throw error;
      }

      setSuccessMessage('Check your email. Your secure sign-in link is on the way.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send email OTP.');
    } finally {
      setBusyEmail(false);
    }
  };

  const onPhoneOtpSend = async (event: FormEvent) => {
    event.preventDefault();
    clearMessages();

    if (!phoneAuthEnabled) {
      setErrorMessage('Phone OTP is currently unavailable. SMS provider setup is pending.');
      return;
    }

    const normalizedPhone = phone.trim();
    if (!isValidPhone(normalizedPhone)) {
      setErrorMessage('Enter a valid phone in E.164 format (example: +9955XXXXXXXX).');
      return;
    }

    setBusyPhoneSend(true);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({ phone: normalizedPhone });

      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes('sms') || message.includes('provider') || message.includes('phone')) {
          setErrorMessage('Phone OTP is not configured on the backend yet. Please use GitHub or Email login.');
          return;
        }
        throw error;
      }

      setPhoneCodeSent(true);
      setSuccessMessage('OTP sent. Enter the code from SMS to continue.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send phone OTP.');
    } finally {
      setBusyPhoneSend(false);
    }
  };

  const onPhoneOtpVerify = async (event: FormEvent) => {
    event.preventDefault();
    clearMessages();

    if (!phoneAuthEnabled) {
      setErrorMessage('Phone OTP is currently unavailable.');
      return;
    }

    if (!phoneCode.trim()) {
      setErrorMessage('Enter the OTP code sent to your phone.');
      return;
    }

    setBusyPhoneVerify(true);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.verifyOtp({
        phone: phone.trim(),
        token: phoneCode.trim(),
        type: 'sms',
      });

      if (error) {
        throw error;
      }

      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'OTP verification failed.');
    } finally {
      setBusyPhoneVerify(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#05070A] text-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-[#0A1020] to-[#080C18] p-6 sm:p-8 shadow-[0_0_60px_rgba(6,182,212,0.18)]">
        <div className="mb-6">
          <p className="text-cyan-300 text-xs uppercase tracking-[0.2em]">Avatar G Secure Access</p>
          <h1 className="mt-2 text-3xl font-bold">Sign in to your workspace</h1>
          <p className="mt-2 text-sm text-gray-400">GitHub, Email Magic Link, and Phone OTP (when enabled).</p>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-white/5 p-1 mb-6">
          <button onClick={() => setMode('github')} className={`rounded-lg px-3 py-2 text-sm transition ${mode === 'github' ? 'bg-cyan-500 text-white' : 'text-gray-300 hover:bg-white/10'}`}>GitHub</button>
          <button onClick={() => setMode('email')} className={`rounded-lg px-3 py-2 text-sm transition ${mode === 'email' ? 'bg-cyan-500 text-white' : 'text-gray-300 hover:bg-white/10'}`}>Email</button>
          <button onClick={() => setMode('phone')} className={`rounded-lg px-3 py-2 text-sm transition ${mode === 'phone' ? 'bg-cyan-500 text-white' : 'text-gray-300 hover:bg-white/10'}`}>Phone</button>
        </div>

        {mode === 'github' && (
          <button
            onClick={onGithubLogin}
            disabled={busyGithub}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#171b2a] border border-white/15 px-4 py-3 text-sm font-medium hover:bg-[#1d2234] disabled:opacity-60"
          >
            {busyGithub ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
            {busyGithub ? 'Redirecting...' : 'Continue with GitHub'}
          </button>
        )}

        {mode === 'email' && (
          <form className="space-y-3" onSubmit={onEmailOtp}>
            <label className="text-sm text-gray-300">Email address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-xl border border-white/15 bg-[#111827] pl-10 pr-3 py-3 outline-none focus:border-cyan-400"
              />
            </div>
            <button
              type="submit"
              disabled={busyEmail}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {busyEmail ? 'Sending...' : 'Send Magic Link'}
            </button>
          </form>
        )}

        {mode === 'phone' && (
          <div className="space-y-4">
            <form className="space-y-3" onSubmit={onPhoneOtpSend}>
              <label className="text-sm text-gray-300">Phone (E.164)</label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+9955XXXXXXXX"
                  className="w-full rounded-xl border border-white/15 bg-[#111827] pl-10 pr-3 py-3 outline-none focus:border-cyan-400"
                />
              </div>
              <button
                type="submit"
                disabled={busyPhoneSend || !phoneAuthEnabled}
                className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3 text-sm font-semibold disabled:opacity-60"
              >
                {busyPhoneSend ? 'Sending OTP...' : 'Send OTP'}
              </button>
            </form>

            {phoneCodeSent && (
              <form className="space-y-3" onSubmit={onPhoneOtpVerify}>
                <label className="text-sm text-gray-300">OTP code</label>
                <input
                  type="text"
                  value={phoneCode}
                  onChange={(event) => setPhoneCode(event.target.value)}
                  placeholder="123456"
                  className="w-full rounded-xl border border-white/15 bg-[#111827] px-3 py-3 outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  disabled={busyPhoneVerify || !phoneAuthEnabled}
                  className="w-full rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-4 py-3 text-sm font-semibold text-cyan-100 disabled:opacity-60"
                >
                  {busyPhoneVerify ? 'Verifying...' : 'Verify OTP'}
                </button>
              </form>
            )}

            {!phoneAuthEnabled && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                Phone OTP UI is ready, but SMS provider is not configured yet. Use GitHub or Email for now.
              </div>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {successMessage}
          </div>
        )}

        <div className="mt-6 flex items-center gap-2 text-xs text-gray-400">
          <ShieldCheck className="h-4 w-4 text-cyan-300" />
          Secure session cookies with Supabase SSR.
        </div>
      </div>
    </main>
  );
}