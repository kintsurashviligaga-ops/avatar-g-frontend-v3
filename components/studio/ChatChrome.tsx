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
  Menu, X, Plus, History, LogIn, UserPlus, LogOut, Shield, FileText, LifeBuoy, MessageSquarePlus, Loader2, Trash2, User, Download, Settings, FolderOpen,
} from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser';
import { CreditsModal } from '@/components/studio/CreditsModal';
import AuthModal from '@/components/chat/AuthModal';
import { StudioSheet } from '@/components/studio/StudioSheet';
import StudioLibraryGrid from '@/components/studio/StudioLibraryGrid';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useKeyboardResilience } from '@/hooks/useKeyboardResilience';
import { useDialogA11y } from '@/hooks/useDialogA11y';

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

  // iOS Safari leaves 100dvh full-height when the keyboard opens, sliding the composer
  // under it. Subtract the measured keyboard height from the shell so the input stays
  // visible (the same fix the sibling chat surface already uses).
  const { keyboardOffset } = useKeyboardResilience();
  const [menuOpen, setMenuOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
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
  // Profile editing (#3) + GDPR data export (#4).
  const [profileOpen, setProfileOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Reactive auth — flips Guest⇄User instantly (no reload) on sign in/out.
  useEffect(() => {
    let alive = true;
    const supabase = createBrowserClient();
    const apply = (user: { email?: string | null; user_metadata?: { name?: string } | null } | null) => {
      if (!alive) return;
      setAuthed(!!user);
      setUserEmail(user?.email ? String(user.email) : null);
      setUserName(user?.user_metadata?.name ?? null);
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
  const sideRow = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-app-text transition-colors hover:bg-app-elevated';

  // ── Left sidebar: chat-history list (mirrors OmniStudio's localStorage) + mobile drawer ──
  const OMNI_CONVERSATIONS_KEY = 'myavatar-omni-conversations';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Escape-to-close + focus trap/restore + dialog semantics for every overlay.
  // (sidebarOpen can only ever be true on mobile — the hamburger is md:hidden —
  // so the drawer keeps its persistent-desktop role and only becomes a modal here.)
  const sidebarDialogRef = useDialogA11y<HTMLElement>(sidebarOpen, () => setSidebarOpen(false));
  const settingsDialogRef = useDialogA11y<HTMLElement>(menuOpen, () => setMenuOpen(false));
  const profileDialogRef = useDialogA11y<HTMLDivElement>(profileOpen, () => setProfileOpen(false));
  // The drawer is a modal ONLY at mobile width; at >=md it's the persistent sidebar.
  // If it's open and the viewport crosses to desktop (rotate/resize/foldable), drop the
  // modal state so it sheds role=dialog/aria-modal and releases the focus trap.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => { if (mq.matches) setSidebarOpen(false); };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const [conversations, setConversations] = useState<{ id: string; title: string; updatedAt: number }[]>([]);
  const refreshConversations = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = JSON.parse(window.localStorage.getItem(OMNI_CONVERSATIONS_KEY) ?? '[]') as unknown;
      if (!Array.isArray(raw)) return;
      setConversations(
        raw
          .filter((c): c is { id: string; title?: string; updatedAt?: number } => !!c && typeof (c as { id?: unknown }).id === 'string')
          .map((c) => ({ id: c.id, title: (c.title || 'New chat').trim() || 'New chat', updatedAt: c.updatedAt ?? 0 }))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 40),
      );
    } catch {
      /* ignore corrupt history */
    }
  }, []);
  useEffect(() => {
    refreshConversations();
    const onUpd = () => refreshConversations();
    window.addEventListener('myavatar:conversations-updated', onUpd);
    window.addEventListener('focus', onUpd);
    return () => {
      window.removeEventListener('myavatar:conversations-updated', onUpd);
      window.removeEventListener('focus', onUpd);
    };
  }, [refreshConversations]);
  const handleNewChat = useCallback(() => {
    window.dispatchEvent(new Event('myavatar:new-chat'));
    onNewChat?.();
    setSidebarOpen(false);
  }, [onNewChat]);
  const handleSelectConversation = useCallback((id: string) => {
    window.dispatchEvent(new CustomEvent('myavatar:resume-conversation', { detail: { id } }));
    setSidebarOpen(false);
  }, []);

  // Save the display name to Supabase user_metadata (#3).
  const saveProfile = useCallback(async () => {
    setSavingProfile(true);
    try {
      await createBrowserClient().auth.updateUser({ data: { name: displayName.trim() } });
      setUserName(displayName.trim() || null);
      setProfileOpen(false);
    } catch { /* keep modal open on failure */ }
    finally { setSavingProfile(false); }
  }, [displayName]);

  // Fetch + download the user's full data as JSON (#4).
  const exportData = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/account/export', { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'myavatar-data.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch { /* noop */ }
    finally { setExporting(false); }
  }, []);

  const tHistory = locale === 'en' ? 'Chat History' : locale === 'ru' ? 'История чатов' : 'ჩატების ისტორია';
  const tNoHistory = locale === 'en' ? 'No conversations yet' : locale === 'ru' ? 'Пока нет чатов' : 'ჯერ არ არის ჩატები';
  const tLibrary = locale === 'en' ? 'Library' : locale === 'ru' ? 'Библиотека' : 'ბიბლიოთეკა';

  return (
    <div className="fixed inset-0 z-0 flex bg-app-bg text-app-text antialiased" style={{ height: keyboardOffset > 0 ? `calc(100dvh - ${keyboardOffset}px)` : '100dvh' }}>
      {/* Mobile backdrop for the slide-over sidebar. */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}

      {/* ── Left sidebar — persistent on desktop, swipe-from-left drawer on mobile ── */}
      <aside
        ref={sidebarDialogRef}
        role={sidebarOpen ? 'dialog' : undefined}
        aria-modal={sidebarOpen ? true : undefined}
        aria-label={t.menu}
        className={`fixed inset-y-0 left-0 z-[70] flex h-full w-[268px] max-w-[84vw] shrink-0 flex-col border-r border-app-border/10 bg-app-surface transition-transform duration-200 ease-out md:static md:z-0 md:max-w-none md:shadow-none ${sidebarOpen ? 'translate-x-0 shadow-[0_0_60px_rgba(0,0,0,0.45)]' : '-translate-x-full md:translate-x-0'}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center justify-between px-3 py-3.5">
          <span className="truncate text-[15px] font-semibold tracking-tight text-app-text">MyAvatar<span className="text-app-accent">.ge</span></span>
          <button type="button" onClick={() => setSidebarOpen(false)} aria-label="close" className="flex h-10 w-10 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation md:hidden"><X className="h-[18px] w-[18px]" /></button>
        </div>

        {/* New chat */}
        <div className="px-2">
          <button type="button" onClick={handleNewChat} className="flex w-full items-center gap-2.5 rounded-xl bg-app-elevated px-3 py-2.5 text-[13.5px] font-semibold text-app-text ring-1 ring-app-border/12 transition-colors hover:bg-app-border/10 active:scale-[0.99]">
            <MessageSquarePlus className="h-[17px] w-[17px] text-app-accent" /> {t.newChat}
          </button>
        </div>

        {/* Chat history list */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <p className="flex items-center gap-1.5 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-app-muted"><History className="h-3 w-3" /> {tHistory}</p>
          {conversations.length === 0 ? (
            <p className="px-2 py-1 text-[12px] text-app-muted">{tNoHistory}</p>
          ) : (
            <div className="space-y-0.5 pb-2">
              {conversations.map((c) => (
                <button key={c.id} type="button" onClick={() => handleSelectConversation(c.id)} title={c.title} className="block w-full truncate rounded-lg px-2.5 py-2 text-left text-[13px] text-app-text/90 transition-colors hover:bg-app-elevated">
                  {c.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom — Library + Settings */}
        <div className="space-y-0.5 border-t border-app-border/10 px-2 py-2" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
          <button type="button" onClick={() => { setSheet('library'); setSidebarOpen(false); }} className={sideRow}>
            <FolderOpen className="h-[17px] w-[17px] text-app-muted" /> {tLibrary}
          </button>
          <button type="button" onClick={() => { setMenuOpen((v) => !v); setSidebarOpen(false); }} className={sideRow}>
            <Settings className="h-[17px] w-[17px] text-app-muted" /> {t.settings}
          </button>
        </div>
      </aside>

      {/* ── Main column (header + chat) ──────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 shrink-0 bg-app-bg/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-2 px-3">
            <div className="flex min-w-0 items-center gap-1.5">
              {/* Mobile: open the sidebar drawer. Desktop: sidebar is persistent. */}
              <button type="button" onClick={() => setSidebarOpen(true)} aria-label={t.menu} className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation md:hidden">
                <Menu className="h-[18px] w-[18px]" />
              </button>
              <span className="truncate text-[15px] font-semibold tracking-tight text-app-text md:hidden">
                {title ?? <>MyAvatar<span className="text-app-accent">.ge</span></>}
              </span>
              {title && <span className="hidden truncate text-[15px] font-semibold tracking-tight text-app-text md:inline">{title}</span>}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {/* FEATURE 5 — the whole "X.XX ₾ +" pill is one button → Credits/Billing modal. */}
              <button type="button" onClick={() => setCreditsOpen(true)} aria-label={t.topUp} title={t.topUp} data-iap-external
                className="flex items-center gap-1 rounded-full py-1.5 pl-2.5 pr-1.5 text-app-text transition-colors hover:bg-app-elevated touch-manipulation">
                <span className="text-[13px] font-semibold tabular-nums">{(balanceGel ?? 0).toFixed(2)} ₾</span>
                <span className="flex h-5 w-5 items-center justify-center text-app-accent"><Plus className="h-4 w-4" /></span>
              </button>
              {/* FEATURE 4 — visible auth entry: a "Sign in" button for guests, or an
                  avatar initial (→ settings) once signed in. The modal itself is AuthModal. */}
              {authed ? (
                <button type="button" onClick={() => setMenuOpen(true)} aria-label={t.account} title={userEmail ?? t.account}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-app-accent/15 text-[13px] font-bold uppercase text-app-accent transition-colors hover:bg-app-accent/25 touch-manipulation">
                  {userName?.[0] || userEmail?.[0] || 'U'}
                </button>
              ) : (
                <button type="button" onClick={() => { setAuthMode('login'); setAuthOpen(true); }} aria-label={t.login}
                  className="inline-flex items-center gap-1.5 rounded-full bg-app-accent px-3 py-1.5 text-[12.5px] font-semibold text-app-bg transition-opacity hover:opacity-90 touch-manipulation">
                  <LogIn className="h-3.5 w-3.5" /> {t.login}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* paddingBottom = the cookie banner's height (a CSS var it publishes while
            shown) so the composer is never covered by it on first visit. */}
        <div
          className={`min-h-0 flex-1 ${scrollBody ? 'overflow-y-auto' : 'flex'}`}
          style={{ paddingBottom: 'var(--cookie-bar-h, 0px)', transition: 'padding-bottom 0.2s ease' }}
        >
          {children}
        </div>
      </div>

      {/* ── Settings drawer ──────────────────────────────────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <aside ref={settingsDialogRef} role="dialog" aria-modal="true" aria-label={t.settings} onClick={(e) => e.stopPropagation()} className="flex max-h-[86dvh] w-80 max-w-[92vw] flex-col overflow-hidden rounded-2xl bg-app-surface shadow-[0_0_60px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between px-4 py-4">
              <span className="text-[15px] font-semibold tracking-tight text-app-text">{t.settings}</span>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="close" className="flex h-10 w-10 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation sm:h-8 sm:w-8"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
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

              {!authed ? (
                <div className="mt-1 grid grid-cols-2 gap-2 px-1">
                  <button type="button" onClick={() => { setMenuOpen(false); setAuthMode('login'); setAuthOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-app-accent px-3 py-2.5 text-[13px] font-semibold text-app-bg transition-opacity hover:opacity-90"><LogIn className="h-4 w-4" /> {t.login}</button>
                  <button type="button" onClick={() => { setMenuOpen(false); setAuthMode('register'); setAuthOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-app-elevated px-3 py-2.5 text-[13px] font-semibold text-app-text transition-colors hover:opacity-80"><UserPlus className="h-4 w-4" /> {t.signup}</button>
                </div>
              ) : (
                <>
                  {/* Balance + top-up — hidden inside the iOS shell (data-iap-external). */}
                  <div data-iap-external className="mt-1 flex items-center justify-between rounded-xl bg-app-elevated/60 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-app-muted">{locale === 'en' ? 'Balance' : locale === 'ru' ? 'Баланс' : 'ბალანსი'}</p>
                      <p className="text-[15px] font-semibold tabular-nums text-app-text">{(balanceGel ?? 0).toFixed(2)} ₾</p>
                    </div>
                    <button type="button" onClick={() => { setMenuOpen(false); setCreditsOpen(true); }} className="shrink-0 rounded-full bg-app-accent px-3.5 py-1.5 text-[12px] font-semibold text-app-bg transition-opacity hover:opacity-90">{t.topUp}</button>
                  </div>
                  {/* Edit profile (#3) */}
                  <button type="button" onClick={() => { setDisplayName(userName ?? ''); setMenuOpen(false); setProfileOpen(true); }} className={drawerRow}><User className="h-[18px] w-[18px] text-app-muted" /> {locale === 'en' ? 'Edit profile' : locale === 'ru' ? 'Профиль' : 'პროფილი'}</button>
                  {/* Download my data — GDPR export (#4) */}
                  <button type="button" onClick={() => void exportData()} disabled={exporting} className={`${drawerRow} disabled:opacity-50`}>{exporting ? <Loader2 className="h-[18px] w-[18px] animate-spin text-app-muted" /> : <Download className="h-[18px] w-[18px] text-app-muted" />} {locale === 'en' ? 'Download my data' : locale === 'ru' ? 'Скачать мои данные' : 'მონაცემების ჩამოტვირთვა'}</button>
                  {/* Sign out */}
                  <button type="button" onClick={async () => { try { await createBrowserClient().auth.signOut(); } catch { /* listener clears state */ } setMenuOpen(false); }} className={drawerRow}><LogOut className="h-[18px] w-[18px] text-app-muted" /> {t.signOut}</button>
                  {/* Danger zone — delete account (Apple Guideline 5.1.1(v)). */}
                  <div className="mx-3 my-1.5 border-t border-app-border/10" />
                  <a href={`/${lang}/account/delete`} onClick={() => setMenuOpen(false)} className={`${drawerRow} text-app-danger hover:bg-app-danger/10`}><Trash2 className="h-[18px] w-[18px]" /> {t.deleteAccount}</a>
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

      <CreditsModal
        open={creditsOpen}
        locale={locale}
        balanceGel={balanceGel}
        authed={authed}
        onClose={() => { setCreditsOpen(false); void refreshBalance(); }}
        onSignIn={() => { setAuthMode('login'); setAuthOpen(true); }}
      />
      {/* Edit-profile modal (#3) — display name → Supabase user_metadata. */}
      {profileOpen && (
        <div className="fixed inset-0 z-[86] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setProfileOpen(false)}>
          <div ref={profileDialogRef} role="dialog" aria-modal="true" aria-label={locale === 'en' ? 'Edit profile' : locale === 'ru' ? 'Редактировать профиль' : 'პროფილის რედაქტირება'} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-app-surface p-4 shadow-[0_0_60px_rgba(0,0,0,0.4)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[15px] font-semibold text-app-text">{locale === 'en' ? 'Edit profile' : locale === 'ru' ? 'Редактировать профиль' : 'პროფილის რედაქტირება'}</span>
              <button type="button" onClick={() => setProfileOpen(false)} aria-label="close" className="flex h-10 w-10 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation sm:h-8 sm:w-8"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-1.5 text-[12px] text-app-muted">{locale === 'en' ? 'Display name' : locale === 'ru' ? 'Отображаемое имя' : 'სახელი'}</p>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} placeholder={userEmail ?? ''} className="w-full rounded-xl border border-app-border/15 bg-app-bg/40 px-3 py-2.5 text-[14px] text-app-text outline-none transition-colors placeholder:text-app-muted focus:border-app-accent/60 focus:ring-2 focus:ring-app-accent/25" />
            <button type="button" onClick={() => void saveProfile()} disabled={savingProfile} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-app-accent px-4 py-2.5 text-[13px] font-semibold text-app-bg transition-opacity hover:opacity-90 disabled:opacity-50">{savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {locale === 'en' ? 'Save' : locale === 'ru' ? 'Сохранить' : 'შენახვა'}</button>
          </div>
        </div>
      )}
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
