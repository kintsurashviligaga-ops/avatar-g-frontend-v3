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
  Menu, X, Plus, History, LogIn, LogOut, Shield, FileText, LifeBuoy, MessageSquarePlus, Loader2, Trash2, User, Settings, FolderOpen, Monitor, Moon, Sun, ChevronDown, ChevronLeft, Check, Camera, PanelLeftClose, PanelLeft,
} from 'lucide-react';
import dynamic from 'next/dynamic';

// DAY-5 — the real-time voice node. Lazy-loaded so it (and its media plumbing) never enters the initial
// chat bundle; opens as a full-screen overlay from a floating mic button. Additive: the text chat is untouched.
const VoiceConversation = dynamic(() => import('@/components/voice/VoiceConversation'), { ssr: false });
import { createBrowserClient } from '@/lib/supabase/browser';
import { CreditsModal } from '@/components/studio/CreditsModal';
import { LegalModal, type LegalKind } from '@/components/studio/LegalModal';
import AuthModal from '@/components/chat/AuthModal';
import WelcomeOnboarding from '@/components/onboarding/WelcomeOnboarding';
import NotificationBell from '@/components/notifications/NotificationBell';
import { track } from '@/lib/analytics/track';
import { StudioSheet } from '@/components/studio/StudioSheet';
import StudioLibraryGrid from '@/components/studio/StudioLibraryGrid';
import { useCreditsBalance } from '@/store/useCreditsBalance';
import { useTheme } from '@/lib/theme/ThemeContext';
import { AppToggle } from '@/components/ui/AppToggle';
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
// Delegates to the inline-styled AppToggle so it can never render "washed out" again.
function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return <AppToggle on={on} onChange={() => onClick()} label={label} />;
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

