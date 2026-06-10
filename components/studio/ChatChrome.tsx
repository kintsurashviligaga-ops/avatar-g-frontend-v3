'use client';

/**
 * ChatChrome — the modern-chatbot frame around the unified assistant chatbox.
 *
 * Provides the chrome a real chat app needs and the bare studio lacked: a top bar
 * with the brand, a LIVE GEL balance chip + one-tap top-up, and a hamburger that
 * opens a slide-over drawer (New Chat · account · balance · Library · History ·
 * legal · sign-in/out · theme). Auth state + balance are reactive (Supabase
 * realtime-ish via onAuthStateChange + a balance fetch), so the frame always
 * reflects the live session — no reload. Strict skin: black · white · #00D2FF.
 *
 * It wraps ANY chat body (OmniStudio / LipsyncStudio) as `children`, owning only
 * the chrome; the body keeps its own composer + feed.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Menu, X, Plus, ArrowLeft, History, LogIn, UserPlus, LogOut, Shield, FileText, LifeBuoy, MessageSquarePlus,
} from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser';
import { WalletRefillModal } from '@/components/chat/WalletRefill';
import AuthModal from '@/components/chat/AuthModal';
import { StudioSheet } from '@/components/studio/StudioSheet';
import StudioLibraryGrid from '@/components/studio/StudioLibraryGrid';
import { ThemeToggle } from '@/components/ThemeToggle';

type Lang = 'ka' | 'en' | 'ru';

const COPY: Record<Lang, {
  title: string; menu: string; settings: string; newChat: string; topUp: string;
  account: string; accountGuest: string; library: string; login: string; signup: string;
  signOut: string; theme: string; legal: string; privacy: string; terms: string; support: string;
}> = {
  ka: {
    title: 'ჭკვიანი ასისტენტი', menu: 'მენიუ', settings: 'პარამეტრები', newChat: 'ახალი ჩატი', topUp: 'შევსება',
    account: 'მომხმარებელი', accountGuest: 'სტუმარი', library: 'ბიბლიოთეკა · ისტორია', login: 'შესვლა', signup: 'რეგისტრაცია',
    signOut: 'გასვლა', theme: 'თემა', legal: 'სამართლებრივი', privacy: 'კონფიდენციალურობა', terms: 'წესები და პირობები', support: 'დახმარება',
  },
  en: {
    title: 'Smart Assistant', menu: 'Menu', settings: 'Settings', newChat: 'New chat', topUp: 'Top up',
    account: 'Account', accountGuest: 'Guest', library: 'Library · History', login: 'Sign in', signup: 'Sign up',
    signOut: 'Sign out', theme: 'Theme', legal: 'Legal', privacy: 'Privacy Policy', terms: 'Terms of Service', support: 'Support',
  },
  ru: {
    title: 'Умный ассистент', menu: 'Меню', settings: 'Настройки', newChat: 'Новый чат', topUp: 'Пополнить',
    account: 'Аккаунт', accountGuest: 'Гость', library: 'Библиотека · История', login: 'Войти', signup: 'Регистрация',
    signOut: 'Выйти', theme: 'Тема', legal: 'Правовое', privacy: 'Конфиденциальность', terms: 'Условия', support: 'Поддержка',
  },
};

interface ChatChromeProps {
  locale?: string;
  /** Optional back control (returns to the card hub). */
  onBack?: () => void;
  /** Clears the conversation (the parent remounts the chat body). */
  onNewChat?: () => void;
  /** Title override (e.g. the Lip-sync studio). Defaults to the assistant title. */
  title?: string;
  /** When the body manages its own height (chat feed) keep false; set true for a
   *  scroll-the-whole-body surface (the Lip-sync tool). */
  scrollBody?: boolean;
  children: React.ReactNode;
}

