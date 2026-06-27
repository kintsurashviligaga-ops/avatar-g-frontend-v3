'use client';

/**
 * AuthModal — in-window authentication overlay (One Window principle).
 *
 * Login · Register · Password reset · Magic link, all bound to the
 * Supabase JS Auth SDK via the shared browser client. No page redirect:
 * on success the modal closes and the surrounding app re-hydrates the
 * session (the caller passes onAuthed, which re-reads user state).
 *
 * Visuals: blurred backdrop, neon focus rings, framer-motion entrance,
 * whileHover micro-interactions on the primary CTA.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, Loader2, Sparkles, ArrowLeft } from 'lucide-react';
import { createBrowserClient, isSupabaseConfigured } from '@/lib/supabase/browser';
import { track } from '@/lib/analytics/track';
import { SUPPORT_EMAIL, buildSupportMailto } from '@/lib/support';

type Lang = 'ka' | 'en' | 'ru';
type Mode = 'login' | 'register' | 'reset' | 'magic';

interface AuthModalProps {
  open: boolean;
  locale: Lang;
  onClose: () => void;
  onAuthed?: () => void;
  /** Which tab to open on. Defaults to 'login'; the studio passes 'register'
   *  for the "Sign up" entry so the modal lands on account creation directly. */
  initialMode?: Mode;
}