export function ChatChrome({ locale = 'ka', onBack, onNewChat, title, scrollBody = false, children }: ChatChromeProps) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  // iOS Safari leaves 100dvh full-height when the keyboard opens, sliding the composer
  // under it. Subtract the measured keyboard height from the shell so the input stays
  // visible (the same fix the sibling chat surface already uses).
  const { keyboardOffset } = useKeyboardResilience();
  const [menuOpen, setMenuOpen] = useState(false);
  // GLOBAL LOADING BAR — a thin top progress bar shown during ANY generation. OmniStudio
  // (and other surfaces) emit `myavatar:busy` {active, service}; the shell just renders.
  const [genBusy, setGenBusy] = useState(false);
  const [genService, setGenService] = useState<string | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  // Library opens IN-WINDOW in this slide-over. Legal (Privacy/Terms) no longer use
  // it — they're INSTANT client-side modals (LegalModal) with zero network/iframe, so
  // they paint in one frame instead of flashing an iframe-loaded page.
  const [sheet, setSheet] = useState<null | 'library'>(null);
  const router = useRouter();
  const pathname = usePathname();
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
  // A non-null avatarUrl can still fail to LOAD (restricted-public bucket → 403, stale/deleted
  // object, network miss). Without an onError path the <img> would sit as a broken (alt="") EMPTY
  // circle. Track a load-failure flag → fall back to the initials. Reset whenever the URL changes
  // (covers every setAvatarUrl path: load, optimistic upload, revert) so a fresh good photo re-renders.
  const [avatarBroken, setAvatarBroken] = useState(false);
  useEffect(() => { setAvatarBroken(false); }, [avatarUrl]);
  const [avatarBusy, setAvatarBusy] = useState(false);
  // Transient, self-contained toast for avatar-upload feedback (ChatChrome has no toast system).
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  // Ref (not state) so the async DB-read closure sees the CURRENT value: true while an upload is in flight,
  // to stop an auth-transition read from clobbering the optimistic/just-uploaded photo. lastAvatarUserId
  // de-dupes reads so we only refetch on a genuine account change, not on every token refresh / tab focus.
  const avatarUploadingRef = useRef(false);
  const lastAvatarUserIdRef = useRef<string | null>(null);
  // DAY-5 — real-time voice node overlay (opt-in from the floating mic button; text chat untouched).
  const [voiceOpen, setVoiceOpen] = useState(false);

  // Theme (Dark / Light / System) for the Appearance section. ThemeContext is binary
  // (dark|light); "System" resolves the OS preference once via matchMedia.
  const { theme, setTheme } = useTheme();
  const pickSystemTheme = useCallback(() => {
    try { setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { setTheme('dark'); }
  }, [setTheme]);

  // Settings prefs (Notifications + Generation defaults) — localStorage only, no API.
  const [emailNotif, setEmailNotif] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  useEffect(() => {
    try {
      setEmailNotif(localStorage.getItem('mya:notif-email') === '1');
      setAutoSave(localStorage.getItem('mya:autosave') !== '0');
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
    // Authoritative avatar read: always trust the DB row (never a stale client cache). Guards:
    //  • skip when an upload is in flight — a late read must not clobber/blank the optimistic photo;
    //  • only overwrite on a SUCCESSFUL read (a transient error leaves the current value untouched);
    //  • a cleared DB value clears the header. The stored URL carries a ?v=<ts> cache-bust.
    const loadAvatar = (userId: string) => {
      supabase.from('profiles').select('avatar_url').eq('id', userId).maybeSingle()
        .then(({ data: p, error }) => {
          if (alive && !error && !avatarUploadingRef.current) setAvatarUrl(p?.avatar_url ?? null);
        });
    };
    // De-dupe: read the profile ONCE per distinct user. This forces a fresh DB read on mount and on any
    // genuine account switch (re-auth), but skips redundant reads on every token refresh / tab focus that
    // would otherwise re-issue the query for the same user (and widen the upload race window).
    const syncUser = (user: { id?: string; email?: string | null; user_metadata?: { name?: string } | null } | null) => {
      apply(user);
      const uid = user?.id ?? null;
      if (uid && uid !== lastAvatarUserIdRef.current) { lastAvatarUserIdRef.current = uid; loadAvatar(uid); }
      else if (!uid) { lastAvatarUserIdRef.current = null; setAvatarUrl(null); }
    };
    supabase.auth.getUser().then(({ data }) => syncUser(data.user)).catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => syncUser(session?.user ?? null));
    return () => { alive = false; sub?.subscription?.unsubscribe(); };
  }, []);

  // Routed through the TTL-cached, request-deduped balance store (V3) so a route transition
  // reuses the cached ₾ value instead of re-hitting /api/credits/balance on every mount. force=true
  // bypasses the TTL — used on the two value-changing events (a spend + the Stripe top-up poll).
  const refreshBalance = useCallback(async (force = false) => {
    if (!authed) return;
    const b = await useCreditsBalance.getState().get(force);
    if (typeof b === 'number') setBalanceGel(b);
  }, [authed]);

  useEffect(() => { void refreshBalance(); }, [refreshBalance]);

  // V4 — re-read the balance the moment a generation deducts credits (OmniStudio dispatches
  // `myavatar:credits-updated` after every spend). Without this the ₾ pill stayed frozen after
  // generating, which read as "credits never get deducted".
  useEffect(() => {
    const onSpend = () => { void refreshBalance(true); }; // force — bypass the TTL after a spend
    window.addEventListener('myavatar:credits-updated', onSpend);
    return () => window.removeEventListener('myavatar:credits-updated', onSpend);
  }, [refreshBalance]);

  // Auth change → drop the cached balance so a re-login never shows the prior user's ₾ value.
  useEffect(() => { useCreditsBalance.getState().invalidate(); }, [authed]);

  // DAY-5 voice bridge — the composer's Gemini-style live-voice chip (OmniStudio) can't reach
  // setVoiceOpen across the component boundary, so it dispatches `myavatar:voice-open`. Authed →
  // open the real-time overlay; guest → open the sign-in modal (voice is an authed feature).
  useEffect(() => {
    const openVoice = () => {
      if (authed) setVoiceOpen(true);
      else { setAuthMode('login'); setAuthOpen(true); }
    };
    window.addEventListener('myavatar:voice-open', openVoice);
    return () => window.removeEventListener('myavatar:voice-open', openVoice);
  }, [authed]);

  // Stripe Checkout returns to /dashboard?topup=success. The crediting webhook is
  // async, so poll the balance a few times to catch the credit landing, then strip
  // the query param so a refresh doesn't re-trigger. Fail-soft on every step.
  useEffect(() => {
    if (typeof window === 'undefined' || !authed) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('topup') !== 'success') return;
    track('payment_completed', {}); // PHASE 4 Task 1 — landed back from Stripe Checkout
    let n = 0;
    const id = window.setInterval(() => { n += 1; void refreshBalance(true); if (n >= 5) window.clearInterval(id); }, 1500);
    void refreshBalance(true);
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
  // Desktop/iPad (>=md) COLLAPSE. On mobile the drawer is toggled by `sidebarOpen`; at >=md the sidebar was
  // permanently pinned with no way to hide it. This lets desktop/iPad users collapse it (persisted) — when
  // collapsed the aside is md:hidden and the top bar shows a re-open control + the brand so nothing is lost.
  const SIDEBAR_COLLAPSED_KEY = 'myavatar.sidebar.collapsed';
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => { try { setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'); } catch { /* noop */ } }, []);
  const setSidebarCollapsedPersist = useCallback((v: boolean) => {
    setSidebarCollapsed(v);
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, v ? '1' : '0'); } catch { /* noop */ }
  }, []);
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

  // Global loading bar — listen for generation activity emitted by OmniStudio.
  useEffect(() => {
    const onBusy = (e: Event) => {
      const d = (e as CustomEvent<{ active?: boolean; service?: string | null }>).detail;
      setGenBusy(!!d?.active);
      setGenService(d?.active ? (d?.service ?? null) : null);
    };
    window.addEventListener('myavatar:busy', onBusy as EventListener);
    return () => window.removeEventListener('myavatar:busy', onBusy as EventListener);
  }, []);
  // OmniStudio's active-conversation pointer (localStorage). Kept as a literal (not an
  // import) so a secondary surface like /library doesn't pull the whole 5k-line studio
  // into its bundle just for this key. MUST match OMNI_CURRENT_ID_KEY in OmniStudio.tsx.
  const OMNI_CURRENT_ID_KEY = 'myavatar-omni-current';
  const handleNewChat = useCallback(() => {
    window.dispatchEvent(new Event('myavatar:new-chat'));
    // On the studio surface onNewChat resets the chat in place. On OTHER surfaces that
    // render ChatChrome WITHOUT it (e.g. /library), "New chat" must actually NAVIGATE
    // back to the chat — otherwise the button does nothing and the user is stuck. Drop
    // the active pointer first so the dashboard mounts a genuinely fresh chat.
    if (onNewChat) onNewChat();
    else {
      try { window.localStorage.removeItem(OMNI_CURRENT_ID_KEY); } catch { /* ignore */ }
      router.push(`/${locale}/dashboard`);
    }
    setSidebarOpen(false);
  }, [onNewChat, router, locale]);
  const handleSelectConversation = useCallback((id: string) => {
    // On the dashboard OmniStudio is mounted and resumes in place via the event. On a
    // secondary surface (e.g. /library) nothing listens → persist the choice as the
    // active conversation and navigate; OmniStudio restores it from localStorage on mount.
    if ((pathname ?? '').includes('/dashboard')) {
      window.dispatchEvent(new CustomEvent('myavatar:resume-conversation', { detail: { id } }));
    } else {
      try { window.localStorage.setItem(OMNI_CURRENT_ID_KEY, id); } catch { /* ignore */ }
      router.push(`/${locale}/dashboard`);
    }
    setSidebarOpen(false);
  }, [pathname, router, locale]);
  // Delete ONE conversation from the shared localStorage store (history lives entirely
  // in localStorage — no Supabase). Optimistic local removal + a re-sync event for any
  // other mounted listener. If the deleted chat is the ACTIVE one, drop the pointer and
  // (on the dashboard) reset the open chat so the next message doesn't re-save it.
  // On the DASHBOARD OmniStudio owns the active conversation + an idle auto-save effect,
  // so mutating storage here would be resurrected on its next render — let OmniStudio do
  // the delete (it also resets the open chat if that's the one deleted). On a secondary
  // surface (e.g. /library) OmniStudio isn't mounted, so mutate localStorage directly.
  const onDashboard = (pathname ?? '').includes('/dashboard');
  const handleDeleteConversation = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== id)); // optimistic
    if (onDashboard) {
      window.dispatchEvent(new CustomEvent('myavatar:delete-conversation', { detail: { id } }));
      return;
    }
    try {
      const raw = JSON.parse(window.localStorage.getItem(OMNI_CONVERSATIONS_KEY) ?? '[]') as Array<{ id?: string }>;
      const next = Array.isArray(raw) ? raw.filter((c) => c?.id !== id) : [];
      window.localStorage.setItem(OMNI_CONVERSATIONS_KEY, JSON.stringify(next));
      if (window.localStorage.getItem(OMNI_CURRENT_ID_KEY) === id) window.localStorage.removeItem(OMNI_CURRENT_ID_KEY);
    } catch { /* ignore */ }
    window.dispatchEvent(new Event('myavatar:conversations-updated'));
  }, [onDashboard]);
  // Wipe ALL conversations (confirm first — irreversible). Resets the active chat too.
  const handleClearAll = useCallback(() => {
    const msg = locale === 'en' ? 'Delete ALL conversations? This cannot be undone.' : locale === 'ru' ? 'Удалить ВСЕ чаты? Это необратимо.' : 'ყველა ჩატი წაიშლება და ვერ აღდგება. გავაგრძელო?';
    if (typeof window !== 'undefined' && !window.confirm(msg)) return;
    setConversations([]); // optimistic
    if (onDashboard) {
      window.dispatchEvent(new Event('myavatar:clear-conversations'));
      return;
    }
    try {
      window.localStorage.removeItem(OMNI_CONVERSATIONS_KEY);
      window.localStorage.removeItem(OMNI_CURRENT_ID_KEY);
    } catch { /* ignore */ }
    window.dispatchEvent(new Event('myavatar:conversations-updated'));
  }, [onDashboard, locale]);

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
    const failMsg = locale === 'en' ? 'Photo upload failed. Please try again.'
      : locale === 'ru' ? 'Не удалось загрузить фото. Попробуйте снова.'
      : 'ფოტო ვერ აიტვირთა. სცადეთ თავიდან.';
    // Reject unsupported/oversized files with a visible reason instead of silently doing nothing.
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      setAvatarError(locale === 'en' ? 'Use an image under 5MB.'
        : locale === 'ru' ? 'Изображение до 5 МБ.'
        : 'გამოიყენე სურათი 5MB-მდე.');
      return;
    }
    avatarUploadingRef.current = true; // block auth-transition reads from clobbering this upload
    setAvatarBusy(true);
    setAvatarError(null);
    let previous: string | null = null;
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      setAvatarUrl((prev) => { previous = prev; return dataUrl; }); // optimistic + capture the prior value
      const res = await fetch('/api/profile/avatar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ dataUrl }),
      });
      const j = (await res.json().catch(() => null)) as { url?: string } | null;
      if (res.ok && j?.url) setAvatarUrl(j.url);
      else { setAvatarUrl(previous); setAvatarError(failMsg); } // revert — never leave a false "success" preview
    } catch {
      setAvatarUrl(previous); // network/read miss → revert to the prior avatar, not the unsaved preview
      setAvatarError(failMsg);
    }
    finally { setAvatarBusy(false); avatarUploadingRef.current = false; }
  }, [locale]);

  // Auto-dismiss the avatar toast so it never lingers.
  useEffect(() => {
    if (!avatarError) return;
    const id = setTimeout(() => setAvatarError(null), 3500);
    return () => clearTimeout(id);
  }, [avatarError]);

  const tHistory = locale === 'en' ? 'Chat History' : locale === 'ru' ? 'История чатов' : 'ჩატების ისტორია';
  const tNoHistory = locale === 'en' ? 'No conversations yet' : locale === 'ru' ? 'Пока нет чатов' : 'ჯერ არ არის ჩატები';
  const tLibrary = locale === 'en' ? 'Library' : locale === 'ru' ? 'Библиотека' : 'ბიბლიოთეკა';
  const tClearAll = locale === 'en' ? 'Clear all' : locale === 'ru' ? 'Очистить' : 'გასუფთავება';
  const tDelete = locale === 'en' ? 'Delete' : locale === 'ru' ? 'Удалить' : 'წაშლა';

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

  // ── Back control — the recurring "stuck on /library" bug ────────────────────────
  // ChatChrome is the shared shell for the dashboard assistant (ServiceHub passes
  // onBack → return to the card hub) AND secondary surfaces like /library that render
  // it with NO prop. The onBack prop existed in the interface but was never destructured
  // or rendered, so it did nothing — and /library passed nothing — leaving the user with
  // no header back button on either desktop or mobile. Fix: render a header back button
  // (visible on ALL viewports — the header is always sticky) whenever an explicit onBack
  // is given OR we're on a non-dashboard surface, defaulting the action to the chat home.
  const onLibrary = (pathname ?? '').includes('/library');
  const showBack = Boolean(onBack) || onLibrary;
  const goBack = onBack ?? (() => router.push(`/${locale}/dashboard`));
  // Secondary surfaces opened ON TOP of the studio (e.g. /library) get a CLOSE (X)
  // control that returns to the dashboard — semantically "close this overlay", not a
  // history "back" that could land on the wrong page. An explicit onBack (the lipsync
  // studio's exit-to-hub) still renders as a labelled chevron.
  const isCloseControl = onLibrary && !onBack;
  const backLabel = lang === 'en' ? 'Back' : lang === 'ru' ? 'Назад' : 'უკან';
  const closeLabel = lang === 'en' ? 'Close' : lang === 'ru' ? 'Закрыть' : 'დახურვა';

  return (
    <div className="ag-fixed-shell fixed inset-0 z-[2] flex bg-app-bg text-app-text antialiased" style={{ height: keyboardOffset > 0 ? `calc(100dvh - ${keyboardOffset}px)` : '100dvh' }}>
      {/* ── GLOBAL LOADING BAR — thin indeterminate top bar during ANY generation ── */}
      {genBusy && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[999]" aria-hidden style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="relative h-[3px] w-full overflow-hidden bg-app-accent/15">
            <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-app-accent" style={{ animation: 'mya-loadbar 1.1s ease-in-out infinite' }} />
          </div>
          {genService && (
            <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-app-border/15 bg-app-surface/95 px-3 py-1 text-[11px] font-medium text-app-text shadow-lg backdrop-blur-sm">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-app-accent align-middle motion-safe:animate-pulse" />
              {genService === 'video' ? `🎬 ${lang === 'en' ? 'Video' : lang === 'ru' ? 'Видео' : 'ვიდეო'}`
                : genService === 'image' ? `🖼 ${lang === 'en' ? 'Image' : lang === 'ru' ? 'Фото' : 'სურათი'}`
                : genService === 'music' ? `🎵 ${lang === 'en' ? 'Music' : lang === 'ru' ? 'Музыка' : 'მუსიკა'}`
                : genService === 'lipsync' ? `👄 ${lang === 'en' ? 'Avatar' : lang === 'ru' ? 'Аватар' : 'ავატარი'}`
                : genService === 'product' ? `📦 ${lang === 'en' ? 'Product ad' : lang === 'ru' ? 'Реклама' : 'რეკლამა'}`
                : genService === 'remix' ? `✂️ ${lang === 'en' ? 'Remix' : lang === 'ru' ? 'Ремикс' : 'რემიქსი'}`
                : `💬 ${lang === 'en' ? 'Working' : lang === 'ru' ? 'Работаю' : 'მუშავდება'}`}…
            </div>
          )}
        </div>
      )}
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
        className={`fixed inset-y-0 left-0 z-[70] flex h-full w-[260px] max-w-[84vw] shrink-0 flex-col border-r border-app-border/10 bg-app-surface transition-transform duration-200 ease-out md:static md:z-0 md:max-w-none md:shadow-none ${sidebarOpen ? 'translate-x-0 shadow-[0_0_60px_rgba(0,0,0,0.45)]' : '-translate-x-full md:translate-x-0'} ${sidebarCollapsed ? 'md:hidden' : ''}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center justify-between px-3 py-3.5">
          <span className="truncate text-[16px] font-semibold tracking-tight text-app-text">My<span className="text-app-accent">Avatar</span></span>
          {/* Collapse (desktop/iPad) + close-drawer (mobile) — one control. Visible on every breakpoint now. */}
          <button type="button" onClick={() => { setSidebarOpen(false); setSidebarCollapsedPersist(true); }}
            aria-label={locale === 'en' ? 'Collapse sidebar' : locale === 'ru' ? 'Свернуть панель' : 'გვერდითი პანელის დაკეცვა'}
            className="flex h-10 w-10 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation"><PanelLeftClose className="h-[18px] w-[18px]" /></button>
        </div>

        {/* New chat */}
        <div className="px-2">
          <button type="button" onClick={handleNewChat} className="flex w-full items-center gap-2.5 rounded-xl bg-app-elevated px-3 py-2.5 text-[13.5px] font-semibold text-app-text ring-1 ring-app-border/15 transition-colors hover:bg-app-border/10 active:scale-[0.99]">
            <MessageSquarePlus className="h-[17px] w-[17px] text-app-accent" /> {t.newChat}
          </button>
        </div>

        {/* Chat history list */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center justify-between gap-1.5 px-2 pb-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-app-muted"><History className="h-3 w-3" /> {tHistory}</span>
            {conversations.length > 0 && (
              <button type="button" onClick={handleClearAll} title={tClearAll}
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium text-app-muted/80 transition-colors hover:bg-red-500/10 hover:text-red-400 touch-manipulation">
                <Trash2 className="h-3 w-3" /> {tClearAll}
              </button>
            )}
          </div>
          {conversations.length === 0 ? (
            <p className="px-2 py-1 text-[12px] text-app-muted">{tNoHistory}</p>
          ) : (
            <div className="space-y-2 pb-2">
              {convGroups.map((g) => (
                <div key={g.key} className="space-y-0.5">
                  <p className="px-2.5 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-app-muted/70">{g.label}</p>
                  {g.items.map((c) => (
                    <div key={c.id} className="group relative">
                      {/* pr-8 leaves room for the delete control so the title never sits under it. */}
                      <button type="button" onClick={() => handleSelectConversation(c.id)} title={c.title} className="block w-full truncate rounded-lg py-2 pl-2.5 pr-8 text-left text-[14px] text-app-text/90 transition-colors hover:bg-app-elevated">
                        {c.title}
                      </button>
                      {/* Delete: always tappable on mobile; hover-reveal on desktop (md). */}
                      <button type="button" onClick={(e) => handleDeleteConversation(c.id, e)} aria-label={tDelete} title={tDelete}
                        className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-app-muted/70 opacity-100 transition-colors hover:bg-red-500/15 hover:text-red-400 touch-manipulation md:opacity-0 md:group-hover:opacity-100">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
              {/* Back to chat / hub — shown on a secondary surface (e.g. /library) or
                  whenever a parent passes onBack. Visible on ALL viewports so mobile
                  users aren't stranded behind the hamburger. */}
              {showBack && (
                isCloseControl ? (
                  <button type="button" onClick={goBack} aria-label={closeLabel}
                    className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation">
                    <X className="h-[18px] w-[18px]" />
                  </button>
                ) : (
                  <button type="button" onClick={goBack}
                    className="-ml-1 flex h-10 shrink-0 items-center gap-1 rounded-full pl-1.5 pr-2.5 text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation">
                    <ChevronLeft className="h-[18px] w-[18px]" />
                    {/* Visible text IS the accessible name — no aria-label needed. */}
                    <span className="text-[13.5px] font-medium">{backLabel}</span>
                  </button>
                )
              )}
              {/* Mobile: open the sidebar drawer. */}
              <button type="button" onClick={() => setSidebarOpen(true)} aria-label={t.menu} className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation md:hidden">
                <Menu className="h-[18px] w-[18px]" />
              </button>
              {/* Desktop/iPad: re-open the collapsed sidebar + keep the brand visible while it is hidden. */}
              {sidebarCollapsed && (
                <div className="hidden items-center gap-1.5 md:flex">
                  <button type="button" onClick={() => setSidebarCollapsedPersist(false)} aria-label={t.menu}
                    className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation"><PanelLeft className="h-[18px] w-[18px]" /></button>
                  {!showBack && !title && (
                    <span className="inline-flex items-center gap-1.5 text-[16px] font-semibold tracking-tight text-app-text">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/brand/gemini-rocket-clean.png" alt="" aria-hidden="true" width={18} height={18} decoding="async" className="h-[18px] w-[18px] shrink-0 object-contain drop-shadow-[0_2px_8px_rgba(34,211,238,0.15)]" />
                      <span>My<span className="text-app-accent">Avatar</span></span>
                    </span>
                  )}
                </div>
              )}
              <span className={`truncate text-[16px] font-semibold tracking-tight text-app-text ${showBack ? 'hidden' : 'md:hidden'}`}>
                {title ?? (
                  <span className="inline-flex items-center gap-1.5">
                    {/* Brand Rocket lockup — the OFFICIAL premium mark (same asset the Admin Panel's
                        BrandLogo renders: /brand/gemini-rocket-clean.png), for a unified corporate
                        identity. Decorative (the wordmark IS the accessible name); scoped to the
                        wordmark branch so a page title still truncates normally. object-contain +
                        the admin's subtle cyan drop-shadow keep it crisp + premium at 18px. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand/gemini-rocket-clean.png" alt="" aria-hidden="true" width={18} height={18} decoding="async" className="h-[18px] w-[18px] shrink-0 object-contain drop-shadow-[0_2px_8px_rgba(34,211,238,0.15)]" />
                    <span>My<span className="text-app-accent">Avatar</span></span>
                  </span>
                )}
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
                  {avatarUrl && !avatarBroken ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setAvatarBroken(true)} className="h-full w-full object-cover" />
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
              <div className="grid grid-cols-2 gap-1.5 px-1">
                {([['dark', Moon, locale === 'en' ? 'Dark' : locale === 'ru' ? 'Тёмная' : 'მუქი'], ['light', Sun, locale === 'en' ? 'Light' : locale === 'ru' ? 'Светлая' : 'ნათელი']] as const).map(([id, Icon, label]) => {
                  const on = theme === id;
                  return (
                    <button key={id} type="button" onClick={() => setTheme(id)}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[12px] font-medium transition-colors ${on ? 'border-app-accent/50 bg-app-accent/15 text-app-accent' : 'border-app-border/15 bg-app-elevated text-app-text hover:bg-app-border/10'}`}>
                      <Icon size={16} /> {label}
                    </button>
                  );
                })}
              </div>

              <div className={settingsDivider} />
              {/* SECTION 3 — NOTIFICATIONS */}
              <p className={sectionHdr}>{locale === 'en' ? 'Notifications' : locale === 'ru' ? 'Уведомления' : 'შეტყობინებები'}</p>
              <div className="flex items-center justify-between gap-3 px-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-app-text">{locale === 'en' ? 'Updates' : locale === 'ru' ? 'Новости' : 'სიახლეები'}</p>
                  <p className="text-[12px] text-app-muted">{locale === 'en' ? 'Receive news about new features' : locale === 'ru' ? 'Новости о новых функциях' : 'მიიღე სიახლეები ახალ ფუნქციებზე'}</p>
                </div>
                <Toggle on={emailNotif} label="Email updates" onClick={() => { const v = !emailNotif; setEmailNotif(v); persist('mya:notif-email', v ? '1' : '0'); }} />
              </div>

              <div className={settingsDivider} />
              {/* SECTION 4 — GENERATION DEFAULTS */}
              <p className={sectionHdr}>{locale === 'en' ? 'Generation defaults' : locale === 'ru' ? 'Параметры генерации' : 'გენერაციის პარამეტრები'}</p>
              <div className="flex items-center justify-between gap-3 px-2 py-2">
                <p className="text-[14px] text-app-text">{locale === 'en' ? 'Auto-save generations' : locale === 'ru' ? 'Автосохранение' : 'ავტო-შენახვა'}</p>
                <Toggle on={autoSave} label="Auto-save" onClick={() => { const v = !autoSave; setAutoSave(v); persist('mya:autosave', v ? '1' : '0'); }} />
              </div>

              <div className={settingsDivider} />
              {/* SECTION 5 — ABOUT (instant legal modals · mailto support) */}
              <p className={sectionHdr}>{locale === 'en' ? 'About' : locale === 'ru' ? 'О приложении' : 'შესახებ'}</p>
              <p className="px-2 pb-1 pt-0.5 text-[12px] text-app-muted">MyAvatar v1.0.0</p>
              <button type="button" onClick={() => setLegalOpen('privacy')} className={drawerRow}><Shield className="h-[18px] w-[18px] text-app-muted" /> {t.privacy}</button>
              <button type="button" onClick={() => setLegalOpen('terms')} className={drawerRow}><FileText className="h-[18px] w-[18px] text-app-muted" /> {t.terms}</button>
              <a href="mailto:support@myavatar.ge" className={drawerRow}><LifeBuoy className="h-[18px] w-[18px] text-app-muted" /> {t.support}</a>
              {authed && (
                <a href={`/${lang}/account/delete`} onClick={() => setMenuOpen(false)} className={`${drawerRow} text-app-danger hover:bg-app-danger/10`}><Trash2 className="h-[18px] w-[18px]" /> {t.deleteAccount}</a>
              )}
              <p className="px-2 pt-3 text-center text-[11px] text-app-muted">© 2024 MyAvatar</p>
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
                {avatarUrl && !avatarBroken ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setAvatarBroken(true)} className="h-full w-full object-cover" />
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
        {sheet === 'library' ? <StudioLibraryGrid locale={lang} onClose={() => setSheet(null)} /> : null}
      </StudioSheet>

      {/* DAY-5 real-time voice overlay. The launcher moved INTO the composer (OmniStudio's
          Gemini-style live-voice chip, right of the dictation mic), which dispatches
          'myavatar:voice-open' — handled by the effect above (authed → open; guest → sign-in).
          This de-clutters the workspace (no redundant floating FAB) while keeping one clear CTA. */}
      {voiceOpen && <VoiceConversation locale={lang} onClose={() => setVoiceOpen(false)} />}

      {/* Avatar-upload feedback toast — transient, self-contained (no global toast system here). */}
      {avatarError && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[1000] flex justify-center px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
          <div role="status" className="pointer-events-auto flex items-center gap-2 rounded-full border border-rose-400/30 bg-app-surface/95 px-4 py-2 text-[12.5px] font-medium text-rose-300 shadow-lg backdrop-blur">
            {avatarError}
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatChrome;