export function ChatChrome({ locale = 'ka', onBack, onNewChat, title, scrollBody = false, children }: ChatChromeProps) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [menuOpen, setMenuOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [sheet, setSheet] = useState<null | 'library' | 'privacy' | 'terms' | 'support'>(null);
  const [authed, setAuthed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [balanceGel, setBalanceGel] = useState<number | null>(null);

  // Reactive auth — flips Guest⇄User instantly (no reload) on sign in/out.
  useEffect(() => {
    let alive = true;
    const supabase = createBrowserClient();
    const apply = (user: { email?: string | null } | null) => {
      if (!alive) return;
      setAuthed(!!user);
      setUserEmail(user?.email ? String(user.email) : null);
      if (!user) setBalanceGel(null);
    };
    supabase.auth.getUser().then(({ data }) => apply(data.user)).catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session?.user ?? null));
    return () => { alive = false; sub?.subscription?.unsubscribe(); };
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!authed) return;
    try {
      const res = await fetch('/api/credits/balance', { cache: 'no-store', credentials: 'include' });
      if (!res.ok) return;
      const j = (await res.json()) as { balance?: number | null };
      if (typeof j?.balance === 'number') setBalanceGel(j.balance);
    } catch { /* fail-safe — chip shows 0.00 */ }
  }, [authed]);

  useEffect(() => { void refreshBalance(); }, [refreshBalance]);

  return (
    <div className="fixed inset-0 z-0 flex flex-col bg-black text-white antialiased" style={{ height: '100dvh' }}>
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 shrink-0 border-b border-white/10 bg-black/90 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-1.5">
            {onBack && (
              <button type="button" onClick={onBack} aria-label="Services" className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-[#00D2FF]">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <Link href={`/${locale}/dashboard`} className="flex items-center gap-2 min-w-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#00D2FF]/40 bg-[#00D2FF]/10 text-[15px] shadow-[0_0_15px_rgba(0,210,255,0.25)]" aria-hidden>🚀</span>
              <span className="truncate text-sm font-bold tracking-wide text-white">{title ?? <>MyAvatar<span className="text-[#00D2FF]">.ge</span></>}</span>
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Live GEL balance + inline top-up (hidden inside native iOS shell). */}
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-white/10 bg-black">
              <span className="flex items-baseline gap-1 px-2.5 py-1.5 text-xs font-bold tabular-nums text-white">
                {(balanceGel ?? 0).toFixed(2)}<span className="text-[#00D2FF]">₾</span>
              </span>
              <button type="button" onClick={() => setWalletOpen(true)} aria-label={t.topUp} data-iap-external className="flex items-center gap-1 border-l border-white/10 bg-[#00D2FF]/10 px-2 py-1.5 text-xs font-bold text-[#00D2FF] transition-colors hover:bg-[#00D2FF]/20 touch-manipulation">
                <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">{t.topUp}</span>
              </button>
            </div>
            {onNewChat && (
              <button type="button" onClick={onNewChat} aria-label={t.newChat} title={t.newChat} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black text-neutral-300 transition-colors hover:border-[#00D2FF]/40 hover:text-white touch-manipulation">
                <MessageSquarePlus className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={() => setMenuOpen(true)} aria-label={t.menu} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black text-neutral-300 transition-colors hover:border-[#00D2FF]/40 hover:text-white touch-manipulation">
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Body (the chat) ──────────────────────────────────────────────────── */}
      <div className={`min-h-0 flex-1 ${scrollBody ? 'overflow-y-auto' : 'flex'}`}>{children}</div>

      {/* ── Settings drawer ──────────────────────────────────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/70 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <aside onClick={(e) => e.stopPropagation()} className="flex h-full w-72 max-w-[80vw] flex-col border-l border-white/10 bg-black shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-[slideIn_0.2s_ease-out]" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <span className="text-sm font-bold tracking-wide text-white">{t.settings}</span>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="close" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black text-neutral-400 transition-colors hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
              {onNewChat && (
                <button type="button" onClick={() => { setMenuOpen(false); onNewChat(); }} className="inline-flex items-center gap-2.5 rounded-xl border border-[#00D2FF]/40 bg-[#00D2FF]/10 px-3 py-2.5 text-xs font-semibold text-[#00D2FF] transition-colors hover:bg-[#00D2FF]/20">
                  <MessageSquarePlus className="h-4 w-4" /> {t.newChat}
                </button>
              )}

              <div className="rounded-xl border border-white/10 bg-black px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{t.account}</p>
                <p className="mt-0.5 truncate text-xs font-medium text-white" title={userEmail ?? undefined}>{userEmail ?? t.accountGuest}</p>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black px-3 py-2.5">
                <span className="text-xs font-semibold text-neutral-300">{t.theme}</span>
                <ThemeToggle label={t.theme} />
              </div>

              <button type="button" onClick={() => { setMenuOpen(false); setSheet('library'); }} className="inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-black px-3 py-2.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-[#00D2FF]/50 hover:text-[#00D2FF]">
                <History className="h-4 w-4" /> {t.library}
              </button>

              {!authed ? (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setMenuOpen(false); setAuthMode('login'); setAuthOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#00D2FF]/40 bg-[#00D2FF]/10 px-3 py-2.5 text-xs font-semibold text-[#00D2FF] transition-colors hover:bg-[#00D2FF]/20"><LogIn className="h-4 w-4" /> {t.login}</button>
                  <button type="button" onClick={() => { setMenuOpen(false); setAuthMode('register'); setAuthOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black px-3 py-2.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-[#00D2FF]/50 hover:text-[#00D2FF]"><UserPlus className="h-4 w-4" /> {t.signup}</button>
                </div>
              ) : (
                <button type="button" onClick={async () => { try { await createBrowserClient().auth.signOut(); } catch { /* listener clears state */ } setMenuOpen(false); }} className="inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-black px-3 py-2.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-white/25 hover:text-white"><LogOut className="h-4 w-4" /> {t.signOut}</button>
              )}

              <div className="space-y-2 border-t border-white/10 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{t.legal}</p>
                <button type="button" onClick={() => { setMenuOpen(false); setSheet('privacy'); }} className="inline-flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-black px-3 py-2.5 text-xs font-medium text-neutral-300 transition-colors hover:border-[#00D2FF]/40 hover:text-[#00D2FF]"><Shield className="h-4 w-4" /> {t.privacy}</button>
                <button type="button" onClick={() => { setMenuOpen(false); setSheet('terms'); }} className="inline-flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-black px-3 py-2.5 text-xs font-medium text-neutral-300 transition-colors hover:border-[#00D2FF]/40 hover:text-[#00D2FF]"><FileText className="h-4 w-4" /> {t.terms}</button>
                <button type="button" onClick={() => { setMenuOpen(false); setSheet('support'); }} className="inline-flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-black px-3 py-2.5 text-xs font-medium text-neutral-300 transition-colors hover:border-[#00D2FF]/40 hover:text-[#00D2FF]"><LifeBuoy className="h-4 w-4" /> {t.support}</button>
              </div>
            </div>
          </aside>
        </div>
      )}

      <WalletRefillModal open={walletOpen} locale={locale} variant="obsidian" onClose={() => { setWalletOpen(false); void refreshBalance(); }} />
      <AuthModal open={authOpen} locale={lang} initialMode={authMode} onClose={() => setAuthOpen(false)} onAuthed={() => { setAuthOpen(false); void refreshBalance(); }} />
      <StudioSheet
        open={sheet !== null}
        title={sheet === 'library' ? t.library : sheet === 'privacy' ? t.privacy : sheet === 'terms' ? t.terms : sheet === 'support' ? t.support : ''}
        onClose={() => setSheet(null)}
        flush={sheet !== null && sheet !== 'library'}
      >
        {sheet === 'library' ? <StudioLibraryGrid locale={lang} /> : sheet ? (
          <iframe key={sheet} src={`/${locale}/${sheet}?embed=1`} title={sheet} className="h-full w-full border-0 bg-black" />
        ) : null}
      </StudioSheet>
    </div>
  );
}

export default ChatChrome;
