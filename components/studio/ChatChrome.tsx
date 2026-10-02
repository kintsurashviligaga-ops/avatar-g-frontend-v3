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
import { ViewportDebugOverlay } from '@/components/studio/ViewportDebugOverlay';
import { InstallAppButton } from '@/components/ui/InstallAppButton';
import { useViewportClamp } from '@/lib/ui/useViewportClamp';
import { useRouter, usePathname } from 'next/navigation';
import {
  Menu, X, LogIn, LogOut, Shield, FileText, LifeBuoy, Loader2, Trash2, User, Settings, FolderOpen, Moon, Sun, ChevronDown, ChevronLeft, ChevronRight, Check, Camera, PanelLeftClose, PanelLeft, ScanFace, Sparkles, Clapperboard, PenSquare, Search, Wallet,
} from 'lucide-react';
import { MORE_TOOLS, PRIMARY_TOOLS, TOOL_META, isToolId, type ToolId } from '@/lib/studio/tools';
import { isStudioPath } from '@/lib/routing/landing';

/** The chat's own icon, from the tool list — the hub row and the tool rows can never draw different marks. */
const ChatIcon = TOOL_META.chat.Icon;
import dynamic from 'next/dynamic';

// DAY-5 — the real-time voice node. Lazy-loaded so it (and its media plumbing) never enters the initial
// chat bundle; opens as a full-screen overlay from a floating mic button. Additive: the text chat is untouched.
const VoiceConversation = dynamic(() => import('@/components/voice/VoiceConversation'), { ssr: false });
// Gemini Multimodal Live overlay — now the DEFAULT voice (live-validated native audio). ON unless
// NEXT_PUBLIC_GEMINI_LIVE_ENABLED is explicitly set falsy, which reverts to the ElevenLabs
// VoiceConversation below. Requires a signed-in userId to mint an ephemeral Live token (guests fall
// back to VoiceConversation regardless).
const GeminiLiveConversation = dynamic(() => import('@/components/voice/GeminiLiveConversation'), { ssr: false });
// Live Avatar enrollment (selfie + optional voice) → sets the user's core avatar shown in voice mode.
const LiveAvatarEnroll = dynamic(() => import('@/components/voice/LiveAvatarEnroll'), { ssr: false });
// Digital Twin v0 capture (consent → 3 photos → voice). It TAKES OVER the Live Avatar entry while NEXT_PUBLIC_TWIN_ENABLED
// is on — off until legal approves the consent text (lib/legal/content.ts); with it off nothing here changes.
const TwinCapture = dynamic(() => import('@/components/twin/TwinCapture'), { ssr: false });
const TWIN_ENABLED = isTwinEnabled();
// PREMIUM real-time lip-synced avatar (LiveAvatar/LiveKit). Attempted FIRST when enabled; auto-falls back to
// the Gemini audio-reactive selfie avatar until LIVEAVATAR_API_KEY is set AND the account is funded.
// ⚠️ OPT-IN (NEXT_PUBLIC_LIVEAVATAR_ENABLED=1). Live mode is Google-only by default: Gemini Live's native audio is
// both the speech-to-text and the voice. LiveAvatar is a separate vendor with its own STT/TTS, and a funded key in
// the environment was enough for it to take over every voice call ahead of Gemini.
const LiveAvatarRealtime = dynamic(() => import('@/components/voice/LiveAvatarRealtime'), { ssr: false });
const LIVEAVATAR_ENABLED = isTruthyFlag(process.env.NEXT_PUBLIC_LIVEAVATAR_ENABLED);
// After a LiveAvatar mint miss (unfunded/unconfigured), skip re-probing for a cooldown so the common
// (unfunded) voice-open stays instant on the Gemini path instead of paying the ~1-2s LiveAvatar probe every
// time — while still auto-retrying (and auto-activating) once the window lapses and funding lands.
let liveAvatarCooldownUntil = 0;
const LIVEAVATAR_COOLDOWN_MS = 5 * 60 * 1000;
const GEMINI_LIVE_ENABLED = isEnabledByDefault(process.env.NEXT_PUBLIC_GEMINI_LIVE_ENABLED);
import { isEnabledByDefault, isTruthyFlag } from '@/lib/env/flag';
import { isTwinEnabled } from '@/lib/twin/flag';
import { twinCopy } from '@/components/twin/copy';
import PersonaPicker, { loadSelectedPersonaId, loadCustomPersonas } from './PersonaPicker';
import { BUILT_IN_PERSONAS, personaName, type Persona } from '@/lib/services/personas/personas';
import { createBrowserClient } from '@/lib/supabase/browser';
import { CreditsModal } from '@/components/studio/CreditsModal';
import { paymentReturnMessage, pollBogOrder } from '@/lib/billing/bogCheckoutClient';
import { LEGAL_LINKS, legalDoc, legalHref } from '@/lib/legal/links';
import AuthModal from '@/components/chat/AuthModal';
import WelcomeOnboarding from '@/components/onboarding/WelcomeOnboarding';
import { track } from '@/lib/analytics/track';
import { formatCreditBalance } from '@/lib/billing/gel';
import { StudioSheet } from '@/components/studio/StudioSheet';
import StudioLibraryGrid from '@/components/studio/StudioLibraryGrid';
import { useCreditsBalance } from '@/store/useCreditsBalance';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useKeyboardResilience } from '@/hooks/useKeyboardResilience';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { signOutAndClear } from '@/lib/auth/sessionCleanup';
import { adoptLegacyArchive, conversationsKey } from '@/lib/chat/historyKeys';
import { Wordmark } from '@/components/brand/Wordmark';
import { ModelSwitcher, OPEN_PERSONA_EVENT, PERSONA_CHANGED_EVENT, announcePersona } from '@/components/chat/ModelSwitcher';
import { requestMicRelease } from '@/lib/voice/micBus';
import { disposePrimed, takePrimed } from '@/lib/voice/livePrime';
import { readSignInDeepLink, SIGN_IN_PARAMS } from '@/lib/routing/signIn';
import { EmptyState, SkeletonList, focusComposer } from '@/components/studio/ui/EmptyState';
import { ResearchHost, ResearchSidebarRow } from '@/components/studio/research';
import { HubHost, HubRailButton, HubSidebarRow, useHiddenTools, visibleToolIds } from '@/components/studio/hub';

type Lang = 'ka' | 'en' | 'ru';

type UserMeta = { name?: string; full_name?: string; given_name?: string } | null | undefined;

/**
 * The first name for the chat's personal greeting („გამარჯობა, {name}"). Google sign-in fills given_name / full_name,
 * the profile editor fills `name`. Bounded and trimmed — it is display text, never markup (React escapes it) — and
 * nothing is invented from the e-mail address: no name, no line.
 */
export function firstNameOf(meta: UserMeta): string {
  const raw = [meta?.given_name, meta?.name, meta?.full_name].find((v) => typeof v === 'string' && v.trim());
  const first = (raw ?? '').trim().split(/\s+/)[0] ?? '';
  return first.slice(0, 40);
}

/** Drop a Live prime nobody will adopt (its mic tracks must not stay hot under another voice engine). */
function dropUnadoptedPrime(): void {
  const p = takePrimed(Number.POSITIVE_INFINITY);
  if (p) disposePrimed(p);
}

