'use client';

/**
 * ChatChrome — the minimalist frame around the unified assistant chatbox.
 *
 * A clean, Grok-style top bar (brand · live GEL balance · New Chat · hamburger)
 * plus a slide-over drawer (New Chat · account · theme · Library · sign-in/out ·
 * legal). Strictly theme-token based (`app-*`), so flipping the theme toggle
 * actually repaints the whole surface light/dark — no hardcoded black/white.
 *
 * Legal pages open as plain links in a new tab — robust by construction (no
 * iframe, no CSP-framing, nothing that can "break the page"). The Library opens
 * in a native slide-over (no iframe).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Menu, X, Plus, History, LogIn, UserPlus, LogOut, Shield, FileText, LifeBuoy, MessageSquarePlus, Loader2, Trash2,
} from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser';
import { WalletRefillModal } from '@/components/chat/WalletRefill';
import AuthModal from '@/components/chat/AuthModal';
import { StudioSheet } from '@/components/studio/StudioSheet';
import StudioLibraryGrid from '@/components/studio/StudioLibraryGrid';
import { ThemeToggle } from '@/components/ThemeToggle';

type Lang = 'ka' | 'en' | 'ru';

const COPY: Record<Lang, {
  menu: string; settings: string; newChat: string; topUp: string; services: string; language: string;
  account: string; accountGuest: string; library: string; login: string; signup: string;
  signOut: string; theme: string; legal: string; privacy: string; terms: string; support: string; deleteAccount: string;
}> = {
  ka: {
    menu: 'მენიუ', settings: 'პარამეტრები', newChat: 'ახალი ჩატი', topUp: 'შევსება', services: 'სერვისები', language: 'ენა',
    account: 'ანგარიში', accountGuest: 'სტუმარი', library: 'ბიბლიოთეკა · ისტორია', login: 'შესვლა', signup: 'რეგისტრაცია',
    signOut: 'გასვლა', theme: 'თემა', legal: 'სამართლებრივი', privacy: 'კონფიდენციალურობა', terms: 'წესები და პირობები', support: 'დახმარება', deleteAccount: 'ანგარიშის წაშლა',
  },
  en: {
    menu: 'Menu', settings: 'Settings', newChat: 'New chat', topUp: 'Top up', services: 'Services', language: 'Language',
    account: 'Account', accountGuest: 'Guest', library: 'Library · History', login: 'Sign in', signup: 'Sign up',
    signOut: 'Sign out', theme: 'Theme', legal: 'Legal', privacy: 'Privacy Policy', terms: 'Terms of Service', support: 'Support', deleteAccount: 'Delete account',
  },
  ru: {
    menu: 'Меню', settings: 'Настройки', newChat: 'Новый чат', topUp: 'Пополнить', services: 'Сервисы', language: 'Язык',
    account: 'Аккаунт', accountGuest: 'Гость', library: 'Библиотека · История', login: 'Войти', signup: 'Регистрация',
    signOut: 'Выйти', theme: 'Тема', legal: 'Правовое', privacy: 'Конфиденциальность', terms: 'Условия', support: 'Поддержка', deleteAccount: 'Удалить аккаунт',
  },
};

interface ChatChromeProps {
  locale?: string;
  /** Optional back control (returns to the card hub). */
  onBack?: () => void;
  /** Clears the conversation (the parent remounts the chat body). */
  onNewChat?: () => void;
  /** Title override (e.g. the Lip-sync studio). Defaults to the brand. */
  title?: string;
  /** Set true for a scroll-the-whole-body surface (the Lip-sync tool). */
  scrollBody?: boolean;
  children: React.ReactNode;
}