type Strings = {
  login: string; register: string; reset: string; magic: string;
  email: string; password: string; name: string;
  loginCta: string; registerCta: string; resetCta: string; magicCta: string;
  haveAccount: string; noAccount: string;
  forgot: string; useMagic: string; usePassword: string;
  checkEmail: string; registerCheckEmail: string; orContinue: string; notConfigured: string; back: string;
  // Friendly, localised auth errors (never surface raw provider JSON).
  errInvalidEmail: string; errInvalidCredentials: string; errEmailInUse: string;
  errRateLimited: string; errWeakPassword: string; errEmailNotConfirmed: string;
  errNetwork: string; errGeneric: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Official Google brand mark (4-colour 'G'). */
function GoogleIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

/**
 * Map a provider/network error to an elegant, localised line. Anything that
 * looks like a raw JSON/HTML payload (or is suspiciously long) is collapsed to
 * a friendly generic message so the user never sees a raw dump.
 */
function humanizeAuthError(err: unknown, t: Strings): string {
  const raw = (err instanceof Error ? err.message : typeof err === 'string' ? err : '').trim();
  if (!raw || /^[[{<]/.test(raw)) return t.errGeneric;
  const m = raw.toLowerCase();
  if (/invalid login credentials|invalid email or password|wrong password|bad credentials/.test(m)) return t.errInvalidCredentials;
  if (/unable to validate email|invalid.*email|email.*invalid|email address.*invalid/.test(m)) return t.errInvalidEmail;
  if (/already registered|already exists|already been registered|user already/.test(m)) return t.errEmailInUse;
  if (/rate limit|too many|429|over_email_send_rate/.test(m)) return t.errRateLimited;
  if (/password.*(short|at least|weak|6|minimum)|weak password/.test(m)) return t.errWeakPassword;
  if (/email not confirmed|confirm your email|not confirmed/.test(m)) return t.errEmailNotConfirmed;
  if (/network|failed to fetch|fetch failed|timeout|offline/.test(m)) return t.errNetwork;
  // Short, human-readable provider messages are safe to pass through.
  return raw.length <= 120 ? raw : t.errGeneric;
}

const COPY: Record<Lang, Strings> = {
  ka: {
    login: 'შესვლა', register: 'რეგისტრაცია', reset: 'პაროლის აღდგენა', magic: 'მაგიური ბმული',
    email: 'ელ.ფოსტა', password: 'პაროლი', name: 'სახელი',
    loginCta: 'შესვლა', registerCta: 'ანგარიშის შექმნა', resetCta: 'ბმულის გაგზავნა', magicCta: 'ბმულის მიღება',
    haveAccount: 'უკვე გაქვს ანგარიში?', noAccount: 'არ გაქვს ანგარიში?',
    forgot: 'დაგავიწყდა პაროლი?', useMagic: 'მაგიური ბმულით შესვლა', usePassword: 'პაროლით შესვლა',
    checkEmail: 'შეამოწმე ელ.ფოსტა — ბმული გამოგზავნილია.',
    registerCheckEmail: 'შეამოწმეთ ელფოსტა დასადასტურებლად.', orContinue: 'ან',
    notConfigured: 'ავთენტიფიკაცია ამ გარემოში გამორთულია (demo).',
    back: 'უკან',
    errInvalidEmail: 'შეიყვანე სწორი ელ.ფოსტის მისამართი.',
    errInvalidCredentials: 'ელ.ფოსტა ან პაროლი არასწორია.',
    errEmailInUse: 'ეს ელ.ფოსტა უკვე რეგისტრირებულია. სცადე შესვლა.',
    errRateLimited: 'ძალიან ბევრი მცდელობა. სცადე ცოტა ხანში.',
    errWeakPassword: 'პაროლი სუსტია — გამოიყენე მინიმუმ 6 სიმბოლო.',
    errEmailNotConfirmed: 'ჯერ დაადასტურე ელ.ფოსტა მიღებული ბმულით.',
    errNetwork: 'ქსელის შეცდომა. შეამოწმე კავშირი და სცადე ხელახლა.',
    errGeneric: 'ვერ მოხერხდა ავტორიზაცია. სცადე ხელახლა.',
  },
  en: {
    login: 'Sign in', register: 'Create account', reset: 'Reset password', magic: 'Magic link',
    email: 'Email', password: 'Password', name: 'Name',
    loginCta: 'Sign in', registerCta: 'Create account', resetCta: 'Send reset link', magicCta: 'Send magic link',
    haveAccount: 'Already have an account?', noAccount: "Don't have an account?",
    forgot: 'Forgot password?', useMagic: 'Sign in with magic link', usePassword: 'Sign in with password',
    checkEmail: 'Check your email — a link is on its way.',
    registerCheckEmail: 'Check your email to confirm your account before signing in.', orContinue: 'or',
    notConfigured: 'Authentication is disabled in this environment (demo).',
    back: 'Back',
    errInvalidEmail: 'Please enter a valid email address.',
    errInvalidCredentials: 'Email or password is incorrect.',
    errEmailInUse: 'That email is already registered. Try signing in.',
    errRateLimited: 'Too many attempts. Please try again shortly.',
    errWeakPassword: 'Password is too weak — use at least 6 characters.',
    errEmailNotConfirmed: 'Please confirm your email via the link we sent.',
    errNetwork: 'Network error. Check your connection and try again.',
    errGeneric: "Couldn't sign you in. Please try again.",
  },
  ru: {
    login: 'Вход', register: 'Регистрация', reset: 'Сброс пароля', magic: 'Магическая ссылка',
    email: 'Эл. почта', password: 'Пароль', name: 'Имя',
    loginCta: 'Войти', registerCta: 'Создать аккаунт', resetCta: 'Отправить ссылку', magicCta: 'Получить ссылку',
    haveAccount: 'Уже есть аккаунт?', noAccount: 'Нет аккаунта?',
    forgot: 'Забыли пароль?', useMagic: 'Войти по магической ссылке', usePassword: 'Войти по паролю',
    checkEmail: 'Проверьте почту — ссылка отправлена.',
    registerCheckEmail: 'Проверьте почту — подтвердите аккаунт перед входом.', orContinue: 'или',
    notConfigured: 'Аутентификация отключена в этой среде (demo).',
    back: 'Назад',
    errInvalidEmail: 'Введите корректный адрес эл. почты.',
    errInvalidCredentials: 'Неверная почта или пароль.',
    errEmailInUse: 'Эта почта уже зарегистрирована. Попробуйте войти.',
    errRateLimited: 'Слишком много попыток. Повторите чуть позже.',
    errWeakPassword: 'Пароль слишком простой — минимум 6 символов.',
    errEmailNotConfirmed: 'Сначала подтвердите почту по ссылке из письма.',
    errNetwork: 'Ошибка сети. Проверьте подключение и повторите.',
    errGeneric: 'Не удалось войти. Попробуйте снова.',
  },
};

export default function AuthModal({ open, locale, onClose, onAuthed, initialMode = 'login' }: AuthModalProps) {
  const t = COPY[locale] ?? COPY.ka;
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Portal readiness — the modal mounts into document.body so its z-index wins over
  // root-level chrome (the cookie banner) instead of being trapped inside the chat
  // shell's lower stacking context.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // PHASE 4 Task 3 — capture an inbound ?ref=CODE (myavatar.ge?ref=ABC123) so it
  // survives until the user signs up, then redeems the existing referral system.
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get('ref');
      if (ref) localStorage.setItem('myavatar:ref', ref.trim().toUpperCase());
    } catch { /* ignore */ }
  }, []);
  const redeemRef = useCallback(async () => {
    let code = '';
    try { code = localStorage.getItem('myavatar:ref') || new URLSearchParams(window.location.search).get('ref') || ''; } catch { /* ignore */ }
    if (!code || code.trim().length < 6) return;
    try {
      await fetch('/api/referral/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ code: code.trim() }) });
      try { localStorage.removeItem('myavatar:ref'); } catch { /* ignore */ }
    } catch { /* fail-open — referral bonus is best-effort */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  // The modal stays mounted (AnimatePresence). When it (re)opens, land on the
  // caller's requested tab — 'login' for "Sign in", 'register' for "Sign up" —
  // and clear any stale error/notice from a previous session.
  useEffect(() => {
    if (open) { setMode(initialMode); setError(null); setNotice(null); }
  }, [open, initialMode]);

  const reset = useCallback(() => { setError(null); setNotice(null); }, []);

  // OAuth (Google): only render the button when the Supabase project ACTUALLY has the
  // provider enabled (asked from GoTrue's public /settings), so we never show a dead
  // button that 400s with "provider is not enabled". It auto-lights-up the moment Google
  // is enabled server-side — no further code change needed. Fail-soft → stays hidden.
  const [googleEnabled, setGoogleEnabled] = useState(false);
  useEffect(() => {
    if (!open) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return;
    const ctrl = new AbortController();
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon }, signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { external?: Record<string, boolean> } | null) => setGoogleEnabled(Boolean(j?.external?.google)))
      .catch(() => { /* fail-soft → keep the button hidden */ });
    return () => ctrl.abort();
  }, [open]);

  const handleGoogle = useCallback(async () => {
    const supabase = createBrowserClient();
    if (!supabase || !isSupabaseConfigured()) { setError(t.notConfigured); return; }
    setBusy(true);
    try {
      // signInWithOAuth redirects the browser to Google → back to /auth/callback (the
      // existing route exchanges the code for a session). Nothing else to do here.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        // Preserve the user's CURRENT locale through the OAuth round-trip: pass it as
        // `next` so /auth/callback lands them back on /{locale}/dashboard instead of the
        // default locale (a ka user stayed on ka, but en/ru users were dumped on /ka).
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/${locale}/dashboard`)}` },
      });
      if (error) throw error;
    } catch (err) {
      setBusy(false);
      setError(humanizeAuthError(err, t));
    }
  }, [t]);

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    // Client-side email validation → elegant inline error before any round-trip.
    if (!EMAIL_RE.test(email.trim())) { setError(t.errInvalidEmail); return; }
    const supabase = createBrowserClient();
    if (!supabase || !isSupabaseConfigured()) { setError(t.notConfigured); return; }
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/${locale}/dashboard`;
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuthed?.(); onClose();
        // ISSUE 3 — the @supabase/ssr browser client writes the session cookie during
        // sign-in; awaiting getSession() guarantees it is persisted BEFORE router.refresh()
        // re-renders the server tree (and middleware re-reads auth), so the refreshed page
        // sees the logged-in user instead of racing the cookie write and rendering as guest.
        await supabase.auth.getSession();
        router.refresh();
      } else if (mode === 'register') {
        // PRIMARY PATH — server-side admin registration that confirms the email
        // immediately. The project requires email confirmation but its mailer
        // can't reliably deliver, so the plain signUp() below left every new user
        // stuck on a "check your email" dead end. /api/auth/register creates a
        // confirmed account with the service-role key; we then sign the user
        // straight in. No email round-trip.
        let registered = false;
        try {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), password, name: name.trim() || undefined }),
          });
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string };
          if (res.ok && j.ok) {
            registered = true;
            track('user_signup', { method: 'email' }); // PHASE 4 Task 1
          } else if (j.code === 'exists') {
            setError(t.errEmailInUse);
            return;
          } else if (res.status === 429) {
            setError(t.errRateLimited);
            return;
          }
          // Any other code (unavailable/error) → fall through to the client signUp.
        } catch {
          // Network/route failure → fall through to the client signUp path.
        }

        if (registered) {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          await redeemRef(); // PHASE 4 Task 3 — apply an inbound referral code now that there's a session
          onAuthed?.(); onClose();
        // ISSUE 3 — the @supabase/ssr browser client writes the session cookie during
        // sign-in; awaiting getSession() guarantees it is persisted BEFORE router.refresh()
        // re-renders the server tree (and middleware re-reads auth), so the refreshed page
        // sees the logged-in user instead of racing the cookie write and rendering as guest.
        await supabase.auth.getSession();
        router.refresh();
        } else {
          // FALLBACK — classic client signUp. If the project ever returns a live
          // session (confirmation OFF) we log straight in; otherwise show a clear,
          // register-specific confirm-email notice instead of leaving the user
          // wondering whether anything happened.
          const { data, error } = await supabase.auth.signUp({
            email, password,
            options: { data: { full_name: name || undefined }, emailRedirectTo: redirectTo },
          });
          if (error) throw error;
          if (data.session) { track('user_signup', { method: 'email' }); await redeemRef(); onAuthed?.(); onClose();
        // ISSUE 3 — the @supabase/ssr browser client writes the session cookie during
        // sign-in; awaiting getSession() guarantees it is persisted BEFORE router.refresh()
        // re-renders the server tree (and middleware re-reads auth), so the refreshed page
        // sees the logged-in user instead of racing the cookie write and rendering as guest.
        await supabase.auth.getSession();
        router.refresh(); }
          else { track('user_signup', { method: 'email', pending_confirm: true }); setNotice(t.registerCheckEmail); }
        }
      } else if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setNotice(t.checkEmail);
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/${locale}/login` });
        if (error) throw error;
        setNotice(t.checkEmail);
      }
    } catch (err) {
      setError(humanizeAuthError(err, t));
    } finally {
      setBusy(false);
    }
  }, [mode, email, password, name, locale, t, onAuthed, onClose, reset]);

  const inputCls = 'w-full bg-app-elevated border border-app-border/15 rounded-xl pl-10 pr-3 py-3 text-[14px] text-app-text placeholder:text-app-muted outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all';
  const title = mode === 'login' ? t.login : mode === 'register' ? t.register : mode === 'reset' ? t.reset : t.magic;
  const cta = mode === 'login' ? t.loginCta : mode === 'register' ? t.registerCta : mode === 'reset' ? t.resetCta : t.magicCta;

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="auth-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        >
          <motion.div
            key="auth-card"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[400px] max-h-[90dvh] overflow-y-auto overscroll-contain rounded-3xl bg-app-surface border border-app-border/15 p-6 shadow-[0_30px_90px_-20px_rgba(56,189,248,0.35)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                {mode === 'reset' || mode === 'magic' ? (
                  <button type="button" onClick={() => { setMode('login'); reset(); }} aria-label={t.back}
                    className="h-8 w-8 rounded-full hover:bg-app-border/10 flex items-center justify-center text-app-muted">
                    <ArrowLeft size={16} />
                  </button>
                ) : (
                  <span className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                    <Sparkles size={15} className="text-white" />
                  </span>
                )}
                <h2 className="text-[17px] font-bold text-app-text tracking-tight">{title}</h2>
              </div>
              <button type="button" onClick={onClose} aria-label="Close"
                className="h-8 w-8 rounded-full hover:bg-app-border/10 flex items-center justify-center text-app-muted">
                <X size={16} />
              </button>
            </div>

            {/* OAuth removed — the Supabase project has no social providers enabled
                (Google/Apple/GitHub returned "provider is not enabled"). Email + password
                is the only path; a "coming soon" note sits under the form. */}
            <form onSubmit={submit} className="space-y-3">
              {mode === 'register' && (
                <div className="relative">
                  <Sparkles size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-app-muted" />
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.name} className={inputCls} autoComplete="name" />
                </div>
              )}
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-app-muted" />
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder={t.email} className={inputCls} autoComplete="email" />
              </div>
              {(mode === 'login' || mode === 'register') && (
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-app-muted" />
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} placeholder={t.password} className={inputCls} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                </div>
              )}

              {error && <p className="text-[12px] text-rose-600 dark:text-rose-300 px-1">{error}</p>}
              {notice && <p className="text-[12px] text-emerald-600 dark:text-emerald-300 px-1">{notice}</p>}

              <motion.button
                type="submit"
                disabled={busy}
                whileHover={{ scale: busy ? 1 : 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 text-white text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                {cta}
              </motion.button>
            </form>

            {/* ── ან ── divider + full-width secondary toggle (register ⇄ login).
                Replaces the old OAuth + text-link cluster: one clean alternate action. */}
            {(mode === 'login' || mode === 'register') && (
              <>
                <div className="my-3 flex items-center gap-3 text-[11px] uppercase tracking-wider text-app-muted">
                  <span className="h-px flex-1 bg-app-border/15" />
                  {t.orContinue}
                  <span className="h-px flex-1 bg-app-border/15" />
                </div>
                <button
                  type="button"
                  onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); reset(); }}
                  className="w-full h-11 rounded-xl border border-app-border/15 bg-app-elevated text-[14px] font-semibold text-app-text transition-colors hover:bg-app-border/10"
                >
                  {mode === 'login' ? t.register : t.login}
                </button>
                {mode === 'login' && (
                  <button type="button" onClick={() => { setMode('reset'); reset(); }} className="mt-2 block w-full text-center text-[12px] text-app-muted hover:text-app-text transition">{t.forgot}</button>
                )}
                {/* Google OAuth — only rendered once the provider is enabled on Supabase
                    (auto-detected via GoTrue /settings), so it is never a dead button.
                    Until then, a "coming soon" note sets expectations. */}
                {googleEnabled ? (
                  <button
                    type="button"
                    onClick={() => void handleGoogle()}
                    disabled={busy}
                    className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl border border-app-border/15 bg-white px-4 py-2.5 text-[14px] font-semibold text-slate-900 transition-colors hover:bg-slate-100 disabled:opacity-60"
                  >
                    <GoogleIcon />
                    {locale === 'en' ? 'Continue with Google' : locale === 'ru' ? 'Войти через Google' : 'Google-ით შესვლა'}
                  </button>
                ) : (
                  <p className="mt-3 text-center text-[11px] text-app-muted">{locale === 'en' ? 'Google sign-in coming soon' : locale === 'ru' ? 'Вход через Google скоро' : 'Google-ით შესვლა მალე'}</p>
                )}
              </>
            )}
            {mode === 'magic' && (
              <button type="button" onClick={() => { setMode('login'); reset(); }} className="mt-4 block w-full text-center text-[12px] text-app-muted hover:text-app-text transition">{t.usePassword}</button>
            )}

            {/* Official support node */}
            <div className="mt-4 pt-3 border-t border-app-border/10 text-center text-[11px] text-app-muted">
              <a href={buildSupportMailto({ subject: 'MyAvatar.ge — help' })} className="hover:text-sky-500 dark:hover:text-sky-300 transition">
                {SUPPORT_EMAIL}
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
