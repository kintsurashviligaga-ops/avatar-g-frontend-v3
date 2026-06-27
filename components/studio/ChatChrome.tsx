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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Menu, X, Plus, History, LogIn, LogOut, Shield, FileText, LifeBuoy, MessageSquarePlus, Loader2, Trash2, User, Settings, FolderOpen, Monitor, Moon, Sun, ChevronDown, Check, Camera,
} from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser';
import { CreditsModal } from '@/components/studio/CreditsModal';
import { LegalModal, type LegalKind } from '@/components/studio/LegalModal';
import AuthModal from '@/components/chat/AuthModal';
import WelcomeOnboarding from '@/components/onboarding/WelcomeOnboarding';
import NotificationBell from '@/components/notifications/NotificationBell';
import { track } from '@/lib/analytics/track';
import { StudioSheet } from '@/components/studio/StudioSheet';
import StudioLibraryGrid from '@/components/studio/StudioLibraryGrid';
import { useTheme } from '@/lib/theme/ThemeContext';
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

// On/off switch used by the Settings → Notifications + Generation-defaults toggles.
function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-app-accent' : 'bg-app-border/30'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

// Top-bar flag language switcher (replaces the old Settings → Language list). Preserves
// the current path, just swaps the locale segment.
const LANGS = [
  { code: 'ka', flag: '🇬🇪', label: 'ქარ' },
  { code: 'en', flag: '🇬🇧', label: 'ENG' },
  { code: 'ru', flag: '🇷🇺', label: 'РУС' },
] as const;

