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
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, Loader2, Sparkles, ArrowLeft } from 'lucide-react';
import { createBrowserClient, isSupabaseConfigured } from '@/lib/supabase/browser';
import { LoginCard } from '@/components/auth/LoginCard';
import { SUPPORT_EMAIL, buildSupportMailto } from '@/lib/support';

type Lang = 'ka' | 'en' | 'ru';
type Mode = 'login' | 'register' | 'reset' | 'magic';

interface AuthModalProps {
  open: boolean;
  locale: Lang;
  onClose: () => void;
  onAuthed?: () => void;
}

type Strings = {
  login: string; register: string; reset: string; magic: string;
  email: string; password: string; name: string;
  loginCta: string; registerCta: string; resetCta: string; magicCta: string;
  haveAccount: string; noAccount: string;
  forgot: string; useMagic: string; usePassword: string;
  checkEmail: string; orContinue: string; notConfigured: string; back: string;
};

const COPY: Record<Lang, Strings> = {
  ka: {
    login: 'შესვლა', register: 'რეგისტრაცია', reset: 'პაროლის აღდგენა', magic: 'მაგიური ბმული',
    email: 'ელ.ფოსტა', password: 'პაროლი', name: 'სახელი',
    loginCta: 'შესვლა', registerCta: 'ანგარიშის შექმნა', resetCta: 'ბმულის გაგზავნა', magicCta: 'ბმულის მიღება',
    haveAccount: 'უკვე გაქვს ანგარიში?', noAccount: 'არ გაქვს ანგარიში?',
    forgot: 'დაგავიწყდა პაროლი?', useMagic: 'მაგიური ბმულით შესვლა', usePassword: 'პაროლით შესვლა',
    checkEmail: 'შეამოწმე ელ.ფოსტა — ბმული გამოგზავნილია.', orContinue: 'ან',
    notConfigured: 'ავთენტიფიკაცია ამ გარემოში გამორთულია (demo).',
    back: 'უკან',
  },
  en: {
    login: 'Sign in', register: 'Create account', reset: 'Reset password', magic: 'Magic link',
    email: 'Email', password: 'Password', name: 'Name',
    loginCta: 'Sign in', registerCta: 'Create account', resetCta: 'Send reset link', magicCta: 'Send magic link',
    haveAccount: 'Already have an account?', noAccount: "Don't have an account?",
    forgot: 'Forgot password?', useMagic: 'Sign in with magic link', usePassword: 'Sign in with password',
    checkEmail: 'Check your email — a link is on its way.', orContinue: 'or',
    notConfigured: 'Authentication is disabled in this environment (demo).',
    back: 'Back',
  },
  ru: {
    login: 'Вход', register: 'Регистрация', reset: 'Сброс пароля', magic: 'Магическая ссылка',
    email: 'Эл. почта', password: 'Пароль', name: 'Имя',
    loginCta: 'Войти', registerCta: 'Создать аккаунт', resetCta: 'Отправить ссылку', magicCta: 'Получить ссылку',
    haveAccount: 'Уже есть аккаунт?', noAccount: 'Нет аккаунта?',
    forgot: 'Забыли пароль?', useMagic: 'Войти по магической ссылке', usePassword: 'Войти по паролю',
    checkEmail: 'Проверьте почту — ссылка отправлена.', orContinue: 'или',
    notConfigured: 'Аутентификация отключена в этой среде (demo).',
    back: 'Назад',
  },
};