const COPY: Record<Lang, {
  menu: string; settings: string; newChat: string; topUp: string; services: string; language: string;
  favorites: string; persona: string; billing: string; soon: string;
  account: string; accountGuest: string; library: string; login: string; signup: string;
  signOut: string; theme: string; legal: string; privacy: string; terms: string; support: string; deleteAccount: string;
}> = {
  ka: {
    menu: 'მენიუ', settings: 'პარამეტრები', newChat: 'ახალი ჩატი', topUp: 'შევსება', services: 'სერვისები', language: 'ენა',
    favorites: 'რჩეულები', persona: 'პერსონა', billing: 'ბილინგი', soon: 'მალე',
    account: 'ანგარიში', accountGuest: 'სტუმარი', library: 'ბიბლიოთეკა · ისტორია', login: 'შესვლა', signup: 'რეგისტრაცია',
    signOut: 'გასვლა', theme: 'თემა', legal: 'სამართლებრივი', privacy: 'კონფიდენციალურობა', terms: 'წესები და პირობები', support: 'დახმარება', deleteAccount: 'ანგარიშის წაშლა',
  },
  en: {
    menu: 'Menu', settings: 'Settings', newChat: 'New chat', topUp: 'Top up', services: 'Services', language: 'Language',
    favorites: 'Favorites', persona: 'Persona', billing: 'Billing', soon: 'Soon',
    account: 'Account', accountGuest: 'Guest', library: 'Library · History', login: 'Sign in', signup: 'Sign up',
    signOut: 'Sign out', theme: 'Theme', legal: 'Legal', privacy: 'Privacy Policy', terms: 'Terms of Service', support: 'Support', deleteAccount: 'Delete account',
  },
  ru: {
    menu: 'Меню', settings: 'Настройки', newChat: 'Новый чат', topUp: 'Пополнить', services: 'Сервисы', language: 'Язык',
    favorites: 'Избранное', persona: 'Персона', billing: 'Биллинг', soon: 'Скоро',
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
  /** Server-known session state, used ONLY to seed `authed` so the generation gate published on
   *  <html> is never '0' during the client-side getUser() round-trip. Optional: surfaces that do not
   *  know (e.g. /library) keep today's behaviour. */
  initialAuthed?: boolean;
  children: React.ReactNode;
}

// Top-bar flag language switcher (replaces the old Settings → Language list). Preserves
// the current path, just swaps the locale segment.
const LANGS = [
  { code: 'ka', flag: '🇬🇪', label: 'ქარ' },
  { code: 'en', flag: '🇬🇧', label: 'ENG' },
  { code: 'ru', flag: '🇷🇺', label: 'РУС' },
] as const;

function LanguageSwitcher({ locale, up = false }: { locale: string; up?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const langClamp = useViewportClamp(open);
  const current = LANGS.find((l) => l.code === locale) ?? LANGS[0];
  /**
   * ⚠️ THE BACKDROP BELOW DOES NOT CATCH OUTSIDE TAPS, AND CANNOT. It is `fixed inset-0 z-[60]`, which
   * looks like it covers the viewport — but it is rendered INSIDE the header, and the header establishes
   * its own stacking context. So that z-60 is ordered against the header's other children, not against
   * the composer and message list, which live in a sibling context painted on top. Measured: with the
   * menu open, elementFromPoint(200, 600) returns the composer's BUTTON, never the backdrop. Tapping
   * anywhere in the app left the menu hanging open.
   *
   * A document-level listener does not care about stacking contexts, so that is what closes it. The
   * backdrop stays for what it is genuinely good at — swallowing the tap so the thing behind it is not
   * ALSO activated when the tap does land on it.
   *
   * `pointerdown`, not `click`: it fires before focus moves and before a scroll can steal the gesture,
   * which is what makes this feel instant on a phone rather than a beat late.
   */
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const go = (code: string) => {
    setOpen(false);
    if (code === locale) return;
    const next = (pathname || `/${locale}/dashboard`).replace(/^\/(ka|en|ru)(?=\/|$)/, `/${code}`);
    router.push(next.startsWith(`/${code}`) ? next : `/${code}/dashboard`);
  };
  return (
    <div className="relative" ref={wrapRef}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Language" aria-haspopup="menu" aria-expanded={open}
        className="flex min-h-[44px] items-center gap-0.5 rounded-full px-1.5 py-1.5 text-app-text transition-colors hover:bg-app-elevated touch-manipulation sm:min-h-0 sm:gap-1 sm:px-2">
        <span className="text-[13px] font-semibold leading-none tracking-wide">{current.label}</span>
        <ChevronDown size={13} className={`text-app-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} aria-hidden />
          {/* ⚠️ MEASURED CLIPPED AT left:-36px ON A 320px VIEWPORT — the flags and the first characters of
              each label were off-screen. `right-0` anchors this to the language BUTTON, which sits well
              inside the header, and `max-w-[calc(100vw-1rem)]` cannot help because it caps WIDTH (the
              menu is 153px against a 304px cap) while the defect is POSITION. Shared clamp. */}
          <div role="menu" {...langClamp.props} className={`absolute right-0 z-[61] w-36 max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-app-border/10 bg-app-surface p-1 shadow-2xl ${up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}>
            {LANGS.map((l) => (
              <button key={l.code} type="button" role="menuitemradio" aria-checked={l.code === locale} onClick={() => go(l.code)}
                className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors ${l.code === locale ? 'bg-app-accent/10 text-app-accent' : 'text-app-text hover:bg-app-elevated'}`}>
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

export function ChatChrome({ locale = 'ka', onBack, onNewChat, title, scrollBody = false, initialAuthed = false, children }: ChatChromeProps) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  // iOS Safari leaves 100dvh full-height when the keyboard opens, sliding the composer
  // under it. Subtract the measured keyboard height from the shell so the input stays
  // visible (the same fix the sibling chat surface already uses).
  // Only the measured height is needed here; the raw inset is consumed by OmniStudio, which
  // publishes it as --kb-inset for the fixed-position overlays.
  const { keyboardOffset, viewportHeight, viewportTop } = useKeyboardResilience();
  const [menuOpen, setMenuOpen] = useState(false);
  // GLOBAL LOADING BAR — a thin top progress bar shown during ANY generation. OmniStudio
  // (and other surfaces) emit `myavatar:busy` {active, service}; the shell just renders.
  const [genBusy, setGenBusy] = useState(false);
  const [genService, setGenService] = useState<string | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'newPassword'>('login');
  // A sign-in deep link (/{lang}/dashboard?auth=login&redirect=…&error=… — lib/routing/signIn.ts) carries where to go
  // afterwards and, from a failed OAuth round-trip, what went wrong. Held only while that sheet is open.
  const [authReturnTo, setAuthReturnTo] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  // Library opens IN-WINDOW in this slide-over. The legal documents open as their own pages in a new tab
  // (lib/legal/links.ts) — the real localized text, never an iframe or a placeholder modal.
  const [sheet, setSheet] = useState<null | 'library'>(null);
  const router = useRouter();
  const pathname = usePathname();
  // Seeded from the SERVER-rendered session (dashboard page.tsx → ServiceHub → here) so the generation
  // gate on <html> is never published as '0' while the client-side getUser() round-trip is in flight —
  // that window made an ALREADY-SIGNED-IN user who tapped send get the sign-in modal. getUser() and
  // onAuthStateChange still correct this either way; the seed only removes the wrong FIRST answer.
  const [authed, setAuthed] = useState(initialAuthed);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  // PHASE 3 Task 2 — first-login welcome. Default true to avoid a flash before the
  // localStorage read; the effect flips it false for users who haven't seen it.
  const [welcomed, setWelcomed] = useState(true);
  const [balanceGel, setBalanceGel] = useState<number | null>(null);
  // Profile editing (#3) + GDPR data export (#4).
  const [profileOpen, setProfileOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
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
  // Iteration 4 — checkout return feedback (success / declined / cancelled), self-contained toast.
  const [payNotice, setPayNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  // Ref (not state) so the async DB-read closure sees the CURRENT value: true while an upload is in flight,
  // to stop an auth-transition read from clobbering the optimistic/just-uploaded photo. lastAvatarUserId
  // de-dupes reads so we only refetch on a genuine account change, not on every token refresh / tab focus.
  const avatarUploadingRef = useRef(false);
  const lastAvatarUserIdRef = useRef<string | null>(null);
  // DAY-5 — real-time voice node overlay (opt-in from the floating mic button; text chat untouched).
  const [voiceOpen, setVoiceOpen] = useState(false);
  // Live Avatar enrollment modal (selfie + voice) — opened from the profile menu or the myavatar:avatar-enroll event.
  const [avatarEnrollOpen, setAvatarEnrollOpen] = useState(false);
  // Set when the Live token mint reports Live is disabled/unavailable server-side (503) → fall back to the
  // ElevenLabs voice stack at runtime for this open. Reset on each fresh open so a transient miss retries Live.
  const [liveUnavailable, setLiveUnavailable] = useState(false);
  // Set when the LiveAvatar real-time mint is unavailable (unfunded/unconfigured/connect fail) → drop to the
  // Gemini audio-reactive selfie avatar. Reset on each open so it auto-activates the moment funding lands.
  const [liveAvatarUnavailable, setLiveAvatarUnavailable] = useState(false);
  // Signed-in user id — needed to mint a Gemini Live ephemeral token (flag-gated live voice only).
  const [userId, setUserId] = useState<string | null>(null);

  // Theme (Dark / Light / System) for the Appearance section. ThemeContext is binary
  // (dark|light). The old "System" option and its matchMedia resolver were removed from the UI; the
  // helper outlived it as dead code and went with it.
  const { theme, setTheme } = useTheme();
  // Settings prefs (Notifications + Generation defaults) — localStorage only, no API.
  // The „სიახლეები“ and „ავტო-შენახვა“ toggles were removed: nothing read either key (mya:notif-email,
  // mya:autosave) — two switches that changed nothing are the definition of superfluous.

  // Reactive auth — flips Guest⇄User instantly (no reload) on sign in/out.
  useEffect(() => {
    let alive = true;
    const supabase = createBrowserClient();
    const apply = (user: { email?: string | null; user_metadata?: UserMeta } | null) => {
      if (!alive) return;
      setAuthed(!!user);
      setUserEmail(user?.email ? String(user.email) : null);
      setUserName(user?.user_metadata?.name ?? null);
      setFirstName(firstNameOf(user?.user_metadata));
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
    const syncUser = (user: { id?: string; email?: string | null; user_metadata?: UserMeta } | null) => {
      apply(user);
      const uid = user?.id ?? null;
      setUserId(uid);
      if (uid && uid !== lastAvatarUserIdRef.current) { lastAvatarUserIdRef.current = uid; loadAvatar(uid); }
      else if (!uid) { lastAvatarUserIdRef.current = null; setAvatarUrl(null); }
    };
    supabase.auth.getUser().then(({ data }) => {
      syncUser(data.user);
      // Deep link: /dashboard?voice=1 (the studio's Voice tab) opens the voice overlay — or sign-in, since voice
      // is an authed feature. Decided only once auth is known; the param is removed so a reload does not re-open.
      try {
        const url = new URL(window.location.href);
        // Deep link: ?auth=login|signup — THE sign-in address now that the standalone /login and /signup pages are
        // gone (lib/routing/signIn.ts; next.config.js redirects the old ones here, query and all). A member is sent
        // straight on to `redirect` (what the old page's server-side short-circuit did); a guest gets the sheet.
        const link = readSignInDeepLink(url.searchParams);
        if (link) {
          for (const k of SIGN_IN_PARAMS) url.searchParams.delete(k);
          window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
          try {
            if (link.plan) sessionStorage.setItem('myavatar:intended-plan', link.plan);
            if (link.ref) localStorage.setItem('myavatar:ref', link.ref.toUpperCase()); // AuthModal redeems it after sign-up
          } catch { /* private mode */ }
          if (link.mode === 'recover') {
            // The password-reset mail: /auth/callback already signed them in with its code — ask for the NEW password.
            // No session means the link was used or expired: say so on the sign-in sheet.
            setAuthReturnTo(link.redirect);
            if (data.user) { setAuthError(null); setAuthMode('newPassword'); }
            else { setAuthError('Token has expired or is invalid'); setAuthMode('login'); }
            setAuthOpen(true);
          } else if (data.user) {
            if (link.redirect && link.redirect !== `${url.pathname}${url.search}`) window.location.replace(link.redirect);
          } else {
            setAuthReturnTo(link.redirect);
            setAuthError(link.error);
            setAuthMode(link.mode === 'signup' ? 'register' : 'login');
            setAuthOpen(true);
          }
        }
        if (url.searchParams.get('voice') === '1') {
          url.searchParams.delete('voice');
          window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
          // Not a gesture, so there is no prime to adopt — but the rest of the page may already hold the mic (dictation,
          // the music recorder): ask them to let go before Live asks for it, or Android refuses the capture.
          if (data.user) { requestMicRelease('live'); setLiveUnavailable(false); setLiveAvatarUnavailable(false); setVoiceOpen(true); }
          else { setAuthMode('login'); setAuthOpen(true); }
        }
      } catch { /* no URL API */ }
    }).catch(() => {});
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
      // The composer's chip primed Live inside the tap (lib/voice/livePrime). When this open will NOT be Gemini Live —
      // the flag is off, or the opt-in LiveAvatar goes first — nobody adopts that prime: release it now, before the
      // other engine asks for the same microphone.
      if (!authed || !GEMINI_LIVE_ENABLED || (LIVEAVATAR_ENABLED && Date.now() >= liveAvatarCooldownUntil)) dropUnadoptedPrime();
      if (authed) { setLiveUnavailable(false); setLiveAvatarUnavailable(false); setVoiceOpen(true); }
      else { setAuthMode('login'); setAuthOpen(true); }
    };
    window.addEventListener('myavatar:voice-open', openVoice);
    return () => window.removeEventListener('myavatar:voice-open', openVoice);
  }, [authed]);
  /**
   * ⚠️ THE CALL MUST NOT FOLLOW AN AUTH FLICKER. The engine is chosen from `userId`, which a token refresh can null for
   * a moment: Live unmounted, VoiceConversation mounted and grabbed the mic, then Live came back and asked for it
   * again — two token mints and a rapid re-acquire that Android answers with „the microphone could not start“. The id
   * is latched when the call opens and held until it closes.
   */
  const [voiceUid, setVoiceUid] = useState<string | null>(null);
  useEffect(() => {
    if (!voiceOpen) { setVoiceUid(null); return; }
    if (userId) setVoiceUid((cur) => cur ?? userId);
  }, [voiceOpen, userId]);
  const liveUid = voiceUid ?? userId;
  // Signed in, but the client has not resolved WHO yet (the session was seeded from the server): wait for the id
  // instead of starting the ElevenLabs fallback and swapping it for Live a moment later.
  const awaitingLiveUid = GEMINI_LIVE_ENABLED && authed && !liveUid && !liveUnavailable;

  // ⚠️ THE GENERATION GATE, PUBLISHED WHERE ANY SURFACE CAN READ IT SYNCHRONOUSLY. The composer must
  // decide whether to send BEFORE it fires a request, and it cannot await an auth lookup at the moment
  // of a tap without adding the very latency this session has been removing. A data attribute on <html>
  // is the same publish-once pattern already used for --composer-h and --kb-inset: one owner writes it,
  // any consumer reads it with zero async.
  useEffect(() => {
    document.documentElement.dataset.authed = authed ? '1' : '0';
    // Published for the same reason as `authed`: the conversation archive is keyed by uid and is touched
    // from two components that share no provider. A stale uid in either would split one user's history
    // across two storage keys — exactly the loss lib/chat/historyKeys.ts exists to prevent.
    if (userId) document.documentElement.dataset.uid = userId;
    else delete document.documentElement.dataset.uid;
    adoptLegacyArchive(userId);
  }, [authed, userId]);
  // The first name, for the chat's personal greeting in OmniStudio — published like `authed` and `uid`, because the
  // two components share no provider. Removed on sign-out.
  useEffect(() => {
    const root = document.documentElement;
    if (authed && firstName) root.dataset.firstName = firstName;
    else delete root.dataset.firstName;
  }, [authed, firstName]);

  // Generation gate bridge — a surface that detects a guest dispatches `myavatar:auth-required` and we
  // open sign-in. This replaces the old shape where the request went out, the route answered 401, and
  // the user met an error for something the UI could have known before spending the round-trip.
  useEffect(() => {
    // A spend gate asks for an account (register); a plain „შესვლა" button passes detail 'login'.
    const needAuth = (e: Event) => { setAuthMode((e as CustomEvent<unknown>).detail === 'login' ? 'login' : 'register'); setAuthOpen(true); };
    window.addEventListener('myavatar:auth-required', needAuth);
    return () => window.removeEventListener('myavatar:auth-required', needAuth);
  }, []);

  // ⚠️ RUNNING OUT OF CREDITS WAS A DEAD END. The chat printed a grey "insufficient credits" bubble and
  // stopped there — the user had to work out for themselves that the balance pill in the header is also
  // the top-up button. That is the single moment in the whole product where someone has ALREADY DECIDED
  // to spend money, and it offered them no way to. Same bridge as the auth gate: the surface that
  // detects it dispatches, and the component that owns the modal opens it.
  useEffect(() => {
    const openCredits = () => setCreditsOpen(true);
    window.addEventListener('myavatar:open-credits', openCredits);
    return () => window.removeEventListener('myavatar:open-credits', openCredits);
  }, []);

  /**
   * Pick up a purchase the user started on the pricing page.
   *
   * ⚠️ THEY CLICKED A PLAN AND WE FORGOT. PricingSection sends people to the sign-in link with ?plan=pro; the
   * deep-link reader above stashes that choice, and this is the other half — once they are actually signed in, the
   * checkout they were heading for opens by itself. Without this the stash is just a value nobody reads,
   * and the highest-intent click in the funnel still ends in a dashboard with no mention of the plan.
   * Consumed on read, so it fires exactly once and a later visit is not ambushed by a payment dialog.
   */
  useEffect(() => {
    if (!authed) return;
    let plan: string | null = null;
    try { plan = sessionStorage.getItem('myavatar:intended-plan'); sessionStorage.removeItem('myavatar:intended-plan'); }
    catch { /* private mode — nothing stashed */ }
    if (plan) setCreditsOpen(true);
  }, [authed]);

  // Live Avatar enrollment bridge — any surface can dispatch `myavatar:avatar-enroll`. Authed → open the
  // enrollment sheet; guest → sign-in first (enrollment writes to the user's profile).
  useEffect(() => {
    const openEnroll = () => {
      if (authed) setAvatarEnrollOpen(true);
      else { setAuthMode('login'); setAuthOpen(true); }
    };
    window.addEventListener('myavatar:avatar-enroll', openEnroll);
    return () => window.removeEventListener('myavatar:avatar-enroll', openEnroll);
  }, [authed]);

  // Checkout return handler (Iteration 4). Every rail lands back on /dashboard with a status param:
  //   ?bog=<order>&pay=success|failed — Bank of Georgia (top-up or plan) → ask /api/billing/bog/orders/<order>
  //   ?topup=success   — Stripe wallet-topup settled         → poll the balance (async crediting webhook)
  //   ?tier=success    — Stripe USD tier purchased           → poll the balance too (was previously ignored)
  //   ?topup=failed    — order failed                        → dismissible retry notice (NON-locking)
  //   ?topup=canceled  — user cancelled Stripe checkout      → dismissible cancelled notice
  // The param is always stripped so a refresh never re-triggers. Fail-soft on every step.
  useEffect(() => {
    if (typeof window === 'undefined' || !authed) return;
    const params = new URLSearchParams(window.location.search);
    // Bank of Georgia returns with ?bog=<our order id>&pay=success|failed. The redirect proves nothing on its own (BOG:
    // only the callback / receipt is final), so ask our server — which reconciles with BOG's receipt on the spot — and
    // say exactly what happened. A failure reopens the plans sheet so the customer can retry where they were.
    const bogOrder = params.get('bog');
    if (bogOrder) {
      const pay = params.get('pay');
      params.delete('bog');
      params.delete('pay');
      const rest = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
      setPayNotice({ ok: true, text: locale === 'ka' ? 'გადახდის შემოწმება…' : locale === 'ru' ? 'Проверяем платёж…' : 'Checking your payment…' });
      void (async () => {
        const status = await pollBogOrder(bogOrder, { attempts: pay === 'failed' ? 2 : 6, intervalMs: 2000 });
        const notice = paymentReturnMessage(status, pay, locale);
        if (status?.status === 'completed') {
          track('payment_completed', { rail: 'bog', kind: status.kind });
          void refreshBalance(true);
        }
        setPayNotice({ ok: notice.ok, text: notice.text });
        if (notice.reopenPricing) setCreditsOpen(true);
      })();
      return;
    }
    const topup = params.get('topup');
    const tier = params.get('tier');
    const paidOk = topup === 'success' || tier === 'success';
    const paidFail = topup === 'failed';
    const paidCancel = topup === 'canceled' || tier === 'canceled';
    if (!paidOk && !paidFail && !paidCancel) return;

    let cleanup: (() => void) | undefined;
    if (paidOk) {
      track('payment_completed', {}); // PHASE 4 Task 1 — landed back from checkout
      let n = 0;
      const id = window.setInterval(() => { n += 1; void refreshBalance(true); if (n >= 5) window.clearInterval(id); }, 1500);
      void refreshBalance(true);
      setPayNotice({ ok: true, text: locale === 'ka' ? 'გადახდა მიღებულია — ბალანსი განახლდა.' : locale === 'ru' ? 'Оплата получена — баланс обновлён.' : 'Payment received — balance updated.' });
      cleanup = () => window.clearInterval(id);
    } else {
      // Declined / cancelled bank txn → clean recovery: a dismissible notice, the workflow stays open.
      setPayNotice({
        ok: false,
        text: paidCancel
          ? (locale === 'ka' ? 'გადახდა გაუქმდა.' : locale === 'ru' ? 'Оплата отменена.' : 'Payment cancelled.')
          : (locale === 'ka' ? 'გადახდა ვერ შესრულდა. სცადე თავიდან.' : locale === 'ru' ? 'Платёж не прошёл. Попробуйте снова.' : 'Payment failed. Please try again.'),
      });
    }
    params.delete('topup');
    params.delete('tier');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    return cleanup;
  }, [authed, refreshBalance, locale]);

  // Auto-dismiss the checkout-return notice so it never lingers.
  useEffect(() => {
    if (!payNotice) return;
    const id = setTimeout(() => setPayNotice(null), 4500);
    return () => clearTimeout(id);
  }, [payNotice]);

  // PHASE 3 Task 2 — show the first-login welcome once per device.
  useEffect(() => {
    try { if (localStorage.getItem('myavatar:welcomed') === '1') setWelcomed(true); else setWelcomed(false); }
    catch { setWelcomed(true); }
  }, []);

  // 44 px rows (docs/DESIGN.md §5) — py-2.5 around 14 px text came to ~42.
  const drawerRow = 'flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] text-app-text transition-colors hover:bg-app-elevated';
  const sectionHdr = 'px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-app-muted';
  const settingsDivider = 'my-2 border-t border-app-border/10';
  // 44px, not the 38px it was. These rows ARE the app's primary navigation — Library, Persona,
  // Billing, Settings — and they were the smallest targets on the screen. Measured at 242×38.
  const sideRow = 'flex min-h-[44px] [@media(pointer:fine)]:min-h-[40px] w-full items-center gap-3 rounded-full px-3 text-left text-[13.5px] text-app-text transition-colors hover:bg-app-elevated touch-manipulation';
  const sideHdr = 'px-3 pb-1 pt-3 text-[11.5px] font-medium text-app-muted';
  const railBtn = 'flex h-11 w-11 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation';

  // ── Left sidebar: chat-history list (mirrors OmniStudio's localStorage) + mobile drawer ──
  // uid-scoped, and OUTSIDE the sign-out wipe — see lib/chat/historyKeys.ts. It was a single global slot
  // that two accounts on one browser overwrote for each other, and that sign-out deleted outright.
  const OMNI_CONVERSATIONS_KEY = conversationsKey(userId);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Service hub is collapsed by default: chat history stays the sidebar's centre of gravity.
  const [personaOpen, setPersonaOpen] = useState(false);
  // Only used for the "a persona is active" dot — read once on mount (localStorage is not reactive).
  const [activePersonaId, setActivePersonaId] = useState('');
  useEffect(() => { setActivePersonaId(loadSelectedPersonaId()); }, []);
  // The persona is chosen in three places now — this sidebar row, the model switcher's persona row (both open the
  // picker below) and the chat composer's chip (✕ clears it). The chip and the switchers announce changes; follow them.
  useEffect(() => {
    const onChanged = (e: Event) => {
      const d = (e as CustomEvent<unknown>).detail;
      setActivePersonaId(typeof d === 'string' ? d : loadSelectedPersonaId());
    };
    const onOpen = () => { setSidebarOpen(false); setPersonaOpen(true); };
    window.addEventListener(PERSONA_CHANGED_EVENT, onChanged);
    window.addEventListener(OPEN_PERSONA_EVENT, onOpen);
    return () => {
      window.removeEventListener(PERSONA_CHANGED_EVENT, onChanged);
      window.removeEventListener(OPEN_PERSONA_EVENT, onOpen);
    };
  }, []);
  /**
   * ⚠️ THE ROW SAID "პერსონა" AND A DOT. The dot told you a persona was active and nothing else — so the
   * one thing you actually want to know, WHO you are talking to, required opening the picker to find out.
   * A persona changes the assistant's tone and which studio it reaches for; leaving that unnamed on the
   * only always-visible surface is the difference between a setting and a setting you can trust.
   *
   * Custom personas are resolved from local storage too, so a user's own specialist is named like the
   * built-ins rather than falling back to the generic label.
   */
  const activePersonaName = useMemo(() => {
    if (!activePersonaId) return '';
    const lang: 'ka' | 'en' | 'ru' = locale === 'en' || locale === 'ru' ? locale : 'ka';
    const found = BUILT_IN_PERSONAS.find((p: Persona) => p.id === activePersonaId)
      ?? loadCustomPersonas().find((p: Persona) => p.id === activePersonaId);
    return found ? personaName(found, lang) : '';
  }, [activePersonaId, locale]);
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
          // Every chat the studio keeps (OmniStudio's CONV_MAX, 40). At 20 the search could not find chats 21–40 that
          // still existed — a search box that misses what is there is worse than none.
          .slice(0, 40),
      );
    } catch {
      /* ignore corrupt history */
    }
    // ⚠️ THIS HAD NO DEPENDENCIES, so it kept the FIRST render's key — the guest archive (`::anon`, userId is null
    // until auth resolves). A signed-in user's recent list showed the guest's chats, not their own.
  }, [OMNI_CONVERSATIONS_KEY]);
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
  // One-shot handoff for "open this old chat". MUST match OMNI_RESUME_KEY in OmniStudio.tsx.
  const OMNI_RESUME_KEY = 'myavatar-omni-resume';
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
  // The studio's active tool, published by OmniStudio (`omni:tool-changed`) so the sidebar can mark it.
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  useEffect(() => {
    // A child's effects run before its parent's, so OmniStudio's FIRST announcement lands before this listener
    // exists — it also leaves the tool on <html data-tool>, read here once.
    const initial = document.documentElement.dataset.tool;
    if (isToolId(initial)) setActiveTool(initial);
    const on = (e: Event) => { const d = (e as CustomEvent<unknown>).detail; if (isToolId(d)) setActiveTool(d); };
    window.addEventListener('omni:tool-changed', on as EventListener);
    return () => window.removeEventListener('omni:tool-changed', on as EventListener);
  }, []);
  // On a desktop the header is hidden and the studio draws its own top bar; its new-session button asks through this.
  useEffect(() => {
    const on = () => handleNewChat();
    window.addEventListener('myavatar:open-new-chat', on);
    return () => window.removeEventListener('myavatar:open-new-chat', on);
  }, [handleNewChat]);
  // The tools the user switched off in the hub's Plugins tab leave the sidebar and the rail (never the one they are on).
  // ⚠️ Menus only — selectTool, ?tool= and the studio still open a hidden tool (lib/plugins/catalog.ts).
  const hiddenTools = useHiddenTools();
  const navPrimary = useMemo(() => visibleToolIds(PRIMARY_TOOLS, hiddenTools, activeTool), [hiddenTools, activeTool]);
  const navMore = useMemo(() => visibleToolIds(MORE_TOOLS, hiddenTools, activeTool), [hiddenTools, activeTool]);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { if (activeTool && (MORE_TOOLS as readonly string[]).includes(activeTool)) setMoreOpen(true); }, [activeTool]);
  const [searchOpen, setSearchOpen] = useState(false);
  // Picking a service from the sidebar: in the studio it switches the tool in place; anywhere else it opens the
  // studio on that tool (`?tool=`, read once by OmniStudio).
  const onStudioHome = isStudioPath(pathname) && !onBack;
  const selectTool = useCallback((id: ToolId) => {
    setSidebarOpen(false);
    if (onStudioHome) { window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: id })); return; }
    const url = `/${locale}/dashboard?tool=${id}`;
    // ⚠️ On the dashboard's own #lipsync / #agent surfaces a client push is a no-op: Next keys the page without the
    // query and pushState fires no hashchange, so ServiceHub stayed where it was. A document load lands on the studio.
    if (isStudioPath(pathname)) window.location.assign(url);
    else router.push(url);
  }, [onStudioHome, router, locale, pathname]);
  const handleSelectConversation = useCallback((id: string) => {
    // On the dashboard OmniStudio is mounted and resumes in place via the event. On a
    // secondary surface (e.g. /library) nothing listens → persist the choice as the
    // active conversation and navigate; OmniStudio restores it from localStorage on mount.
    if (isStudioPath(pathname)) {
      window.dispatchEvent(new CustomEvent('myavatar:resume-conversation', { detail: { id } }));
    } else {
      // One-shot handoff: OmniStudio consumes this on mount. Writing OMNI_CURRENT_ID_KEY instead would
      // make the chat sticky across every later refresh, which is the behaviour we just removed.
      try { window.localStorage.setItem(OMNI_RESUME_KEY, id); } catch { /* ignore */ }
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
  const onDashboard = isStudioPath(pathname);
  const handleDeleteConversation = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== id)); // optimistic

    /** Remove the row from storage ourselves. Returns false when there was nothing left to remove. */
    const purgeLocally = (): boolean => {
      try {
        const raw = JSON.parse(window.localStorage.getItem(OMNI_CONVERSATIONS_KEY) ?? '[]') as Array<{ id?: string }>;
        if (!Array.isArray(raw) || !raw.some((c) => c?.id === id)) return false;
        window.localStorage.setItem(OMNI_CONVERSATIONS_KEY, JSON.stringify(raw.filter((c) => c?.id !== id)));
        if (window.localStorage.getItem(OMNI_CURRENT_ID_KEY) === id) window.localStorage.removeItem(OMNI_CURRENT_ID_KEY);
        return true;
      } catch { return false; }
    };

    if (onDashboard) {
      // ⚠️ THIS USED TO DISPATCH AND RETURN, WRITING NOTHING. The delete then depended entirely on
      // OmniStudio being mounted with its listener attached — and when it was not, the click was purely
      // optimistic: the row vanished from this component's state and came back on the next read. Caught
      // by an E2E test, not by reading: every unit involved was correct on its own.
      //
      // ⚠️ ORDER MATTERS. OmniStudio is still asked FIRST, because it reads the row to get its serverSid
      // before deleting — that id is what tombstones the chat and deletes it server-side, and it is
      // unrecoverable once the row is gone. Only if the row SURVIVES the round trip do we purge it here,
      // so the user's click always sticks even when nobody was listening.
      window.dispatchEvent(new CustomEvent('myavatar:delete-conversation', { detail: { id } }));
      window.setTimeout(() => {
        if (purgeLocally()) {
          // eslint-disable-next-line no-console
          console.warn('[chrome] delete fell back to a local purge — the studio was not listening');
          window.dispatchEvent(new Event('myavatar:conversations-updated'));
        }
      }, 0);
      return;
    }
    purgeLocally();
    window.dispatchEvent(new Event('myavatar:conversations-updated'));
    // ⚠️ The key is a dependency: it is uid-scoped and starts as the guest's (userId is null until auth resolves).
    // With `[onDashboard]` alone a signed-in user's delete purged `::anon` and the row came straight back.
  }, [onDashboard, OMNI_CONVERSATIONS_KEY]);
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
  }, [onDashboard, locale, OMNI_CONVERSATIONS_KEY]);

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

  const tNoHistory = locale === 'en' ? 'No conversations yet' : locale === 'ru' ? 'Пока нет чатов' : 'ჯერ არ არის ჩატები';
  const tStartChat = locale === 'en' ? 'Start a chat' : locale === 'ru' ? 'Начать чат' : 'დაიწყე ჩატი';
  /**
   * ⚠️ "NO CONVERSATIONS YET" WAS A LIE FOR A SIGNED-IN USER ON A NEW DEVICE. The list starts from this device's
   * localStorage, and the account's own chats arrive a beat later (OmniStudio's cross-device sync) — so the sidebar
   * said there were none, then they popped in under it. Until the sync answers (data-history-sync on <html>, plus
   * an event), a signed-in studio shows skeleton rows of the rows' own height instead. Off the studio nothing syncs,
   * and a cap makes sure a hung request can never leave skeletons up for good.
   */
  const [historySynced, setHistorySynced] = useState(false);
  useEffect(() => {
    const read = () => { if (document.documentElement.dataset.historySync === 'done') setHistorySynced(true); };
    read();
    window.addEventListener('myavatar:history-synced', read);
    const cap = window.setTimeout(() => setHistorySynced(true), 8000);
    return () => { window.removeEventListener('myavatar:history-synced', read); window.clearTimeout(cap); };
  }, []);
  // The empty history's one next step: the chat, with the caret in its composer — once the phone drawer has slid away
  // (200 ms) and handed focus back; focusComposer refuses a box that is still covered.
  const startChat = useCallback(() => {
    selectTool('chat');
    window.setTimeout(() => { focusComposer(); }, 250);
  }, [selectTool]);
  const tSearch = locale === 'en' ? 'Search chats…' : locale === 'ru' ? 'Поиск по чатам…' : 'ძებნა ჩატებში…';
  const tNoMatch = locale === 'en' ? 'Nothing found' : locale === 'ru' ? 'Ничего не найдено' : 'ვერაფერი მოიძებნა';
  const tLibrary = locale === 'en' ? 'Library' : locale === 'ru' ? 'Библиотека' : 'ბიბლიოთეკა';
  const tClearAll = locale === 'en' ? 'Clear all' : locale === 'ru' ? 'Очистить' : 'გასუფთავება';
  const tDelete = locale === 'en' ? 'Delete' : locale === 'ru' ? 'Удалить' : 'წაშლა';
  const tNewSession = locale === 'en' ? 'New session' : locale === 'ru' ? 'Новая сессия' : 'ახალი სესია';
  const tSearchRow = locale === 'en' ? 'Search' : locale === 'ru' ? 'Поиск' : 'ძებნა';
  const tMore = locale === 'en' ? 'More' : locale === 'ru' ? 'Ещё' : 'მეტი';
  const tRecent = locale === 'en' ? 'Recent' : locale === 'ru' ? 'Недавние' : 'ბოლო';
  const tBalance = locale === 'en' ? 'Balance' : locale === 'ru' ? 'Баланс' : 'ბალანსი';
  const tCollapse = locale === 'en' ? 'Collapse sidebar' : locale === 'ru' ? 'Свернуть панель' : 'გვერდითი პანელის დაკეცვა';
  const tExpand = locale === 'en' ? 'Expand sidebar' : locale === 'ru' ? 'Развернуть панель' : 'გვერდითი პანელის გაშლა';
  // „ძებნა“ opens the search field on demand; past a handful of chats it is simply always there.
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  // FIX 6E — bucket the history into Today / Yesterday / Previous 7 days / Older so the
  // sidebar reads like ChatGPT/Claude. Only non-empty groups render (each already sorted
  // newest-first by refreshConversations). Recomputed when the list changes.
  /**
   * Search over the history list.
   *
   * ⚠️ THE SIDEBAR ALREADY GROUPED BY DATE AND STILL HAD NO WAY TO FIND ANYTHING. Grouping helps you
   * scan the last few days; it does nothing for a chat from three weeks ago whose title you half
   * remember, which is exactly when a user reaches for history at all. Shown only past a handful of
   * chats, so a new account is not given a search box for four rows.
   */
  const [convQuery, setConvQuery] = useState('');
  const convMatches = useMemo(() => {
    const q = convQuery.trim().toLowerCase();
    return q ? conversations.filter((c) => (c.title || '').toLowerCase().includes(q)) : conversations;
  }, [conversations, convQuery]);

  const convGroups = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const today = start.getTime();
    const yesterday = today - 86_400_000;
    const week = today - 7 * 86_400_000;
    const buckets: Record<'today' | 'yesterday' | 'week' | 'older', typeof conversations> = { today: [], yesterday: [], week: [], older: [] };
    for (const c of convMatches) {
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
  }, [convMatches, lang]);

  // ── Back control — the recurring "stuck on /library" bug ────────────────────────
  // ChatChrome is the shared shell for the dashboard assistant (ServiceHub passes
  // onBack → return to the card hub) AND secondary surfaces like /library that render
  // it with NO prop. The onBack prop existed in the interface but was never destructured
  // or rendered, so it did nothing — and /library passed nothing — leaving the user with
  // no header back button on either desktop or mobile. Fix: render a header back button
  // (visible on ALL viewports — the header is always sticky) whenever an explicit onBack
  // is given OR we're on a non-dashboard surface, defaulting the action to the chat home.
  const onLibrary = (pathname ?? '').includes('/library');
  // The studio row exists per DEPLOYMENT (STUDIO_V2, published on <html> by the root layout), never per route.
  const [studioV2, setStudioV2] = useState(false);
  useEffect(() => { setStudioV2(document.documentElement.dataset.studioV2 === '1'); }, []);
  const tStudio = lang === 'en' ? 'Studio' : lang === 'ru' ? 'Студия' : 'სტუდია';
  const tBeta = lang === 'en' ? 'Beta' : lang === 'ru' ? 'Бета' : 'ბეტა';
  const showBack = Boolean(onBack) || onLibrary;
  const goBack = onBack ?? (() => router.push(`/${locale}/dashboard`));
  // Secondary surfaces opened ON TOP of the studio (e.g. /library) get a CLOSE (X)
  // control that returns to the dashboard — semantically "close this overlay", not a
  // history "back" that could land on the wrong page. An explicit onBack (the lipsync
  // studio's exit-to-hub) still renders as a labelled chevron.
  const isCloseControl = onLibrary && !onBack;
  // The studio's chat: the header's name becomes the model switcher (never on /library or a titled surface).
  const chatHeader = onStudioHome && activeTool === 'chat' && !showBack && !title;
  const backLabel = lang === 'en' ? 'Back' : lang === 'ru' ? 'Назад' : 'უკან';
  const closeLabel = lang === 'en' ? 'Close' : lang === 'ru' ? 'Закрыть' : 'დახურვა';

  return (
    <>
    <ViewportDebugOverlay />
    <div className="ag-fixed-shell fixed inset-0 z-[2] flex bg-app-bg text-app-text antialiased" style={{
      // ⚠️ WAS `calc(100dvh - keyboardOffset)`, WHICH DOUBLE-SUBTRACTS ON ANDROID. Chrome's `dvh` is the
      // DYNAMIC viewport and already shrinks when the keyboard opens, so subtracting the offset removed
      // the keyboard height twice and left a band of dead black space between the composer and the
      // keyboard. iOS Safari does not shrink `dvh`, which is why the old formula looked correct there
      // and the defect only ever showed on Android.
      //
      // The measured visual viewport is the visible area on both platforms, with no arithmetic to get
      // wrong. Falls back to 100dvh where visualViewport is unsupported — the pre-existing behaviour.
      // ⚠️ SIZING ALONE WAS NOT ENOUGH — THE SHELL ALSO HAS TO MOVE. `inset-0` pins top:0, so giving it
      // the visual viewport's HEIGHT while leaving it at the layout viewport's ORIGIN draws it
      // `offsetTop` pixels too high the moment the browser scroll-shifts to reveal the focused input.
      // The composer then appears near the top of the screen with a band of black beneath it, which is
      // the screenshot. Anchor to the visible band's origin as well as its height, and release `bottom`
      // so inset-0's bottom:0 cannot fight the explicit height.
      // ⚠️ THIS WAS FIGHTING THE PLATFORM FIX. The viewport meta already declares
      // `interactive-widget=resizes-content`, which makes the LAYOUT viewport shrink for the keyboard —
      // so `inset-0` and `100dvh` track it natively, exactly like the Gemini comparison. But the
      // condition here was `viewportHeight > 0`, which is true the moment visualViewport reports
      // anything, i.e. ALWAYS. So the JS overrode top/height/bottom unconditionally — including when the
      // keyboard was shut and when the platform had already done the job correctly — and pinned the
      // shell to measured pixels instead of letting it resize. That is the composer landing in an odd
      // place with a gap beneath it.
      //
      // Compensate ONLY when the platform did not: keyboardOffset is the gap between the layout and
      // visual viewports, so it is ~0 exactly when `resizes-content` worked, and the full keyboard
      // height on an engine that ignores it. Native path first, JS as the fallback it was meant to be.
      ...(keyboardOffset > 0
        ? { top: `${viewportTop}px`, bottom: 'auto' as const, height: `${viewportHeight}px` }
        : { top: 0, bottom: 0, height: '100dvh' }),
    }}>
      {/* ── GLOBAL LOADING BAR — thin indeterminate top bar during ANY generation ── */}
      {genBusy && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[999]" aria-hidden style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="relative h-[3px] w-full overflow-hidden bg-app-accent/15">
            <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-app-accent" style={{ animation: 'mya-loadbar 1.1s ease-in-out infinite' }} />
          </div>
          {genService && (
            <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-app-border/15 bg-app-surface/95 px-3 py-1 text-[11px] font-medium text-app-text shadow-lg backdrop-blur-sm">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-app-accent align-middle motion-safe:animate-pulse" />
              {genService === 'video' ? (lang === 'en' ? 'Video' : lang === 'ru' ? 'Видео' : 'ვიდეო')
                : genService === 'image' ? (lang === 'en' ? 'Image' : lang === 'ru' ? 'Фото' : 'სურათი')
                : genService === 'music' ? (lang === 'en' ? 'Music' : lang === 'ru' ? 'Музыка' : 'მუსიკა')
                : genService === 'lipsync' ? (lang === 'en' ? 'Avatar' : lang === 'ru' ? 'Аватар' : 'ავატარი')
                : genService === 'product' ? (lang === 'en' ? 'Product ad' : lang === 'ru' ? 'Реклама' : 'რეკლამა')
                : genService === 'remix' ? (lang === 'en' ? 'Remix' : lang === 'ru' ? 'Ремикс' : 'რემიქსი')
                : (lang === 'en' ? 'Working' : lang === 'ru' ? 'Работаю' : 'მუშავდება')}…
            </div>
          )}
        </div>
      )}
      {/* Mobile backdrop for the slide-over sidebar. */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}

      {/* ── Left navigation — Google AI Studio's grammar on a desktop, Gemini's drawer on a phone (docs/DESIGN.md §8).
          Four parts, top to bottom, and nothing else: the name · what you do next (new session, search, library,
          persona) · what you can make („სერვისები“) and what you made („ბოლო“) · who you are and what you have. ── */}
      <aside
        ref={sidebarDialogRef}
        role={sidebarOpen ? 'dialog' : undefined}
        aria-modal={sidebarOpen ? true : undefined}
        aria-label={t.menu}
        className={`fixed inset-y-0 left-0 z-[70] flex h-full w-[288px] max-w-[84vw] shrink-0 flex-col border-r border-app-border/10 bg-app-surface transition-transform duration-200 ease-out md:static md:z-0 md:max-w-none md:shadow-none ${sidebarOpen ? 'translate-x-0 shadow-[0_0_60px_rgba(0,0,0,0.45)]' : '-translate-x-full md:translate-x-0'} ${sidebarCollapsed ? 'md:hidden' : ''}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* ONE lockup: the transparent rocket + the name (docs/DESIGN.md §13). ⚠️ „ორი ლოგო“ — the OPAQUE rocket tile
            used to sit beside the name (and in the header), reading as a second logo; the cut-out has no box and
            lives inside the wordmark's single role="img". */}
        <div className="flex items-center justify-between py-2.5 pl-4 pr-2">
          {/* Not a link: from the studio a document load to /{lang} (and back) would drop the jobs in flight and the draft. */}
          <span className="flex h-11 min-w-0 items-center"><Wordmark size="sm" mark /></span>
          {/* Collapse (desktop/iPad) + close-drawer (mobile) — one control. */}
          <button type="button" onClick={() => { setSidebarOpen(false); setSidebarCollapsedPersist(true); }}
            aria-label={tCollapse} title={tCollapse}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation"><PanelLeftClose className="h-[18px] w-[18px]" /></button>
        </div>

        <div className="space-y-0.5 px-2">
          {/* CHAT IS THE HUB, so it is the first row (the owner's 2026-10-01 directive) — above „New session“, and
              out of the „სერვისები“ list below so it is never named twice. */}
          <button type="button" onClick={() => selectTool('chat')} aria-current={onStudioHome && activeTool === 'chat' ? 'true' : undefined}
            data-testid="sidebar-chat"
            className={`${sideRow} font-medium ${onStudioHome && activeTool === 'chat' ? 'bg-app-elevated' : ''}`}>
            <ChatIcon className={`h-[17px] w-[17px] ${onStudioHome && activeTool === 'chat' ? 'text-app-accent' : 'text-app-text'}`} aria-hidden="true" />
            {TOOL_META.chat.name[lang]}
          </button>
          <button type="button" onClick={handleNewChat} className={sideRow}>
            <PenSquare className="h-[17px] w-[17px] text-app-muted" aria-hidden="true" /> {tNewSession}
          </button>
          <button type="button" onClick={() => { if (searchOpen) setConvQuery(''); setSearchOpen((v) => !v); }} aria-expanded={searchOpen} className={sideRow}>
            <Search className="h-[17px] w-[17px] text-app-muted" aria-hidden="true" /> {tSearchRow}
          </button>
          <button type="button" onClick={() => { setSidebarOpen(false); router.push(`/${locale}/library`); }} className={sideRow}>
            <FolderOpen className="h-[17px] w-[17px] text-app-muted" aria-hidden="true" /> {tLibrary}
          </button>
          <ResearchSidebarRow locale={lang} authed={authed} className={sideRow} onPicked={() => setSidebarOpen(false)} />
          <HubSidebarRow locale={lang} className={sideRow} onPicked={() => setSidebarOpen(false)} />
          <button type="button" onClick={() => { setSidebarOpen(false); setPersonaOpen(true); }} className={sideRow}>
            <Sparkles className="h-[17px] w-[17px] text-app-muted" aria-hidden="true" /> {t.persona}
            {activePersonaName
              // Named, truncated, and still marked — the dot alone was the whole problem.
              ? <span className="ml-auto min-w-0 truncate text-[12px] text-app-accent" title={activePersonaName}>{activePersonaName}</span>
              : activePersonaId && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-app-accent" aria-hidden />}
          </button>
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* „სერვისები“ — every tool the studio has, from ONE list (lib/studio/tools.ts). In the studio a row
              switches the tool in place; anywhere else it opens the studio on it. The composer's „+“ sheet
              reads the same list, so a service can never be reachable from one door and missing from the other. */}
          <p className={sideHdr}>{t.services}</p>
          <div className="space-y-0.5">
            {navPrimary.filter((id) => id !== 'chat').map((id) => {
              const { Icon } = TOOL_META[id];
              const on = onStudioHome && activeTool === id;
              return (
                // data-tour: an anchor the first-run tour can point at (lib/onboarding/tour.ts — step 2 uses tool-avatar).
                <button key={id} type="button" onClick={() => selectTool(id)} aria-current={on ? 'true' : undefined} data-tour={`tool-${id}`}
                  className={`${sideRow} ${on ? 'bg-app-elevated' : ''}`}>
                  <Icon className={`h-[17px] w-[17px] ${on ? 'text-app-accent' : 'text-app-muted'}`} aria-hidden="true" />
                  <span className="min-w-0 truncate">{TOOL_META[id].name[lang]}</span>
                </button>
              );
            })}
            {/* „მეტი“ only while there is something under it — every one of them may be switched off in Plugins. */}
            {navMore.length > 0 && (
            <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} className={`${sideRow} text-app-muted`}>
              <ChevronRight className={`h-[17px] w-[17px] transition-transform ${moreOpen ? 'rotate-90' : ''}`} aria-hidden="true" /> {tMore}
            </button>
            )}
            {moreOpen && navMore.map((id) => {
              const { Icon } = TOOL_META[id];
              const on = onStudioHome && activeTool === id;
              return (
                <button key={id} type="button" onClick={() => selectTool(id)} aria-current={on ? 'true' : undefined}
                  className={`${sideRow} pl-5 ${on ? 'bg-app-elevated' : ''}`}>
                  <Icon className={`h-4 w-4 ${on ? 'text-app-accent' : 'text-app-muted'}`} aria-hidden="true" />
                  <span className="min-w-0 truncate">{TOOL_META[id].name[lang]}</span>
                </button>
              );
            })}
          </div>

          {/* „ბოლო“ — the chat history. */}
          <div className="mt-3 flex items-center justify-between gap-1.5 pr-1">
            <p className={sideHdr}>{tRecent}</p>
            {conversations.length > 0 && (
              <button type="button" onClick={handleClearAll} title={tClearAll}
                className="tap-44 relative flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium text-app-muted/80 transition-colors hover:bg-red-500/10 hover:text-red-400 touch-manipulation">
                <Trash2 className="h-3 w-3" aria-hidden="true" /> {tClearAll}
              </button>
            )}
          </div>
          {(searchOpen || conversations.length > 5) && (
            <input
              ref={searchRef}
              type="search"
              value={convQuery}
              onChange={(e) => setConvQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setConvQuery(''); setSearchOpen(false); } }}
              placeholder={tSearch}
              aria-label={tSearch}
              className="mb-2 w-full rounded-lg bg-app-elevated px-2.5 py-2 !text-[13px] !text-app-text placeholder:text-app-muted/70 focus:outline-none focus:ring-1 focus:ring-app-accent"
            />
          )}
          {authed && onStudioHome && !historySynced && conversations.length === 0 ? (
            <SkeletonList count={3} locale={lang} rowClassName="h-11 w-full rounded-lg [@media(pointer:fine)]:h-[38px]" className="space-y-0.5 pb-2" testId="history-skeleton" />
          ) : conversations.length === 0 ? (
            <EmptyState compact icon={ChatIcon} line={tNoHistory} actionLabel={tStartChat} onAction={startChat} testId="history-empty" />
          ) : convMatches.length === 0 ? (
            <p className="px-2.5 py-1 text-[12px] text-app-muted">{tNoMatch}</p>
          ) : (
            <div className="space-y-2 pb-2">
              {convGroups.map((g) => (
                <div key={g.key} className="space-y-0.5">
                  <p className="px-2.5 pb-0.5 pt-1 text-[11px] font-medium text-app-muted/70">{g.label}</p>
                  {g.items.map((c) => (
                    <div key={c.id} className="group relative">
                      {/* pr-9 leaves room for the delete control so the title never sits under it. */}
                      <button type="button" onClick={() => handleSelectConversation(c.id)} title={c.title} className="flex min-h-[44px] [@media(pointer:fine)]:min-h-[38px] w-full items-center truncate rounded-lg pl-2.5 pr-9 text-left text-[13.5px] text-app-text/90 transition-colors hover:bg-app-elevated">
                        {c.title}
                      </button>
                      {/* Delete: always tappable on mobile; hover-reveal on desktop (md). */}
                      <button type="button" onClick={(e) => handleDeleteConversation(c.id, e)} aria-label={tDelete} title={tDelete}
                        className="tap-44 absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-app-muted/70 opacity-100 transition-colors hover:bg-red-500/15 hover:text-red-400 touch-manipulation md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Who you are and what you have — the balance, language and account live HERE now, not in a header row
            that had five controls fighting the wordmark for 390 px. */}
        <div className="space-y-1 border-t border-app-border/10 px-2 pt-2" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
          {studioV2 && (
            <button type="button" onClick={() => { setSidebarOpen(false); router.push(`/${locale}/studio`); }} className={sideRow}>
              <Clapperboard className="h-[17px] w-[17px] text-app-muted" aria-hidden="true" /> {tStudio}
              <span className="ml-auto rounded-full bg-app-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-app-accent">{tBeta}</span>
            </button>
          )}
          {authed ? (
            // The balance and the way to raise it are one control — the SAME CreditsModal from everywhere.
            <button type="button" onClick={() => { setSidebarOpen(false); setCreditsOpen(true); }} data-iap-external
              aria-label={`${t.topUp} · ${formatCreditBalance(balanceGel, locale)}`}
              className="flex min-h-[48px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left transition-colors hover:bg-app-elevated touch-manipulation">
              <Wallet className="h-[17px] w-[17px] shrink-0 text-app-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1" aria-hidden="true">
                <span className="block text-[11px] leading-tight text-app-muted">{tBalance}</span>
                <span className="block truncate text-[13.5px] font-semibold tabular-nums text-app-text">{formatCreditBalance(balanceGel, locale)}</span>
              </span>
              <span className="shrink-0 rounded-full bg-app-accent/10 px-2.5 py-1 text-[11.5px] font-semibold text-app-accent" aria-hidden="true">{t.topUp}</span>
            </button>
          ) : (
            <button type="button" onClick={() => { setSidebarOpen(false); setAuthMode('login'); setAuthOpen(true); }}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-app-accent text-[13.5px] font-semibold text-app-bg transition-opacity hover:opacity-90 touch-manipulation">
              <LogIn className="h-4 w-4" aria-hidden="true" /> {t.login}
            </button>
          )}
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => { setMenuOpen(true); setSidebarOpen(false); }} aria-label={t.settings} title={authed ? (userEmail ?? t.settings) : t.settings}
              className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 text-left transition-colors hover:bg-app-elevated touch-manipulation">
              {authed ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-app-accent/15 text-[12px] font-bold uppercase text-app-accent" aria-hidden="true">
                  {avatarUrl && !avatarBroken ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setAvatarBroken(true)} className="h-full w-full object-cover" />
                  ) : (userName?.[0] || userEmail?.[0] || 'U')}
                </span>
              ) : (
                <Settings className="h-[17px] w-[17px] shrink-0 text-app-muted" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate text-[13px] text-app-text" aria-hidden="true">{authed ? (userName || userEmail) : t.settings}</span>
              {authed && <Settings className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />}
            </button>
            <InstallAppButton locale={lang} iconOnly />
            <LanguageSwitcher locale={locale} up />
          </div>
          {/* The legal documents, on screen from the first visit: a guest can chat before signing anything, so the terms
              that chat runs under are one tap away. A new tab — the studio keeps its jobs and its draft. */}
          <nav aria-label={t.legal} data-testid="sidebar-legal" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 pb-0.5">
            {LEGAL_LINKS.map((doc) => (
              <a key={doc.id} href={legalHref(lang, doc.id)} target="_blank" rel="noopener noreferrer"
                className="tap-44 relative text-[11.5px] leading-4 text-app-muted underline-offset-2 transition-colors hover:text-app-text hover:underline">
                {doc.short[lang]}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Collapsed on a desktop/iPad: a rail of icons, never nothing — the way back is always on screen. */}
      {sidebarCollapsed && (
        // Gemini's collapsed rail is the page itself — no panel colour, no rule — so the session gets the whole width.
        <nav aria-label={t.menu} className="hidden w-[60px] shrink-0 flex-col items-center gap-1 bg-app-bg py-2.5 md:flex"
          style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top, 0px))' }}>
          <button type="button" onClick={() => setSidebarCollapsedPersist(false)} aria-label={tExpand} title={tExpand} className={railBtn}><PanelLeft className="h-[18px] w-[18px]" aria-hidden="true" /></button>
          <button type="button" onClick={handleNewChat} aria-label={tNewSession} title={tNewSession} className={railBtn}><PenSquare className="h-[18px] w-[18px]" aria-hidden="true" /></button>
          <span className="my-1 h-px w-6 bg-app-border/15" aria-hidden="true" />
          {navPrimary.map((id) => {
            const { Icon } = TOOL_META[id];
            const on = onStudioHome && activeTool === id;
            const name = TOOL_META[id].name[lang];
            return (
              <button key={id} type="button" onClick={() => selectTool(id)} aria-label={name} title={name} aria-current={on ? 'true' : undefined} data-tour={`tool-${id}`}
                className={`${railBtn} ${on ? 'bg-app-elevated !text-app-accent' : ''}`}><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></button>
            );
          })}
          <span className="flex-1" aria-hidden="true" />
          <button type="button" onClick={() => router.push(`/${locale}/library`)} aria-label={tLibrary} title={tLibrary} className={railBtn}><FolderOpen className="h-[18px] w-[18px]" aria-hidden="true" /></button>
          <HubRailButton locale={lang} className={railBtn} />
          <button type="button" onClick={() => setMenuOpen(true)} aria-label={t.settings} title={t.settings} className={railBtn}><Settings className="h-[18px] w-[18px]" aria-hidden="true" /></button>
        </nav>
      )}

      <PersonaPicker
        locale={locale}
        open={personaOpen}
        onClose={() => setPersonaOpen(false)}
        onSelect={(p) => { setActivePersonaId(p?.id ?? ''); announcePersona(p?.id ?? ''); }}
      />

      {/* ── Main column (header + chat) ──────────────────────────────────────── */}
      {/* data-skip-target: AppShell's "Skip to main content" lands HERE, past the sidebar (a <div>: AppShell's <main>
          already wraps the shell, and a main inside a main is an a11y error). */}
      <div id="studio-main" data-skip-target="" className="flex min-w-0 flex-1 flex-col focus:outline-none">
        {/* The header is a phone's (and a tablet's): [☰] name … [new session] [you] — Gemini's row, nothing else.
            On a desktop the studio draws its own title bar inside the centre column (AI Studio), so this one steps
            aside there; secondary surfaces (/library) keep it for their back control. */}
        {/* data-chrome-header: a full-screen workspace (Montage) hides this bar with <html data-immersive> — see globals.css. */}
        <header data-chrome-header className={`sticky top-0 z-30 shrink-0 bg-app-bg/85 backdrop-blur-xl ${onStudioHome && activeTool !== 'montage' ? 'lg:hidden' : ''}`} style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
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
              <button type="button" onClick={() => setSidebarOpen(true)} aria-label={t.menu} className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation md:hidden">
                <Menu className="h-[18px] w-[18px]" />
              </button>
              {/* IN THE CHAT the name IS the model switcher — Gemini mobile's "Gemini · 3.8 Flash ⌄": the wordmark and
                  the mode in the accent. Shown at every width this header lives at (it is the tablet's only way to the
                  model); the wordmark inside steps aside where the sidebar already carries it, and on narrow phones —
                  below 360 px, or below 420 px for a guest, whose „შესვლა“ pill is wider than the account circle — so
                  the mode itself is never cut. */}
              {chatHeader ? (
                <ModelSwitcher variant="phone" locale={lang}
                  brandClassName={`${authed ? 'max-[359px]:hidden' : 'max-[419px]:hidden'} ${sidebarCollapsed ? '' : 'md:hidden'}`} />
              ) : (
              <span className={`min-w-0 text-[16px] font-semibold tracking-tight text-app-text ${title ? 'shrink-0' : ''} ${showBack ? 'hidden' : sidebarCollapsed && !title ? '' : 'md:hidden'}`}>
                {title ?? (
                  // All-or-nothing (brief §8, "MyAvata"): a 44 px-tall wrapping row, so when the name does not fit
                  // WHOLE it wraps to the clipped second line — shown entire or not at all, never cut.
                  <span className="flex h-11 min-w-0 flex-wrap items-center overflow-hidden">
                    <span className="flex h-11 items-center"><Wordmark size="sm" mark /></span>
                  </span>
                )}
              </span>
              )}
              {title && <span className="hidden truncate text-[16px] font-semibold tracking-tight text-app-text md:inline">{title}</span>}
            </div>

            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              {onStudioHome && (
                <button type="button" onClick={handleNewChat} aria-label={tNewSession} title={tNewSession}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation">
                  <PenSquare className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              )}
              {/* A "Sign in" button for guests, or the account (→ settings) once signed in. */}
              {authed ? (
                <button type="button" onClick={() => setMenuOpen(true)} aria-label={t.account} title={userEmail ?? t.account}
                  className="flex h-11 w-11 items-center justify-center rounded-full touch-manipulation">
                  <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-app-accent/15 text-[13px] font-bold uppercase text-app-accent transition-colors hover:bg-app-accent/25">
                    {avatarUrl && !avatarBroken ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setAvatarBroken(true)} className="h-full w-full object-cover" />
                    ) : (userName?.[0] || userEmail?.[0] || 'U')}
                  </span>
                </button>
              ) : (
                <button type="button" onClick={() => { setAuthMode('login'); setAuthOpen(true); }} aria-label={t.login}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-app-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-app-bg transition-opacity hover:opacity-90 touch-manipulation sm:min-h-0">
                  <LogIn className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" /> {t.login}
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
              <button type="button" onClick={() => setMenuOpen(false)} aria-label={lang === 'en' ? 'Close' : lang === 'ru' ? 'Закрыть' : 'დახურვა'} className="flex h-11 w-11 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation"><X className="h-[18px] w-[18px]" /></button>
            </div>

            {/* Scrollable body — thin themed scrollbar */}
            <div className="flex-1 overflow-y-auto px-3 py-2 [scrollbar-color:rgb(var(--app-border)/0.3)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-app-border/20 [&::-webkit-scrollbar]:w-1.5" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>

              {/* SECTION 1 — ACCOUNT */}
              <p className={sectionHdr}>{t.account}</p>
              {authed ? (
                <>
                  <div className="mb-1 flex items-center gap-3 px-2 py-1.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-app-accent/15 text-[16px] font-bold uppercase text-app-accent">
                      {avatarUrl && !avatarBroken ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setAvatarBroken(true)} className="h-full w-full object-cover" />
                      ) : (userName?.[0] || userEmail?.[0] || 'U')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-app-text">{userName || userEmail}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setDisplayName(userName ?? ''); setMenuOpen(false); setProfileOpen(true); }} className={drawerRow}><User className="h-[18px] w-[18px] text-app-muted" /> {locale === 'en' ? 'Edit profile' : locale === 'ru' ? 'Профиль' : 'პროფილი'}</button>
                  <button type="button" onClick={() => { setMenuOpen(false); setAvatarEnrollOpen(true); }} className={drawerRow} data-tour={TWIN_ENABLED ? 'twin' : undefined}><ScanFace className="h-[18px] w-[18px] text-app-accent" /> {TWIN_ENABLED ? twinCopy(locale).menuEntry : locale === 'en' ? 'Create Live Avatar' : locale === 'ru' ? 'Создать живой аватар' : 'ცოცხალი ავატარის შექმნა'}</button>
                  <button type="button" onClick={async () => { try { await signOutAndClear(createBrowserClient()); } catch { /* listener clears state */ } setMenuOpen(false); }} className={`${drawerRow} hover:bg-app-danger/10 hover:text-app-danger`}><LogOut className="h-[18px] w-[18px] text-app-muted" /> {t.signOut}</button>
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
              {/* SECTION 3 — ABOUT (the legal documents · the support page: FAQ, the support chat, the email).
                  ⚠️ The documents themselves, in the visitor's language, in a new tab (the studio keeps its jobs and
                  draft) — these rows used to open LegalModal, a four-line English placeholder dated June 2024. */}
              <p className={sectionHdr}>{locale === 'en' ? 'About' : locale === 'ru' ? 'О приложении' : 'შესახებ'}</p>
              <p className="px-2 pb-1 pt-0.5 text-[12px] text-app-muted">MyAvatar v{process.env.NEXT_PUBLIC_APP_VERSION || '2.0.0'}</p>
              <a href={legalHref(lang, 'privacy')} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)} className={drawerRow}><Shield className="h-[18px] w-[18px] text-app-muted" /> {t.privacy}</a>
              <a href={legalHref(lang, 'terms')} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)} className={drawerRow}><FileText className="h-[18px] w-[18px] text-app-muted" /> {t.terms}</a>
              <a href={legalHref(lang, 'refund')} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)} className={drawerRow}><Wallet className="h-[18px] w-[18px] text-app-muted" /> {legalDoc('refund').title[lang]}</a>
              <a href={`/${lang}/support`} onClick={() => setMenuOpen(false)} className={drawerRow}><LifeBuoy className="h-[18px] w-[18px] text-app-muted" /> {t.support}</a>
              {authed && (
                <a href={`/${lang}/account/delete`} onClick={() => setMenuOpen(false)} className={`${drawerRow} text-app-danger hover:bg-app-danger/10`}><Trash2 className="h-[18px] w-[18px]" /> {t.deleteAccount}</a>
              )}
              {/* Derived, not written down — a hardcoded year goes stale every January and reads as an
                  abandoned product to someone deciding whether to trust it with a payment. */}
              <p className="px-2 pt-3 text-center text-[11px] text-app-muted">© {new Date().getFullYear()} MyAvatar</p>
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
      <AuthModal open={authOpen} locale={lang} initialMode={authMode} initialError={authError} returnTo={authReturnTo}
        onClose={() => { setAuthOpen(false); setAuthError(null); setAuthReturnTo(null); }}
        onAuthed={() => {
          setAuthOpen(false); setAuthError(null);
          // Signed in from a deep link that named a destination (e.g. /memory sent them here): go there.
          if (authReturnTo) { const to = authReturnTo; setAuthReturnTo(null); window.location.assign(to); return; }
          void refreshBalance();
        }} />

      {/* PHASE 3 Task 2 — first-login welcome (signed-in users who haven't seen it). */}
      {authed && !welcomed && (
        <WelcomeOnboarding locale={locale} balanceGel={balanceGel} onComplete={() => setWelcomed(true)} />
      )}
      {/* Library-only sheet — the legal documents open as pages (lib/legal/links.ts). */}
      <StudioSheet open={sheet === 'library'} title={t.library} onClose={() => setSheet(null)}>
        {sheet === 'library' ? <StudioLibraryGrid locale={lang} onClose={() => setSheet(null)} /> : null}
      </StudioSheet>

      {/* Deep Research: the watcher, toasts, start sheet, report viewer, Connectors and the report's Live call
          (components/studio/research). Renders nothing until the server says the feature exists here. */}
      <ResearchHost locale={lang} authed={authed} userId={userId} />

      {/* Connectors · Plugins · Skills (components/studio/hub): the user's switched-off tools (read on sign-in, so the menus
          above hide them) and the hub sheet, opened from the sidebar row, the rail or `myavatar:hub-open`. */}
      <HubHost locale={lang} authed={authed} userId={userId} />

      {/* DAY-5 real-time voice overlay. The launcher moved INTO the composer (OmniStudio's
          Gemini-style live-voice chip, right of the dictation mic), which dispatches
          'myavatar:voice-open' — handled by the effect above (authed → open; guest → sign-in).
          This de-clutters the workspace (no redundant floating FAB) while keeping one clear CTA. */}
      {/* Voice cascade: real-time lip-synced LiveAvatar (premium) → Gemini audio-reactive selfie → ElevenLabs.
          Each tier hands down via onUnavailable, so voice mode always resolves to a working experience and
          auto-upgrades to the real avatar the moment LiveAvatar is funded. */}
      {voiceOpen && !awaitingLiveUid && (
        LIVEAVATAR_ENABLED && liveUid && !liveAvatarUnavailable && Date.now() >= liveAvatarCooldownUntil
          ? <LiveAvatarRealtime locale={lang} onClose={() => setVoiceOpen(false)} onUnavailable={() => { liveAvatarCooldownUntil = Date.now() + LIVEAVATAR_COOLDOWN_MS; setLiveAvatarUnavailable(true); }} />
          : GEMINI_LIVE_ENABLED && liveUid && !liveUnavailable
            ? <GeminiLiveConversation userId={liveUid} locale={lang} onClose={() => setVoiceOpen(false)} onUnavailable={() => setLiveUnavailable(true)}
                // The persona the chat is using speaks on the call too (read at open time; localStorage is not reactive).
                personaId={loadSelectedPersonaId() || undefined}
                customPersona={loadCustomPersonas().find((p: Persona) => p.id === loadSelectedPersonaId())} />
            : <VoiceConversation locale={lang} onClose={() => setVoiceOpen(false)} />
      )}

      {/* Live Avatar enrollment — selfie + optional voice → the user's core avatar for voice mode. With the twin flag on,
          the same entry (and the myavatar:avatar-enroll event) opens the Digital Twin capture instead. */}
      {avatarEnrollOpen && (TWIN_ENABLED
        ? <TwinCapture locale={lang} onClose={() => setAvatarEnrollOpen(false)} />
        : <LiveAvatarEnroll locale={lang} onClose={() => setAvatarEnrollOpen(false)} />)}

      {/* Avatar-upload feedback toast — transient, self-contained (no global toast system here). */}
      {avatarError && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[1000] flex justify-center px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
          <div role="status" className="pointer-events-auto flex items-center gap-2 rounded-full border border-rose-400/30 bg-app-surface/95 px-4 py-2 text-[12.5px] font-medium text-rose-300 shadow-lg backdrop-blur">
            {avatarError}
          </div>
        </div>
      )}

      {/* Checkout-return feedback toast (Iteration 4) — success / declined / cancelled. Dismissible on tap;
          the workflow behind it is never blocked, so a declined bank txn recovers cleanly. */}
      {payNotice && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[1000] flex justify-center px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
          <button
            type="button"
            onClick={() => setPayNotice(null)}
            role="status"
            className={`pointer-events-auto flex items-center gap-2 rounded-full border bg-app-surface/95 px-4 py-2 text-[12.5px] font-medium shadow-lg backdrop-blur transition active:scale-95 ${payNotice.ok ? 'border-emerald-400/30 text-emerald-300' : 'border-amber-400/30 text-amber-300'}`}
          >
            {payNotice.text}
          </button>
        </div>
      )}
    </div>
    </>
  );
}

export default ChatChrome;