export function ChatChrome({ locale = 'ka', onNewChat, title, scrollBody = false, children }: ChatChromeProps) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [menuOpen, setMenuOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  // Every secondary surface (Library + the 3 legal pages) opens IN-WINDOW in this
  // one slide-over — never a new tab or a route change. Legal embeds the real,
  // vetted page (?embed=1 strips its chrome); X-Frame-Options is SAMEORIGIN so the
  // same-origin iframe renders the full content cleanly.
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

  const drawerRow = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] text-app-text transition-colors hover:bg-app-elevated';

  return (
    <div className="fixed inset-0 z-0 flex flex-col bg-app-bg text-app-text antialiased" style={{ height: '100dvh' }}>
      {/* ── Top bar (minimal, borderless) ────────────────────────────────────── */}
      <header className="sticky top-0 z-30 shrink-0 bg-app-bg/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-2 px-3">
          {/* No back arrow — it was easy to mis-tap and navigate away. The chat is
              the single home surface; there is no "Services" jump in the menu. */}
          <div className="flex min-w-0 items-center gap-1">
            <span className="truncate text-[15px] font-semibold tracking-tight text-app-text">
              {title ?? <>MyAvatar<span className="text-app-accent">.ge</span></>}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {/* Live GEL balance (always visible) + a minimal top-up (+) that hides
                inside the native iOS shell for App-Store compliance. */}
            <span className="px-1.5 text-[13px] font-semibold tabular-nums text-app-text">{(balanceGel ?? 0).toFixed(2)} ₾</span>
            <button type="button" onClick={() => setWalletOpen(true)} aria-label={t.topUp} title={t.topUp} data-iap-external className="flex h-8 w-8 items-center justify-center rounded-full text-app-accent transition-colors hover:bg-app-elevated touch-manipulation">
              <Plus className="h-4 w-4" />
            </button>
            {onNewChat && (
              <button type="button" onClick={onNewChat} aria-label={t.newChat} title={t.newChat} className="flex h-8 w-8 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation">
                <MessageSquarePlus className="h-[18px] w-[18px]" />
              </button>
            )}
            <button type="button" onClick={() => setMenuOpen(true)} aria-label={t.menu} className="flex h-8 w-8 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation">
              <Menu className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Body (the chat) ──────────────────────────────────────────────────── */}
      {/* paddingBottom = the cookie banner's height (a CSS var it publishes while
          shown) so the composer is never covered by it on first visit; collapses
          to 0 the moment the banner is dismissed. */}
      <div
        className={`min-h-0 flex-1 ${scrollBody ? 'overflow-y-auto' : 'flex'}`}
        style={{ paddingBottom: 'var(--cookie-bar-h, 0px)', transition: 'padding-bottom 0.2s ease' }}
      >
        {children}
      </div>

      {/* ── Settings drawer ──────────────────────────────────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <aside onClick={(e) => e.stopPropagation()} className="flex h-full w-72 max-w-[82vw] flex-col bg-app-surface shadow-[0_0_60px_rgba(0,0,0,0.35)] animate-[slideIn_0.2s_ease-out]" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <div className="flex items-center justify-between px-4 py-4">
              <span className="text-[15px] font-semibold tracking-tight text-app-text">{t.settings}</span>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="close" className="flex h-8 w-8 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
              {onNewChat && (
                <button type="button" onClick={() => { setMenuOpen(false); onNewChat(); }} className={`${drawerRow} font-medium text-app-accent`}>
                  <MessageSquarePlus className="h-[18px] w-[18px]" /> {t.newChat}
                </button>
              )}

              {/* Account line */}
              <div className="px-3 pb-1 pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-app-muted">{t.account}</p>
                <p className="mt-0.5 truncate text-[13px] text-app-text" title={userEmail ?? undefined}>{userEmail ?? t.accountGuest}</p>
              </div>

              {/* Preferences — theme + language grouped under one section header
                  (Theme used to be the only unlabelled row). */}
              <p className="px-3 pb-0.5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-app-muted">{locale === 'en' ? 'Preferences' : locale === 'ru' ? 'Предпочтения' : 'პრეფერენციები'}</p>
              <div className="flex items-center justify-between rounded-xl px-3 py-2 text-[13.5px] text-app-text">
                <span>{t.theme}</span>
                <ThemeToggle label={t.theme} />
              </div>

              {/* Language switcher — ka / en / ru (navigates to the locale's dashboard). */}
              <div className="px-3 pb-1 pt-1">
                <p className="mb-1.5 text-[12px] text-app-muted">{t.language}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {([['ka', 'ქართული'], ['en', 'English'], ['ru', 'Русский']] as const).map(([code, label]) => (
                    <a
                      key={code}
                      href={`/${code}/dashboard`}
                      className={`inline-flex items-center justify-center rounded-xl px-2 py-2 text-center text-[12px] font-medium transition-colors ${lang === code ? 'bg-app-accent/12 text-app-accent' : 'bg-app-elevated text-app-text hover:opacity-80'}`}
                    >
                      {label}
                    </a>
                  ))}
                </div>
              </div>

              <button type="button" onClick={() => { setMenuOpen(false); setSheet('library'); }} className={drawerRow}>
                <History className="h-[18px] w-[18px] text-app-muted" /> {t.library}
              </button>

              {!authed ? (
                <div className="mt-1 grid grid-cols-2 gap-2 px-1">
                  <button type="button" onClick={() => { setMenuOpen(false); setAuthMode('login'); setAuthOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-app-accent px-3 py-2.5 text-[13px] font-semibold text-app-bg transition-opacity hover:opacity-90"><LogIn className="h-4 w-4" /> {t.login}</button>
                  <button type="button" onClick={() => { setMenuOpen(false); setAuthMode('register'); setAuthOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-app-elevated px-3 py-2.5 text-[13px] font-semibold text-app-text transition-colors hover:opacity-80"><UserPlus className="h-4 w-4" /> {t.signup}</button>
                </div>
              ) : (
                <>
                  <button type="button" onClick={async () => { try { await createBrowserClient().auth.signOut(); } catch { /* listener clears state */ } setMenuOpen(false); }} className={drawerRow}><LogOut className="h-[18px] w-[18px] text-app-muted" /> {t.signOut}</button>
                  {/* Delete account — Apple Guideline 5.1.1(v): in-app, user-initiated. */}
                  <a href={`/${lang}/account/delete`} onClick={() => setMenuOpen(false)} className={drawerRow}><Trash2 className="h-[18px] w-[18px] text-app-danger" /> {t.deleteAccount}</a>
                </>
              )}

              {/* Legal — open IN-WINDOW (the real pages embedded), never a new tab. */}
              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-app-muted">{t.legal}</p>
              <button type="button" onClick={() => { setMenuOpen(false); setSheet('privacy'); }} className={drawerRow}><Shield className="h-[18px] w-[18px] text-app-muted" /> {t.privacy}</button>
              <button type="button" onClick={() => { setMenuOpen(false); setSheet('terms'); }} className={drawerRow}><FileText className="h-[18px] w-[18px] text-app-muted" /> {t.terms}</button>
              <button type="button" onClick={() => { setMenuOpen(false); setSheet('support'); }} className={drawerRow}><LifeBuoy className="h-[18px] w-[18px] text-app-muted" /> {t.support}</button>
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
        {sheet === 'library' ? (
          <StudioLibraryGrid locale={lang} />
        ) : sheet ? (
          // Legal pages embedded in-window. A spinner sits behind the iframe and is
          // covered the moment the (opaque) page paints — no blank flash.
          <div className="relative h-full w-full bg-app-bg">
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-app-muted" />
            </div>
            <iframe key={sheet} src={`/${locale}/${sheet}?embed=1`} title={sheet} className="relative h-full w-full border-0 bg-app-bg" />
          </div>
        ) : null}
      </StudioSheet>
    </div>
  );
}

export default ChatChrome;