export default function AuthModal({ open, locale, onClose, onAuthed }: AuthModalProps) {
  const t = COPY[locale] ?? COPY.ka;
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  const reset = useCallback(() => { setError(null); setNotice(null); }, []);

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    const supabase = createBrowserClient();
    if (!supabase || !isSupabaseConfigured()) { setError(t.notConfigured); return; }
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/${locale}/dashboard`;
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuthed?.(); onClose();
      } else if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name || undefined }, emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setNotice(t.checkEmail);
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
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }, [mode, email, password, name, locale, t, onAuthed, onClose, reset]);

  const inputCls = 'w-full bg-white/[0.04] border border-white/[0.12] rounded-xl pl-10 pr-3 py-3 text-[14px] text-white placeholder:text-white/35 outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all';
  const title = mode === 'login' ? t.login : mode === 'register' ? t.register : mode === 'reset' ? t.reset : t.magic;
  const cta = mode === 'login' ? t.loginCta : mode === 'register' ? t.registerCta : mode === 'reset' ? t.resetCta : t.magicCta;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="auth-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        >
          <motion.div
            key="auth-card"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[400px] rounded-3xl bg-black border border-white/[0.12] p-6 shadow-[0_30px_90px_-20px_rgba(56,189,248,0.35)]"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                {mode === 'reset' || mode === 'magic' ? (
                  <button type="button" onClick={() => { setMode('login'); reset(); }} aria-label={t.back}
                    className="h-8 w-8 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-white/60">
                    <ArrowLeft size={16} />
                  </button>
                ) : (
                  <span className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                    <Sparkles size={15} className="text-white" />
                  </span>
                )}
                <h2 className="text-[17px] font-bold text-white tracking-tight">{title}</h2>
              </div>
              <button type="button" onClick={onClose} aria-label="Close"
                className="h-8 w-8 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-white/60">
                <X size={16} />
              </button>
            </div>

            {/* One-click social OAuth — Google · Apple · GitHub (login/register only) */}
            {(mode === 'login' || mode === 'register') && (
              <>
                <LoginCard locale={locale} redirectTo={`/${locale}/dashboard`} className="mb-1" />
                <div className="my-3 flex items-center gap-3 text-[11px] uppercase tracking-wider text-white/35">
                  <span className="h-px flex-1 bg-white/[0.10]" />
                  {t.orContinue}
                  <span className="h-px flex-1 bg-white/[0.10]" />
                </div>
              </>
            )}

            <form onSubmit={submit} className="space-y-3">
              {mode === 'register' && (
                <div className="relative">
                  <Sparkles size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.name} className={inputCls} autoComplete="name" />
                </div>
              )}
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder={t.email} className={inputCls} autoComplete="email" />
              </div>
              {(mode === 'login' || mode === 'register') && (
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} placeholder={t.password} className={inputCls} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                </div>
              )}

              {error && <p className="text-[12px] text-rose-300 px-1">{error}</p>}
              {notice && <p className="text-[12px] text-emerald-300 px-1">{notice}</p>}

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

            {/* Mode switches */}
            <div className="mt-4 space-y-2 text-center text-[12px]">
              {mode === 'login' && (
                <>
                  <button type="button" onClick={() => { setMode('magic'); reset(); }} className="block w-full text-sky-300 hover:text-sky-200 transition">{t.useMagic}</button>
                  <div className="flex items-center justify-center gap-3 text-white/45">
                    <button type="button" onClick={() => { setMode('reset'); reset(); }} className="hover:text-white/70 transition">{t.forgot}</button>
                    <span aria-hidden>·</span>
                    <button type="button" onClick={() => { setMode('register'); reset(); }} className="hover:text-white/70 transition">{t.noAccount}</button>
                  </div>
                </>
              )}
              {mode === 'register' && (
                <button type="button" onClick={() => { setMode('login'); reset(); }} className="text-white/55 hover:text-white/80 transition">{t.haveAccount} <span className="text-sky-300">{t.login}</span></button>
              )}
              {mode === 'magic' && (
                <button type="button" onClick={() => { setMode('login'); reset(); }} className="text-white/55 hover:text-white/80 transition">{t.usePassword}</button>
              )}
            </div>

            {/* Official support node */}
            <div className="mt-4 pt-3 border-t border-white/[0.06] text-center text-[11px] text-white/35">
              <a href={buildSupportMailto({ subject: 'MyAvatar.ge — help' })} className="hover:text-sky-300 transition">
                {SUPPORT_EMAIL}
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