function LanguageSwitcher({ locale }: { locale: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.code === locale) ?? LANGS[0];
  const go = (code: string) => {
    setOpen(false);
    if (code === locale) return;
    const next = (pathname || `/${locale}/dashboard`).replace(/^\/(ka|en|ru)(?=\/|$)/, `/${code}`);
    router.push(next.startsWith(`/${code}`) ? next : `/${code}/dashboard`);
  };
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Language" aria-haspopup="menu" aria-expanded={open}
        className="flex min-h-[44px] items-center gap-1 rounded-full px-2 py-1.5 text-app-text transition-colors hover:bg-app-elevated touch-manipulation sm:min-h-0">
        <span className="text-[15px] leading-none">{current.flag}</span>
        <ChevronDown size={13} className={`text-app-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute right-0 top-full z-[61] mt-1.5 w-36 overflow-hidden rounded-2xl border border-app-border/10 bg-app-surface p-1 shadow-2xl">
            {LANGS.map((l) => (
              <button key={l.code} type="button" role="menuitemradio" aria-checked={l.code === locale} onClick={() => go(l.code)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors ${l.code === locale ? 'bg-app-accent/10 text-app-accent' : 'text-app-text hover:bg-app-elevated'}`}>
                <span className="text-[16px] leading-none">{l.flag}</span>
                <span className="flex-1 text-left font-medium">{l.label}</span>
                {l.code === locale && <Check size={14} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
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
  // Library opens IN-WINDOW in this slide-over. Legal (Privacy/Terms) no longer use
  // it — they're INSTANT client-side modals (LegalModal) with zero network/iframe, so
  // they paint in one frame instead of flashing an iframe-loaded page.
  const [sheet, setSheet] = useState<null | 'library'>(null);
  const router = useRouter();
  const [legalOpen, setLegalOpen] = useState<LegalKind | null>(null);
  const [authed, setAuthed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  // PHASE 3 Task 2 — first-login welcome. Default true to avoid a flash before the
  // localStorage read; the effect flips it false for users who haven't seen it.
  const [welcomed, setWelcomed] = useState(true);
  const [balanceGel, setBalanceGel] = useState<number | null>(null);
  // Profile editing (#3) + GDPR data export (#4).
  const [profileOpen, setProfileOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  // Profile photo (FIX 2): current URL + in-flight upload state + the hidden file input.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Theme (Dark / Light / System) for the Appearance section. ThemeContext is binary
  // (dark|light); "System" resolves the OS preference once via matchMedia.
  const { theme, setTheme } = useTheme();
  const pickSystemTheme = useCallback(() => {
    try { setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { setTheme('dark'); }
  }, [setTheme]);

  // Settings prefs (Notifications + Generation defaults) — localStorage only, no API.
  const [emailNotif, setEmailNotif] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [defaultVideoLen, setDefaultVideoLen] = useState<10 | 30 | 60>(30);
  useEffect(() => {
    try {
      setEmailNotif(localStorage.getItem('mya:notif-email') === '1');
      setAutoSave(localStorage.getItem('mya:autosave') !== '0');
      const len = Number(localStorage.getItem('mya:default-video-len'));
      if (len === 10 || len === 30 || len === 60) setDefaultVideoLen(len);
    } catch { /* private mode — defaults stand */ }
  }, []);
  const persist = useCallback((key: string, val: string) => { try { localStorage.setItem(key, val); } catch { /* ignore */ } }, []);

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
    supabase.auth.getUser().then(({ data }) => {
      apply(data.user);
      // Pull the saved profile photo so the header avatar shows it (RLS: own profile).
      if (data.user) {
        supabase.from('profiles').select('avatar_url').eq('id', data.user.id).maybeSingle()
          .then(({ data: p }) => { if (alive && p?.avatar_url) setAvatarUrl(p.avatar_url); });
      }
    }).catch(() => {});
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

  // Stripe Checkout returns to /dashboard?topup=success. The crediting webhook is
  // async, so poll the balance a few times to catch the credit landing, then strip
  // the query param so a refresh doesn't re-trigger. Fail-soft on every step.
  useEffect(() => {
    if (typeof window === 'undefined' || !authed) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('topup') !== 'success') return;
    track('payment_completed', {}); // PHASE 4 Task 1 — landed back from Stripe Checkout
    let n = 0;
    const id = window.setInterval(() => { n += 1; void refreshBalance(); if (n >= 5) window.clearInterval(id); }, 1500);
    void refreshBalance();
    params.delete('topup');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    return () => window.clearInterval(id);
  }, [authed, refreshBalance]);

  // PHASE 3 Task 2 — show the first-login welcome once per device.
  useEffect(() => {
    try { if (localStorage.getItem('myavatar:welcomed') === '1') setWelcomed(true); else setWelcomed(false); }
    catch { setWelcomed(true); }
  }, []);

  const drawerRow = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] text-app-text transition-colors hover:bg-app-elevated';
  const sectionHdr = 'px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-app-muted';
  const settingsDivider = 'my-2 border-t border-app-border/10';
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
          .slice(0, 20), // FIX 7D — cap the history list to the 20 most recent
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

  // FIX 2 — profile photo upload: read the file as a data URL → POST to /api/profile/avatar
  // (service-role upload to the public `avatars` bucket + profiles.avatar_url) → reflect it
  // in the header + profile modal. Optimistic preview; fail-soft.
  const uploadAvatar = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return;
    setAvatarBusy(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      setAvatarUrl(dataUrl); // optimistic
      const res = await fetch('/api/profile/avatar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ dataUrl }),
      });
      const j = (await res.json().catch(() => null)) as { url?: string } | null;
      if (res.ok && j?.url) setAvatarUrl(j.url);
    } catch { /* keep the optimistic preview */ }
    finally { setAvatarBusy(false); }
  }, []);

  const tHistory = locale === 'en' ? 'Chat History' : locale === 'ru' ? 'История чатов' : 'ჩატების ისტორია';
  const tNoHistory = locale === 'en' ? 'No conversations yet' : locale === 'ru' ? 'Пока нет чатов' : 'ჯერ არ არის ჩატები';
  const tLibrary = locale === 'en' ? 'Library' : locale === 'ru' ? 'Библиотека' : 'ბიბლიოთეკა';

  // FIX 6E — bucket the history into Today / Yesterday / Previous 7 days / Older so the
  // sidebar reads like ChatGPT/Claude. Only non-empty groups render (each already sorted
  // newest-first by refreshConversations). Recomputed when the list changes.
  const convGroups = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const today = start.getTime();
    const yesterday = today - 86_400_000;
    const week = today - 7 * 86_400_000;
    const buckets: Record<'today' | 'yesterday' | 'week' | 'older', typeof conversations> = { today: [], yesterday: [], week: [], older: [] };
    for (const c of conversations) {
      if (c.updatedAt >= today) buckets.today.push(c);
      else if (c.updatedAt >= yesterday) buckets.yesterday.push(c);
      else if (c.updatedAt >= week) buckets.week.push(c);
      else buckets.older.push(c);
    }
    const label = (k: 'today' | 'yesterday' | 'week' | 'older') => {
      const L = {
        today: { en: 'Today', ru: 'Сегодня', ka: 'დღეს' },
        yesterday: { en: 'Yesterday', ru: 'Вчера', ka: 'გუშინ' },
        week: { en: 'Previous 7 days', ru: 'Предыдущие 7 дней', ka: 'წინა 7 დღე' },
        older: { en: 'Older', ru: 'Ранее', ka: 'უფრო ადრე' },
      }[k];
      return lang === 'en' ? L.en : lang === 'ru' ? L.ru : L.ka;
    };
    return (['today', 'yesterday', 'week', 'older'] as const)
      .filter((k) => buckets[k].length > 0)
      .map((k) => ({ key: k, label: label(k), items: buckets[k] }));
  }, [conversations, lang]);

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
        className={`fixed inset-y-0 left-0 z-[70] flex h-full w-[260px] max-w-[84vw] shrink-0 flex-col border-r border-app-border/10 bg-app-surface transition-transform duration-200 ease-out md:static md:z-0 md:max-w-none md:shadow-none ${sidebarOpen ? 'translate-x-0 shadow-[0_0_60px_rgba(0,0,0,0.45)]' : '-translate-x-full md:translate-x-0'}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center justify-between px-3 py-3.5">
          <span className="truncate text-[16px] font-semibold tracking-tight text-app-text">MyAvatar<span className="text-app-accent">.ge</span></span>
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
            <div className="space-y-2 pb-2">
              {convGroups.map((g) => (
                <div key={g.key} className="space-y-0.5">
                  <p className="px-2.5 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-app-muted/70">{g.label}</p>
                  {g.items.map((c) => (
                    <button key={c.id} type="button" onClick={() => handleSelectConversation(c.id)} title={c.title} className="block w-full truncate rounded-lg px-2.5 py-2 text-left text-[14px] text-app-text/90 transition-colors hover:bg-app-elevated">
                      {c.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom — Library + Settings */}
        <div className="space-y-0.5 border-t border-app-border/10 px-2 py-2" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
          <button type="button" onClick={() => { setSidebarOpen(false); router.push(`/${locale}/library`); }} className={sideRow}>
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
              <span className="truncate text-[16px] font-semibold tracking-tight text-app-text md:hidden">
                {title ?? <>MyAvatar<span className="text-app-accent">.ge</span></>}
              </span>
              {title && <span className="hidden truncate text-[16px] font-semibold tracking-tight text-app-text md:inline">{title}</span>}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {/* FIX 3 — language switcher moved here from Settings (flag dropdown). */}
              <LanguageSwitcher locale={locale} />
              {/* PHASE 3 Task 3 — notification bell (signed-in users). */}
              {authed && <NotificationBell locale={locale} />}
              {/* FEATURE 5 — the whole "X.XX ₾ +" pill is one button → Credits/Billing modal. */}
              <button type="button" onClick={() => setCreditsOpen(true)} aria-label={t.topUp} title={t.topUp} data-iap-external
                className="flex min-h-[44px] items-center gap-1 rounded-full py-1.5 pl-2.5 pr-1.5 text-app-text transition-colors hover:bg-app-elevated touch-manipulation sm:min-h-0">
                <span className="text-[14px] font-semibold tabular-nums">{(balanceGel ?? 0).toFixed(2)} ₾</span>
                <span className="flex h-5 w-5 items-center justify-center text-app-accent"><Plus className="h-4 w-4" /></span>
              </button>
              {/* FEATURE 4 — visible auth entry: a "Sign in" button for guests, or an
                  avatar initial (→ settings) once signed in. The modal itself is AuthModal. */}
              {authed ? (
                <button type="button" onClick={() => setMenuOpen(true)} aria-label={t.account} title={userEmail ?? t.account}
                  className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-app-accent/15 text-[13px] font-bold uppercase text-app-accent transition-colors hover:bg-app-accent/25 touch-manipulation sm:h-9 sm:w-9">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                  ) : (userName?.[0] || userEmail?.[0] || 'U')}
                </button>
              ) : (
                <button type="button" onClick={() => { setAuthMode('login'); setAuthOpen(true); }} aria-label={t.login}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-app-accent px-3 py-1.5 text-[12.5px] font-semibold text-app-bg transition-opacity hover:opacity-90 touch-manipulation sm:min-h-0">
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

      {/* ── Settings drawer — 5 sections · sticky header · internal scroll ──────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 max-sm:p-0" onClick={() => setMenuOpen(false)}>
          <aside ref={settingsDialogRef} role="dialog" aria-modal="true" aria-label={t.settings} onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[420px] flex-col overflow-hidden rounded-2xl bg-app-surface shadow-[0_0_60px_rgba(0,0,0,0.45)] max-sm:h-full max-sm:!max-h-full max-sm:max-w-none max-sm:rounded-none"
            style={{ maxHeight: 'min(80vh, 680px)' }}>
            {/* Sticky header */}
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-app-border/10 bg-app-surface px-5 py-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
              <span className="text-[16px] font-semibold tracking-tight text-app-text">{t.settings}</span>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="close" className="flex h-9 w-9 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation"><X className="h-[18px] w-[18px]" /></button>
            </div>

            {/* Scrollable body — thin themed scrollbar */}
            <div className="flex-1 overflow-y-auto px-3 py-2 [scrollbar-color:rgb(var(--app-border)/0.3)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-app-border/20 [&::-webkit-scrollbar]:w-1.5" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>

              {/* SECTION 1 — ACCOUNT */}
              <p className={sectionHdr}>{t.account}</p>
              {authed ? (
                <>
                  <div className="mb-1 flex items-center gap-3 px-2 py-1.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-accent/15 text-[16px] font-bold uppercase text-app-accent">{userName?.[0] || userEmail?.[0] || 'U'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-app-text">{userName || userEmail}</p>
                      <span className="mt-0.5 inline-flex items-center rounded-full bg-app-elevated px-2 py-0.5 text-[11px] font-medium text-app-muted">{locale === 'en' ? 'Plan: Free' : locale === 'ru' ? 'План: Free' : 'გეგმა: Free'}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setDisplayName(userName ?? ''); setMenuOpen(false); setProfileOpen(true); }} className={drawerRow}><User className="h-[18px] w-[18px] text-app-muted" /> {locale === 'en' ? 'Edit profile' : locale === 'ru' ? 'Профиль' : 'პროფილი'}</button>
                  <button type="button" onClick={async () => { try { await createBrowserClient().auth.signOut(); } catch { /* listener clears state */ } setMenuOpen(false); }} className={`${drawerRow} hover:bg-app-danger/10 hover:text-app-danger`}><LogOut className="h-[18px] w-[18px] text-app-muted" /> {t.signOut}</button>
                </>
              ) : (
                <div className="px-2 pb-1 pt-0.5">
                  <p className="text-[14px] text-app-text">{locale === 'en' ? 'Account: Guest' : locale === 'ru' ? 'Аккаунт: Гость' : 'ანგარიში: სტუმარი'}</p>
                  <p className="mt-0.5 text-[12px] text-app-muted">{locale === 'en' ? 'Sign in to save your preferences' : locale === 'ru' ? 'Войдите, чтобы сохранить настройки' : 'შესვლა პრეფერენციების შესანახად'}</p>
                </div>
              )}

              <div className={settingsDivider} />
              {/* SECTION 2 — APPEARANCE */}
              <p className={sectionHdr}>{locale === 'en' ? 'Appearance' : locale === 'ru' ? 'Внешний вид' : 'გარეგნობა'}</p>
              <p className="px-2 pb-1.5 pt-1 text-[12px] text-app-muted">{t.theme}</p>
              <div className="grid grid-cols-3 gap-1.5 px-1">
                {([['dark', Moon, locale === 'en' ? 'Dark' : locale === 'ru' ? 'Тёмная' : 'მუქი'], ['light', Sun, locale === 'en' ? 'Light' : locale === 'ru' ? 'Светлая' : 'ნათელი'], ['system', Monitor, locale === 'en' ? 'System' : locale === 'ru' ? 'Система' : 'სისტემა']] as const).map(([id, Icon, label]) => {
                  const on = id !== 'system' && theme === id;
                  return (
                    <button key={id} type="button" onClick={() => (id === 'system' ? pickSystemTheme() : setTheme(id))}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[12px] font-medium transition-colors ${on ? 'border-app-accent/50 bg-app-accent/12 text-app-accent' : 'border-app-border/15 bg-app-elevated text-app-text hover:bg-app-border/10'}`}>
                      <Icon size={16} /> {label}
                    </button>
                  );
                })}
              </div>

              <div className={settingsDivider} />
              {/* SECTION 3 — NOTIFICATIONS */}
              <p className={sectionHdr}>{locale === 'en' ? 'Notifications' : locale === 'ru' ? 'Уведомления' : 'შეტყობინებები'}</p>
              <div className="flex items-center justify-between gap-3 px-2 py-2">
                <div className="min-w-0">
                  <p className="text-[14px] text-app-text">{locale === 'en' ? 'Updates' : locale === 'ru' ? 'Новости' : 'სიახლეები'}</p>
                  <p className="text-[12px] text-app-muted">{locale === 'en' ? 'Receive news about new features' : locale === 'ru' ? 'Новости о новых функциях' : 'მიიღე სიახლეები ახალ ფუნქციებზე'}</p>
                </div>
                <Toggle on={emailNotif} label="Email updates" onClick={() => { const v = !emailNotif; setEmailNotif(v); persist('mya:notif-email', v ? '1' : '0'); }} />
              </div>

              <div className={settingsDivider} />
              {/* SECTION 4 — GENERATION DEFAULTS */}
              <p className={sectionHdr}>{locale === 'en' ? 'Generation defaults' : locale === 'ru' ? 'Параметры генерации' : 'გენერაციის პარამეტრები'}</p>
              <p className="px-2 pb-1.5 pt-1 text-[12px] text-app-muted">{locale === 'en' ? 'Default video length' : locale === 'ru' ? 'Длина видео по умолчанию' : 'ვიდეოს ნაგულისხმევი ხანგრძლივობა'}</p>
              <div className="grid grid-cols-3 gap-1.5 px-1">
                {([10, 30, 60] as const).map((len) => (
                  <button key={len} type="button" onClick={() => { setDefaultVideoLen(len); persist('mya:default-video-len', String(len)); }}
                    className={`rounded-xl border px-2 py-2 text-[12.5px] font-medium transition-colors ${defaultVideoLen === len ? 'border-app-accent/50 bg-app-accent/12 text-app-accent' : 'border-app-border/15 bg-app-elevated text-app-text hover:bg-app-border/10'}`}>{len}s</button>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 px-2 py-2">
                <p className="text-[14px] text-app-text">{locale === 'en' ? 'Auto-save generations' : locale === 'ru' ? 'Автосохранение' : 'ავტო-შენახვა'}</p>
                <Toggle on={autoSave} label="Auto-save" onClick={() => { const v = !autoSave; setAutoSave(v); persist('mya:autosave', v ? '1' : '0'); }} />
              </div>

              <div className={settingsDivider} />
              {/* SECTION 5 — ABOUT (instant legal modals · mailto support) */}
              <p className={sectionHdr}>{locale === 'en' ? 'About' : locale === 'ru' ? 'О приложении' : 'შესახებ'}</p>
              <p className="px-2 pb-1 pt-0.5 text-[12px] text-app-muted">MyAvatar.ge v1.0.0</p>
              <button type="button" onClick={() => setLegalOpen('privacy')} className={drawerRow}><Shield className="h-[18px] w-[18px] text-app-muted" /> {t.privacy}</button>
              <button type="button" onClick={() => setLegalOpen('terms')} className={drawerRow}><FileText className="h-[18px] w-[18px] text-app-muted" /> {t.terms}</button>
              <a href="mailto:support@myavatar.ge" className={drawerRow}><LifeBuoy className="h-[18px] w-[18px] text-app-muted" /> {t.support}</a>
              {authed && (
                <a href={`/${lang}/account/delete`} onClick={() => setMenuOpen(false)} className={`${drawerRow} text-app-danger hover:bg-app-danger/10`}><Trash2 className="h-[18px] w-[18px]" /> {t.deleteAccount}</a>
              )}
              <p className="px-2 pt-3 text-center text-[11px] text-app-muted">© 2024 MyAvatar.ge</p>
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
      {/* Instant Privacy / Terms modals — pure client, no iframe/network (FIX 1). */}
      <LegalModal kind={legalOpen} onClose={() => setLegalOpen(null)} />
      {/* Edit-profile modal (#3) — display name → Supabase user_metadata. */}
      {profileOpen && (
        <div className="fixed inset-0 z-[86] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setProfileOpen(false)}>
          <div ref={profileDialogRef} role="dialog" aria-modal="true" aria-label={locale === 'en' ? 'Edit profile' : locale === 'ru' ? 'Редактировать профиль' : 'პროფილის რედაქტირება'} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-app-surface p-4 shadow-[0_0_60px_rgba(0,0,0,0.4)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[15px] font-semibold text-app-text">{locale === 'en' ? 'Edit profile' : locale === 'ru' ? 'Редактировать профиль' : 'პროფილის რედაქტირება'}</span>
              <button type="button" onClick={() => setProfileOpen(false)} aria-label="close" className="flex h-10 w-10 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation sm:h-8 sm:w-8"><X className="h-4 w-4" /></button>
            </div>
            {/* Profile photo (FIX 2) — click to upload; service-role route stores it. */}
            <div className="mb-4 flex flex-col items-center gap-2">
              <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarBusy} aria-label="Change photo"
                className="group relative h-20 w-20 overflow-hidden rounded-full bg-app-accent/15 ring-2 ring-app-border/15 transition hover:ring-app-accent/40">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[26px] font-bold uppercase text-app-accent">{userName?.[0] || userEmail?.[0] || 'U'}</span>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                  {avatarBusy ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
                </span>
              </button>
              <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarBusy}
                className="text-[12px] font-medium text-app-accent transition hover:opacity-80 disabled:opacity-50">
                {avatarBusy ? (locale === 'en' ? 'Uploading…' : locale === 'ru' ? 'Загрузка…' : 'იტვირთება…') : (locale === 'en' ? 'Change photo' : locale === 'ru' ? 'Сменить фото' : 'ფოტოს შეცვლა')}
              </button>
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); e.target.value = ''; }} />
            </div>
            <p className="mb-1.5 text-[12px] text-app-muted">{locale === 'en' ? 'Display name' : locale === 'ru' ? 'Отображаемое имя' : 'სახელი'}</p>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} placeholder={userEmail ?? ''} className="w-full rounded-xl border border-app-border/15 bg-app-bg/40 px-3 py-2.5 text-[14px] text-app-text outline-none transition-colors placeholder:text-app-muted focus:border-app-accent/60 focus:ring-2 focus:ring-app-accent/25" />
            <button type="button" onClick={() => void saveProfile()} disabled={savingProfile} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-app-accent px-4 py-2.5 text-[13px] font-semibold text-app-bg transition-opacity hover:opacity-90 disabled:opacity-50">{savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {locale === 'en' ? 'Save' : locale === 'ru' ? 'Сохранить' : 'შენახვა'}</button>
          </div>
        </div>
      )}
      <AuthModal open={authOpen} locale={lang} initialMode={authMode} onClose={() => setAuthOpen(false)} onAuthed={() => { setAuthOpen(false); void refreshBalance(); }} />

      {/* PHASE 3 Task 2 — first-login welcome (signed-in users who haven't seen it). */}
      {authed && !welcomed && (
        <WelcomeOnboarding locale={locale} balanceGel={balanceGel} onComplete={() => setWelcomed(true)} />
      )}
      {/* Library-only sheet now — Privacy/Terms moved to the instant LegalModal above. */}
      <StudioSheet open={sheet === 'library'} title={t.library} onClose={() => setSheet(null)}>
        {sheet === 'library' ? <StudioLibraryGrid locale={lang} /> : null}
      </StudioSheet>
    </div>
  );
}

export default ChatChrome;
