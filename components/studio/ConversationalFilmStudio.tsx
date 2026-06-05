'use client';

/**
 * ConversationalFilmStudio
 * ========================
 * A chat-first, full-height "app shell" rendering of the 30-Second Cinematic
 * Film Studio, used as the `/dashboard` home surface. Every pipeline stage
 * (identity ingestion, director prompt, cost ledger, live processing, and the
 * final master) happens inside ONE conversational message feed, optimised for
 * App Store / Android WebView (true `100dvh`, safe-area insets, fixed bottom
 * composer).
 *
 * This is NOT a mock. The bottom composer drives the REAL pipeline via
 * `driveFilmStudio()` → /api/chat/orchestrate (+poll) → /api/video/assemble,
 * the same client the card studio uses. It mounts the real hosted `masterUrl`
 * (or the first rendered scene as an honest fallback) — never a fabricated URL.
 * Reference photos stay OPTIONAL (the pipeline does not require them), and the
 * ledger shows the real GEL estimate metered server-side, not a fake promo.
 *
 * The contained card variant (`CinematicFilmStudio`) is preserved unchanged for
 * the `/studio` preview and `/studio/film` surfaces.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ImagePlus,
  Send,
  Mic,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  X,
  ArrowRight,
  LogIn,
  Menu,
  Plus,
  Clapperboard,
  Play,
  Download,
  UserPlus,
  History,
  LogOut,
  Shield,
  FileText,
  LifeBuoy,
  Share2,
  Check,
  RefreshCw,
  Music2,
} from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser';
import { DeleteAccountButton } from '@/components/account/DeleteAccountButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WalletRefillModal } from '@/components/chat/WalletRefill';
import { analytics } from '@/components/analytics/PostHogProvider';
import { reportError } from '@/lib/observability/report-error';
import { formatGEL } from '@/lib/billing/gel';
import { FILM_SCENE_COUNT } from '@/lib/chat/filmPipeline';
import {
  driveFilmStudio,
  estimateFilmCostGel,
  type FilmStudioProgress,
  type FilmQaSummary,
} from '@/lib/chat/filmStudioClient';
import { composeMusicVideoPrompt, MV_GENRES, MV_SHOTS, MV_CAMERA_MOVES, MV_LIGHTING } from '@/lib/chat/musicVideoPresets';
import { summarizeFilmPipeline, type StageState } from '@/lib/chat/filmStudioStages';
import { filmStarterPrompts } from '@/lib/chat/filmStarterPrompts';

interface Slot {
  dataUrl: string;
  name: string;
}

interface ChatMsg {
  id: number;
  role: 'system' | 'user';
  text: string;
}

interface ConversationalFilmStudioProps {
  locale?: string;
  isAuthenticated?: boolean;
}

type Lang = 'ka' | 'en' | 'ru';

// ─── Localised copy ───────────────────────────────────────────────────────────

const COPY: Record<
  Lang,
  {
    brandSub: string;
    welcome: string;
    identityNudge: string;
    producing: string;
    ready: string;
    failed: string;
    placeholder: string;
    placeholderBusy: string;
    sendAria: string;
    login: string;
    theme: string;
    identityLabel: string;
    identityHint: string;
    roles: [string, string, string];
    scenes: string;
    runtime: string;
    cost: string;
    estNote: string;
    pipelineRunning: string;
    pipelineDone: string;
    pipelineFailed: string;
    masterReady: string;
    openMaster: string;
    firstScene: string;
    signinNote: string;
    cancel: string;
    freeFilmBadge: string;
    freeFilmNote: string;
    promoLimit: string;
    tariffLabel: string;
    generate: string;
    setupTitle: string;
    menu: string;
    settings: string;
    topUp: string;
    account: string;
    accountGuest: string;
    providerLabel: string;
    providerOnline: string;
    providerOffline: string;
    micStart: string;
    micStop: string;
    micDenied: string;
    voiceUnsupported: string;
    starterHint: string;
    statReady: string;
    statRendering: string;
    statFailed: string;
    statQueued: string;
    scenePreviewHint: string;
    library: string;
    signup: string;
    signOut: string;
    privacy: string;
    terms: string;
    support: string;
    legalLabel: string;
    share: string;
    copied: string;
    newFilm: string;
    tryAgain: string;
    writingStoryboard: string;
  }
> = {
  ka: {
    brandSub: 'კინემატოგრაფიული ჰაბი',
    welcome:
      'გამარჯობა! ეს არის 30-წამიანი კინემატოგრაფიული სტუდია. სურვილისამებრ ატვირთე 1–3 რეფერენს ფოტო პერსონაჟის შესანარჩუნებლად, შემდეგ ქვემოთ ჩაწერე რეჟისორული სცენარი — და მე ავაწყობ რეალურ ფილმს.',
    identityNudge: 'რეფერენსი მიღებულია. ახლა ჩაწერე სცენარი ქვედა ველში და გავუშვათ წარმოება.',
    producing: 'მივიღე. ვიწყებ რეალურ წარმოებას…',
    ready: 'შენი 30-წამიანი ფილმი მზად არის — იხილე ქვემოთ.',
    failed: 'წარმოება ვერ დასრულდა.',
    placeholder: 'ჩაწერე რეჟისორული სცენარი…',
    placeholderBusy: 'მიმდინარეობს წარმოება…',
    sendAria: 'გაშვება',
    login: 'შესვლა',
    theme: 'თემის გადართვა',
    identityLabel: 'ეტაპი 01 · პერსონის იდენტობა',
    identityHint: '1–3 ფოტო (არასავალდებულო)',
    roles: ['წინა ხედი', 'პროფილი', 'განათება'],
    scenes: 'სცენა',
    runtime: 'ხანგრძლივობა',
    cost: 'სავარაუდო',
    estNote: 'შეფასება ცოცხალი ფასების მატრიცით. ზუსტი თანხა იზომება სერვერზე გაშვებისას.',
    pipelineRunning: 'წარმოება მიმდინარეობს',
    pipelineDone: 'წარმოება დასრულდა',
    pipelineFailed: 'წარმოება შეჩერდა',
    masterReady: 'მასტერი მზად არის · 30-წამიანი ფილმი',
    openMaster: 'გახსენი / ჩამოტვირთე მასტერი',
    firstScene: 'მონტაჟი მთავრდება — ნაჩვენებია პირველი დარენდერებული სცენა.',
    signinNote: 'რეალური რენდერი · საჭიროა ავტორიზაცია · კრედიტი ჩამოიჭრება დასრულებისას',
    cancel: 'გაუქმება',
    freeFilmBadge: '1 უფასო Founder ვიდეო დარჩა',
    freeFilmNote: 'პირველი 30-წამიანი ფილმი სრულიად უფასოა — ღირებულებას ფარავს Founder-ბონუსი. შემდეგი ვიდეოები დაიანგარიშება ჩვეულებრივი ფასით.',
    promoLimit: 'პრომო ლიმიტი · 1 უფასო ფილმი',
    tariffLabel: 'ტარიფი',
    generate: 'ვიდეოს გენერაცია',
    setupTitle: 'მომზადება',
    menu: 'მენიუ',
    settings: 'პარამეტრები',
    topUp: 'შევსება',
    account: 'მომხმარებელი',
    accountGuest: 'სტუმარი',
    providerLabel: 'ვიდეო პროვაიდერი',
    providerOnline: 'აქტიური',
    providerOffline: 'არ არის კონფიგურირებული',
    micStart: 'ხმოვანი შეყვანა',
    micStop: 'ჩაწერის შეჩერება',
    micDenied: 'მიკროფონზე წვდომა შეზღუდულია. გთხოვთ, ჩართოთ პარამეტრებიდან.',
    voiceUnsupported: 'ხმოვანი შეყვანა ამ ბრაუზერში არ არის მხარდაჭერილი.',
    starterHint: 'დასაწყისად სცადე ნიმუში',
    statReady: 'მზად',
    statRendering: 'მუშავდება',
    statFailed: 'ჩაიშალა',
    statQueued: 'რიგში',
    scenePreviewHint: 'დააჭირე დასრულებულ სცენას სანახავად',
    library: 'ბიბლიოთეკა · ისტორია',
    signup: 'რეგისტრაცია',
    signOut: 'გასვლა',
    privacy: 'კონფიდენციალურობა',
    terms: 'წესები და პირობები',
    support: 'დახმარება',
    legalLabel: 'სამართლებრივი',
    share: 'გაზიარება',
    copied: 'ბმული დაკოპირდა',
    newFilm: 'ახალი ფილმი',
    tryAgain: 'ხელახლა ცდა',
    writingStoryboard: 'სცენარი იწერება — 5 სცენის რეჟისურა…',
  },
  en: {
    brandSub: 'Cinematic Hub',
    welcome:
      'Welcome to the 30-Second Cinematic Studio. Optionally add 1–3 reference photos to lock the character, then type your director script below — and I’ll produce a real film.',
    identityNudge: 'Reference received. Now type your script below and we’ll start production.',
    producing: 'Got it. Starting the real production…',
    ready: 'Your 30-second film is ready — see below.',
    failed: 'Production could not complete.',
    placeholder: 'Type your director script…',
    placeholderBusy: 'Production in progress…',
    sendAria: 'Run',
    login: 'Sign in',
    theme: 'Toggle theme',
    identityLabel: 'Stage 01 · Identity Ingestion',
    identityHint: '1–3 photos (optional)',
    roles: ['Face ID — front', 'Profile — side', 'Lighting ref'],
    scenes: 'Scenes',
    runtime: 'Runtime',
    cost: 'Est. cost',
    estNote: 'Estimate from the live cost matrix. The exact charge is metered server-side when the render runs.',
    pipelineRunning: 'Pipeline executing',
    pipelineDone: 'Pipeline complete',
    pipelineFailed: 'Production halted',
    masterReady: 'Master ready · 30-second film',
    openMaster: 'Open / download master',
    firstScene: 'Editor still finishing — showing the first rendered scene.',
    signinNote: 'Real render · requires sign-in · credits charged on completion',
    cancel: 'Cancel',
    freeFilmBadge: '1 Free Founder Video Remaining',
    freeFilmNote: 'Your first 30-second film is completely free — the founder bonus covers its cost. Subsequent videos are metered at the normal rate.',
    promoLimit: 'Promo · 1 free film remaining',
    tariffLabel: 'Rate',
    generate: 'Generate video',
    setupTitle: 'Setup',
    menu: 'Menu',
    settings: 'Settings',
    topUp: 'Top up',
    account: 'User',
    accountGuest: 'Guest',
    providerLabel: 'Video provider',
    providerOnline: 'Connected',
    providerOffline: 'Unconfigured',
    micStart: 'Voice input',
    micStop: 'Stop recording',
    micDenied: 'Microphone access is restricted. Please enable it in settings.',
    voiceUnsupported: "Voice input isn't supported in this browser.",
    starterHint: 'Try a starter script',
    statReady: 'ready',
    statRendering: 'rendering',
    statFailed: 'failed',
    statQueued: 'queued',
    scenePreviewHint: 'Tap a finished scene to preview it',
    library: 'Library · History',
    signup: 'Sign up',
    signOut: 'Sign out',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    support: 'Support',
    legalLabel: 'Legal',
    share: 'Share',
    copied: 'Link copied',
    newFilm: 'New film',
    tryAgain: 'Try again',
    writingStoryboard: 'Writing the script — directing 5 scenes…',
  },
  ru: {
    brandSub: 'Кинематографический хаб',
    welcome:
      'Добро пожаловать в 30-секундную кинематографическую студию. По желанию добавьте 1–3 референс-фото, чтобы зафиксировать персонажа, затем введите режиссёрский сценарий ниже — и я создам реальный фильм.',
    identityNudge: 'Референс получен. Теперь введите сценарий ниже, и мы начнём производство.',
    producing: 'Принято. Запускаю реальное производство…',
    ready: 'Ваш 30-секундный фильм готов — смотрите ниже.',
    failed: 'Производство не удалось завершить.',
    placeholder: 'Введите режиссёрский сценарий…',
    placeholderBusy: 'Идёт производство…',
    sendAria: 'Запустить',
    login: 'Войти',
    theme: 'Сменить тему',
    identityLabel: 'Этап 01 · Идентичность персонажа',
    identityHint: '1–3 фото (необязательно)',
    roles: ['Анфас', 'Профиль', 'Свет'],
    scenes: 'Сцены',
    runtime: 'Длительность',
    cost: 'Оценка',
    estNote: 'Оценка по живой матрице цен. Точная сумма считается на сервере при запуске рендера.',
    pipelineRunning: 'Конвейер выполняется',
    pipelineDone: 'Конвейер завершён',
    pipelineFailed: 'Производство остановлено',
    masterReady: 'Мастер готов · 30-секундный фильм',
    openMaster: 'Открыть / скачать мастер',
    firstScene: 'Монтаж ещё идёт — показана первая отрендеренная сцена.',
    signinNote: 'Реальный рендер · нужен вход · кредиты списываются по завершении',
    cancel: 'Отмена',
    freeFilmBadge: 'Осталось 1 бесплатное Founder-видео',
    freeFilmNote: 'Ваш первый 30-секундный фильм совершенно бесплатен — стоимость покрывает Founder-бонус. Последующие видео считаются по обычному тарифу.',
    promoLimit: 'Промо · 1 бесплатный фильм',
    tariffLabel: 'Тариф',
    generate: 'Сгенерировать',
    setupTitle: 'Настройка',
    menu: 'Меню',
    settings: 'Настройки',
    topUp: 'Пополнить',
    account: 'Пользователь',
    accountGuest: 'Гость',
    providerLabel: 'Видео-провайдер',
    providerOnline: 'Активен',
    providerOffline: 'Не настроен',
    micStart: 'Голосовой ввод',
    micStop: 'Остановить запись',
    micDenied: 'Доступ к микрофону ограничен. Пожалуйста, включите его в настройках.',
    voiceUnsupported: 'Голосовой ввод не поддерживается в этом браузере.',
    starterHint: 'Попробуйте сценарий для начала',
    statReady: 'готово',
    statRendering: 'рендеринг',
    statFailed: 'ошибка',
    statQueued: 'в очереди',
    scenePreviewHint: 'Нажмите на готовую сцену для просмотра',
    library: 'Библиотека · История',
    signup: 'Регистрация',
    signOut: 'Выйти',
    privacy: 'Политика конфиденциальности',
    terms: 'Условия использования',
    support: 'Поддержка',
    legalLabel: 'Правовая информация',
    share: 'Поделиться',
    copied: 'Ссылка скопирована',
    newFilm: 'Новый фильм',
    tryAgain: 'Повторить',
    writingStoryboard: 'Пишется сценарий — режиссура 5 сцен…',
  },
};

// ─── Pure helpers (kept local so the working card component is untouched) ──────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

// Longest-edge cap + JPEG re-encode for reference photos. iPhone 4K/HEIC frames
// can be 6–12 MB raw — far over Vercel's 4.5 MB serverless payload ceiling once
// the data URL is base64-inflated. We downscale to ≤1280px and re-encode at
// q0.82 BEFORE the image ever leaves the device. Every failure path falls back
// to the original bytes so a quirky codec never blocks an upload.
const MAX_REF_EDGE = 1280;
const REF_JPEG_QUALITY = 0.82;

async function compressImageToDataUrl(file: File): Promise<string> {
  const raw = await fileToDataUrl(file);
  if (typeof document === 'undefined' || !file.type.startsWith('image/')) return raw;
  try {
    const img = await loadImage(raw);
    const longest = Math.max(img.width, img.height) || 1;
    const scale = Math.min(1, MAX_REF_EDGE / longest);
    // Already small in both dimensions and bytes → keep the original.
    if (scale >= 1 && raw.length < 1_500_000) return raw;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return raw;
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL('image/jpeg', REF_JPEG_QUALITY);
    // Only adopt the re-encode when it actually shrinks the payload.
    return out && out.length < raw.length ? out : raw;
  } catch {
    return raw;
  }
}

// Minimal structural type for the Web Speech API surface we touch. We avoid the
// DOM lib's `SpeechRecognition` types (not present in every TS lib target) and
// model only the fields the composer reads/writes, so dictation stays portable.
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

// ─── Component ─────────────────────────────────────────────────────────────────

// ─── Reload-recovery for an in-flight film ───────────────────────────────────
// A 30-second film renders for 1–2 min. If the tab is reloaded or backgrounded
// out mid-render, the run used to be lost. We persist the union poll token the
// moment a render starts and re-attach to it on remount, so an interrupted film
// resumes instead of vanishing. Best-effort throughout — storage failures never
// break a render.
const FILM_INFLIGHT_KEY = 'myavatar:film:inflight';
const FILM_INFLIGHT_TTL_MS = 1_500_000; // 25 min — matches the driver's max poll window.

type InflightFilm = { predictionId: string; sessionId: string; prompt: string; locale: string; ts: number };

function persistInflightFilm(v: Omit<InflightFilm, 'ts'>): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(FILM_INFLIGHT_KEY, JSON.stringify({ ...v, ts: Date.now() }));
  } catch {
    /* storage unavailable/full — recovery is best-effort */
  }
}

function clearInflightFilm(): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(FILM_INFLIGHT_KEY);
  } catch {
    /* noop */
  }
}

function readInflightFilm(): InflightFilm | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(FILM_INFLIGHT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<InflightFilm>;
    if (!v || typeof v.predictionId !== 'string' || typeof v.sessionId !== 'string') return null;
    // Expired tokens point at jobs that are surely done + cleared; drop them.
    if (typeof v.ts !== 'number' || Date.now() - v.ts > FILM_INFLIGHT_TTL_MS) {
      clearInflightFilm();
      return null;
    }
    return {
      predictionId: v.predictionId,
      sessionId: v.sessionId,
      prompt: typeof v.prompt === 'string' ? v.prompt : '',
      locale: typeof v.locale === 'string' ? v.locale : 'ka',
      ts: v.ts,
    };
  } catch {
    return null;
  }
}

export function ConversationalFilmStudio({
  locale = 'ka',
  isAuthenticated = false,
}: ConversationalFilmStudioProps) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [slots, setSlots] = useState<(Slot | null)[]>([null, null, null]);
  // §5 Music-Video mode — a character photo (+ optional location) and the user's
  // OWN audio track become a genre-styled music video. The audio is held as a
  // data: URL and handed to the pipeline as the soundtrack, overriding the
  // generated score; genre + camera presets compose the director prompt.
  const [mvMode, setMvMode] = useState(false);
  const [mvGenre, setMvGenre] = useState<string | null>(null);
  const [mvShot, setMvShot] = useState<string | null>(null);
  const [mvCamera, setMvCamera] = useState<string | null>(null);
  const [mvLighting, setMvLighting] = useState<string | null>(null);
  const [mvAudioDataUrl, setMvAudioDataUrl] = useState<string | null>(null);
  const [mvAudioName, setMvAudioName] = useState<string | null>(null);
  const mvAudioInputRef = useRef<HTMLInputElement | null>(null);
  const [input, setInput] = useState('');
  const [driving, setDriving] = useState(false);
  const [progress, setProgress] = useState<FilmStudioProgress | null>(null);
  const [masterUrl, setMasterUrl] = useState<string | null>(null);
  const [filmQa, setFilmQa] = useState<FilmQaSummary | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A landed scene the user tapped to preview before the master is stitched.
  // Cleared on every new run so a stale scene from a prior render never lingers.
  const [selectedSceneUrl, setSelectedSceneUrl] = useState<string | null>(null);
  // Server-authoritative free-film count. null = unknown/anonymous → show the
  // real GEL estimate; > 0 → first film is free (honest founder promo). Never
  // assume free without the server confirming it.
  const [freeFilmsRemaining, setFreeFilmsRemaining] = useState<number | null>(null);
  // Real GEL wallet balance (null = unknown/anonymous). Sourced from the same
  // /api/credits/balance endpoint the chat surface uses, so the financial chip
  // in the header always shows the live ledger — never a fabricated number.
  const [balanceGel, setBalanceGel] = useState<number | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Client-derived auth. The server `isAuthenticated` prop can be stale (the
  // dashboard ships a static shell that the edge may cache), which made a
  // logged-in user look like a guest. We confirm the REAL session on mount and
  // ALL auth-gated UI keys off `authed`, never the raw prop.
  const [authed, setAuthed] = useState(isAuthenticated);
  // Authenticated identity address for the settings-drawer account line. null =
  // anonymous/unknown → the panel shows the localized "Guest" label instead.
  const [userEmail, setUserEmail] = useState<string | null>(null);
  // Live video-provider readiness for the drawer status dot. null = not yet
  // probed (neutral), true = LTX/Replicate wired (green), false = unconfigured
  // (red). Names-only probe — never reads a secret value to the client.
  const [providerReady, setProviderReady] = useState<boolean | null>(null);
  // ── Voice-to-Text (native Web Speech API dictation) ──────────────────────────
  // `speechSupported` gates whether the mic button renders at all (false on
  // browsers without webkitSpeechRecognition/SpeechRecognition). `isRecording`
  // drives the pulse-cyan button state. `micNotice` is an ephemeral, non-intrusive
  // toast (auto-dismissed) used for the iOS permission-denied / unsupported copy —
  // kept SEPARATE from the persistent pipeline `error` so a mic hiccup never reads
  // like a production failure.
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Whatever the user had already typed when dictation started — live transcript
  // is appended to THIS base so speaking never clobbers manual edits.
  const baseTranscriptRef = useRef('');
  // ── Whisper fallback (§3 Georgian STT) ──────────────────────────────────────
  // Where the browser exposes no SpeechRecognition (iOS Safari, most in-app
  // webviews) the mic would otherwise be hidden entirely. Instead we record a
  // short blob via MediaRecorder and POST it to /api/voice/transcribe, which runs
  // Whisper (large-v3) in the caller's UI language — far stronger for Georgian
  // (ka-GE) than the browser engine. `transcribing` drives a brief busy state.
  const [recorderSupported, setRecorderSupported] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const msgIdRef = useRef(1);
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    { id: 0, role: 'system', text: COPY[lang].welcome },
  ]);
  const nudgedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastPromptRef = useRef<string>('');
  // Guards the one-shot reload-recovery so a StrictMode double-mount (or a late
  // re-render) can't kick off two resume attempts for the same film.
  const recoveredRef = useRef(false);

  const pushMessage = useCallback((role: ChatMsg['role'], text: string) => {
    setMessages((prev) => [...prev, { id: msgIdRef.current++, role, text }]);
  }, []);

  // Auto-scroll the feed to the newest content as the conversation/pipeline moves.
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, progress, masterUrl, previewUrl, error]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Confirm the real auth session on mount so a stale server prop can't make a
  // signed-in user look anonymous (and vice-versa). Fail-safe: any error leaves
  // the seeded prop value untouched.
  useEffect(() => {
    let alive = true;
    createBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        if (alive) setAuthed(!!data.user);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // ── Speech-recognition bootstrap (created ONCE) ──────────────────────────────
  // Continuous + interim dictation: every recognized chunk (interim and final)
  // is folded into the full transcript and merged onto whatever the user already
  // typed, so speech flows straight into the composer in real time and stays
  // editable. The instance is built a single time; `lang` + the base snapshot are
  // set at start (see `toggleRecording`). Fail-safe: missing API → mic hidden.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = window as unknown as {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      SpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = SR.SpeechRecognition || SR.webkitSpeechRecognition;
    if (!Ctor) {
      setSpeechSupported(false);
      return;
    }
    setSpeechSupported(true);

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i]?.[0]?.transcript ?? '';
      }
      transcript = transcript.trim();
      const base = baseTranscriptRef.current;
      const merged = base ? `${base} ${transcript}`.trim() : transcript;
      setInput(merged);
    };
    rec.onerror = (ev) => {
      // Stop the recording UI and surface a clear, localized reason for the two
      // cases users actually hit on iOS/Safari (permission blocked, no device);
      // anything else simply ends the session silently.
      setIsRecording(false);
      const code = ev?.error;
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
        setMicNotice(t.micDenied);
      }
    };
    rec.onend = () => setIsRecording(false);
    recognitionRef.current = rec;

    return () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect the Whisper fallback's prerequisites (MediaRecorder + getUserMedia) so
  // the mic stays available even where SpeechRecognition is absent.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ok =
      typeof MediaRecorder !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function';
    setRecorderSupported(ok);
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* noop */
      }
      mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  // Auto-dismiss the mic toast so it stays non-intrusive (never lingers).
  useEffect(() => {
    if (!micNotice) return;
    const id = setTimeout(() => setMicNotice(null), 4500);
    return () => clearTimeout(id);
  }, [micNotice]);

  // Pull the server-authoritative onboarding state so the ledger reflects the
  // REAL remaining free-film count for this account — never a hardcoded promo.
  // Anonymous visitors (or an unapplied migration) simply keep the paid estimate.
  const refreshFreeFilms = useCallback(async () => {
    if (!authed) return;
    try {
      const res = await fetch('/api/profile/onboarding', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as {
        email?: string | null;
        state?: { freeFilmsRemaining?: number | null } | null;
      };
      const n = json?.state?.freeFilmsRemaining;
      if (typeof n === 'number') setFreeFilmsRemaining(n);
      // Capture the authenticated email for the drawer account line in the SAME
      // round-trip — no extra request.
      if (typeof json?.email === 'string' && json.email.length > 0) setUserEmail(json.email);
    } catch {
      /* fail-safe: leave null → show the real paid estimate */
    }
  }, [authed]);

  // Names-only video-provider probe for the drawer status dot. Fail-safe: any
  // error leaves the dot neutral and never blocks the studio.
  const refreshProviderStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/system/video-provider', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as { ready?: boolean };
      if (typeof json?.ready === 'boolean') setProviderReady(json.ready);
    } catch {
      /* fail-safe: leave null → neutral dot */
    }
  }, []);

  // Live GEL balance for the header chip. Fail-safe: any error simply leaves the
  // balance null and the chip renders 0.00 ₾ — never blocks the studio.
  const refreshBalance = useCallback(async () => {
    if (!authed) return;
    try {
      const res = await fetch('/api/credits/balance', { cache: 'no-store', credentials: 'include' });
      if (!res.ok) return;
      const json = (await res.json()) as { balance?: number | null };
      if (typeof json?.balance === 'number') setBalanceGel(json.balance);
    } catch {
      /* fail-safe: leave null → chip shows 0.00 ₾ */
    }
  }, [authed]);

  useEffect(() => {
    void refreshFreeFilms();
    void refreshBalance();
    void refreshProviderStatus();
  }, [refreshFreeFilms, refreshBalance, refreshProviderStatus]);

  const estCost = useMemo(() => estimateFilmCostGel(), []);
  const isFreeFilm = typeof freeFilmsRemaining === 'number' && freeFilmsRemaining > 0;
  const canSend = !driving && input.trim().length > 0;
  // PUBLIC-LAUNCH §4 — the send control glows Electric Cyan only when the action
  // is actually fundable: a live founder promo slot OR a wallet balance that
  // covers the estimated film cost. Otherwise it stays clean/neutral (and empty
  // input keeps it fully disabled), so the colour never over-promises.
  const balanceCoversCost = typeof balanceGel === 'number' && balanceGel >= estCost;
  const sendValidated = isFreeFilm || balanceCoversCost;

  const handlePick = useCallback(
    async (idx: number, fileList: FileList | null) => {
      const file = fileList?.[0];
      if (!file) return;
      try {
        const dataUrl = await compressImageToDataUrl(file);
        setSlots((prev) => {
          const next = [...prev];
          next[idx] = { dataUrl, name: file.name };
          return next;
        });
        if (!nudgedRef.current) {
          nudgedRef.current = true;
          pushMessage('system', t.identityNudge);
        }
      } catch {
        /* ignore unreadable file */
      }
    },
    [pushMessage, t.identityNudge],
  );

  const clearSlot = useCallback((idx: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  }, []);

  // §5 — read the user's chosen soundtrack into a data: URL. Capped at 3 MB so the
  // base64 payload keeps the assemble request body under the serverless 4.5 MB
  // limit. A 30-second soundtrack (this is a 30s film) is ~1–2 MB even at high
  // bitrate, so the cap never bites the real use case; FFmpeg trims it to length.
  const MV_AUDIO_MAX_BYTES = 3 * 1024 * 1024; // 3 MB (Vercel body-limit safe)
  const onPickSoundtrack = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      if (!file.type.startsWith('audio/')) {
        setMicNotice(locale === 'en' ? 'Please choose an audio file.' : locale === 'ru' ? 'Выберите аудиофайл.' : 'აირჩიეთ აუდიო ფაილი.');
        return;
      }
      if (file.size > MV_AUDIO_MAX_BYTES) {
        setMicNotice(locale === 'en' ? 'Audio is too large (3MB max — a ~30s clip).' : locale === 'ru' ? 'Аудио слишком большое (макс. 3МБ, ~30с).' : 'აუდიო ძალიან დიდია (მაქს. 3MB — ~30წმ).');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = typeof reader.result === 'string' ? reader.result : null;
        if (url) {
          setMvAudioDataUrl(url);
          setMvAudioName(file.name);
        }
      };
      reader.readAsDataURL(file);
    },
    [locale, MV_AUDIO_MAX_BYTES],
  );

  const runReal = useCallback(
    async (userPrompt: string, resume?: { predictionId: string; sessionId: string }) => {
      setError(null);
      setMasterUrl(null);
      setFilmQa(null);
      setPreviewUrl(null);
      setSelectedSceneUrl(null);
      setProgress({ phase: resume ? 'rendering' : 'dispatching', matrix: null, message: '', masterUrl: null, previewUrl: null });
      setDriving(true);
      pushMessage('system', t.producing);
      // PostHog funnel entry — credits is 0 on a free founder slot, else the
      // real GEL estimate. safeCapture is a no-op without a key, never throws.
      // On RESUME the funnel was already entered before the reload, so we don't
      // re-count the start — only the eventual success/failure is recorded.
      const billedGel = isFreeFilm ? 0 : estCost;
      const startedAt = Date.now();
      if (!resume) analytics.generationStarted('film', billedGel);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await driveFilmStudio({
          // §5 Music-Video mode composes the director prompt from the typed scene
          // + the chosen genre + camera move (anchoring the uploaded character).
          prompt: mvMode
            ? composeMusicVideoPrompt({ userPrompt, genreId: mvGenre, cameraId: mvCamera, shotId: mvShot, lightingId: mvLighting })
            : userPrompt,
          // A resume only re-attaches to the existing job; the reference images
          // were already consumed by the original dispatch.
          referenceImages: resume ? [] : slots.filter((s): s is Slot => !!s).map((s) => s.dataUrl),
          // §5 — the user's uploaded track becomes the soundtrack verbatim.
          ...(mvMode && mvAudioDataUrl ? { soundtrackUrl: mvAudioDataUrl } : {}),
          locale,
          signal: ctrl.signal,
          onProgress: (p) => setProgress(p),
          ...(resume ? { resume } : {}),
          // Persist the token the moment it's known so a reload can recover it.
          onDispatched: ({ predictionId, sessionId }) =>
            persistInflightFilm({ predictionId, sessionId, prompt: userPrompt, locale }),
        });
        setMasterUrl(res.masterUrl);
        setFilmQa(res.qa ?? null);
        setPreviewUrl(res.previewUrl);
        if (!res.ok && res.error) {
          setError(res.error);
          pushMessage('system', `${t.failed} ${res.error}`);
          analytics.generationFailed('film', res.error);
          reportError(res.error, { surface: 'ConversationalFilmStudio', action: 'film_generation', locale });
        } else {
          pushMessage('system', t.ready);
          analytics.generationSuccess('film', billedGel, Date.now() - startedAt);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error.';
        setError(message);
        pushMessage('system', `${t.failed} ${message}`);
        analytics.generationFailed('film', message);
        reportError(err, { surface: 'ConversationalFilmStudio', action: 'film_generation', locale });
      } finally {
        // The render settled (success / failure / cancel) — drop the recovery
        // token so the next page load doesn't try to resume a finished film.
        clearInflightFilm();
        setDriving(false);
        abortRef.current = null;
        // Re-sync the free-film count + GEL balance from the server — a
        // successful render consumes the founder slot and/or debits the wallet,
        // so both ledgers should reflect the new reality for the next video.
        // (No-op for anonymous users.)
        void refreshFreeFilms();
        void refreshBalance();
      }
    },
    [slots, mvMode, mvGenre, mvShot, mvCamera, mvLighting, mvAudioDataUrl, locale, pushMessage, t.producing, t.ready, t.failed, refreshFreeFilms, refreshBalance, estCost, isFreeFilm],
  );

  // Reload-recovery: on first mount, if a film was mid-render when the tab was
  // reloaded/closed, re-attach to that job by its persisted poll token and
  // resume the tracker — the render isn't lost. One-shot via recoveredRef.
  useEffect(() => {
    if (recoveredRef.current) return;
    recoveredRef.current = true;
    const inflight = readInflightFilm();
    if (!inflight) return;
    lastPromptRef.current = inflight.prompt;
    void runReal(inflight.prompt, { predictionId: inflight.predictionId, sessionId: inflight.sessionId });
  }, [runReal]);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    // NOTE: generation is NOT gated on auth here. A stale build-time
    // `isAuthenticated` (the dashboard was statically rendered) made the old
    // gate fire for everyone — pressing Send wrongly opened the menu drawer
    // instead of generating. Send now always proceeds; the auth requirement is
    // handled gracefully at the stitch step for the rare anonymous case.
    // Finalize any in-flight dictation so the recognizer releases the mic before
    // the prompt is dispatched.
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
    setIsRecording(false);
    const userPrompt = input.trim();
    setInput('');
    lastPromptRef.current = userPrompt;
    pushMessage('user', userPrompt);
    void runReal(userPrompt);
  }, [canSend, input, pushMessage, runReal]);

  // Re-run the most recent prompt after a failure — one tap instead of retyping.
  const handleRetry = useCallback(() => {
    const p = lastPromptRef.current.trim();
    if (!p || driving) return;
    setError(null);
    void runReal(p);
  }, [driving, runReal]);

  // Clean slate for the next film: clears the render + progress so the studio
  // returns to a pristine canvas (the conversation history is preserved above).
  const handleNewFilm = useCallback(() => {
    abortRef.current?.abort();
    setProgress(null);
    setMasterUrl(null);
    setPreviewUrl(null);
    setSelectedSceneUrl(null);
    setError(null);
    setInput('');
    textareaRef.current?.focus();
  }, []);

  // Toggle native dictation. On START we explicitly probe mic permission via
  // getUserMedia (the clean Safari/iOS path): a denied promise surfaces the
  // localized "enable in settings" toast instead of a silent no-op. We snapshot
  // the current input as the append base and set the recognizer locale from the
  // active UI language (ka-GE / ru-RU / en-US) right before starting.
  const toggleRecording = useCallback(async () => {
    const whisperLang = lang === 'ka' ? 'ka-GE' : lang === 'ru' ? 'ru-RU' : 'en-US';

    // ── Backend A: browser SpeechRecognition — used ONLY when MediaRecorder is
    // unavailable. Whisper (Backend B below) is the PRIMARY path now: the browser
    // engine drops the Georgian (ka-GE) locale and loses composer state too often,
    // so the workflow records a blob and transcribes server-side with Whisper. ──
    if (!recorderSupported && speechSupported && recognitionRef.current) {
      const rec = recognitionRef.current;
      if (isRecording) {
        try {
          rec.stop();
        } catch {
          /* noop */
        }
        setIsRecording(false);
        return;
      }
      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Release the probe stream immediately — SpeechRecognition opens its own.
          stream.getTracks().forEach((tr) => tr.stop());
        }
      } catch {
        setMicNotice(t.micDenied);
        return;
      }
      baseTranscriptRef.current = input;
      try {
        rec.lang = whisperLang;
        rec.start();
        setIsRecording(true);
      } catch {
        // .start() throws if already started — keep the UI honest.
        setIsRecording(false);
      }
      return;
    }

    // ── Backend B: MediaRecorder → Whisper (iOS Safari / no SpeechRecognition). ─
    // Record a short blob and POST it to /api/voice/transcribe, which runs Whisper
    // large-v3 in the UI language — far stronger for Georgian than the browser.
    if (recorderSupported) {
      if (isRecording) {
        // Stop → fires recorder.onstop → transcribe.
        try {
          mediaRecorderRef.current?.stop();
        } catch {
          /* noop */
        }
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setMicNotice(t.micDenied);
        return;
      }
      const mime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        setIsRecording(false);
        stream.getTracks().forEach((tr) => tr.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        if (chunks.length === 0) return;
        const recMime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: recMime });
        const form = new FormData();
        form.append('audio', blob, `voice.${recMime.includes('mp4') ? 'm4a' : 'webm'}`);
        form.append('language', whisperLang);
        setTranscribing(true);
        try {
          const res = await fetch('/api/voice/transcribe', { method: 'POST', body: form });
          const json = (await res.json().catch(() => null)) as { text?: unknown } | null;
          const text = json && typeof json.text === 'string' ? json.text.trim() : '';
          if (text) {
            setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
            // Keep focus on the composer with the caret at the end so the user can
            // immediately edit the transcribed Georgian text before sending.
            requestAnimationFrame(() => {
              const el = textareaRef.current;
              if (!el) return;
              el.focus();
              try {
                const end = el.value.length;
                el.setSelectionRange(end, end);
              } catch {
                /* some browsers throw on setSelectionRange in certain states */
              }
            });
          } else {
            setMicNotice(t.voiceUnsupported);
          }
        } catch {
          setMicNotice(t.micDenied);
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;
      baseTranscriptRef.current = input;
      try {
        recorder.start();
        setIsRecording(true);
      } catch {
        setIsRecording(false);
        stream.getTracks().forEach((tr) => tr.stop());
      }
      return;
    }

    setMicNotice(t.voiceUnsupported);
  }, [speechSupported, recorderSupported, isRecording, input, lang, t.voiceUnsupported, t.micDenied]);

  // Pre-fill the composer from a tapped starter chip and focus it (caret at end)
  // WITHOUT auto-sending — the user still reviews/edits and presses generate, so
  // a tap never spends a founder slot or debits the wallet on its own.
  const fillFromStarter = useCallback((prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      try {
        el.setSelectionRange(end, end);
      } catch {
        /* some browsers throw on setSelectionRange for certain states */
      }
    });
  }, []);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setDriving(false);
  }, []);

  // Open the Stripe top-up modal + record the funnel intent in PostHog.
  const openWallet = useCallback(() => {
    analytics.walletTopupClicked('film_studio_header', balanceGel);
    setWalletOpen(true);
  }, [balanceGel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Single source of truth for the live STATUS PIPELINE — derived by the pure,
  // unit-tested `summarizeFilmPipeline` (lib/chat/filmStudioStages). Returns the
  // ordered legs plus aggregate metrics (scene count, scenes rendered, whole-
  // pipeline percent, terminal done/failed) the tracker UI renders verbatim.
  const roleSceneLabel = lang === 'ka' ? 'სცენა' : lang === 'ru' ? 'Сцена' : 'Scene';
  const showTracker = driving || (progress != null && progress.phase !== 'idle');
  // The production has come to a dead STOP once the driver promise resolves
  // (`driving` flips false) — success, failure, timeout, or cancel. At that
  // point nothing more is emitted, so no leg may keep spinning. Feeding
  // `terminal` into the pure summary downgrades any lingering 'active' (e.g.
  // still-'queued') legs to a calm pending dot, which is the safety net that
  // kills the contradictory "5 scenes spinning under a red halted header" — it
  // covers even the timeout / cancel paths that resolve without an emitted
  // terminal 'failed' phase.
  const terminal = showTracker && !driving;
  const pipeline = summarizeFilmPipeline(progress, roleSceneLabel, { terminal });
  const stages = pipeline.stages;
  // Split the legs: the cinematic SCENE renders get their own gallery of
  // stylish tiles, while the flow legs (storyboard / editor / score) stay a
  // compact checklist. The clip keys are `clip_N` (see filmStudioStages).
  const sceneStages = stages.filter((s) => s.key.startsWith('clip_'));
  const flowStages = stages.filter((s) => !s.key.startsWith('clip_'));
  // The video shown in the hero preview: the finished master wins; otherwise a
  // scene the user tapped; otherwise the honest first-rendered-scene fallback.
  const heroPreviewUrl = masterUrl ?? selectedSceneUrl ?? previewUrl;
  const finished = pipeline.done;
  // A render is HALTED (terminal failure) only when work has STOPPED and no master
  // landed — never merely because an individual scene leg failed mid-render. The
  // editor can still stitch a film from the scenes that DID succeed, so while
  // `driving` is true we always show the live spinner, not a red halt.
  const halted = terminal && !finished && !masterUrl;

  // First-run starter chips: shown only on the pristine canvas — before the user
  // has typed/sent anything and while nothing is rendering or rendered — so they
  // guide the empty state without ever cluttering an active conversation.
  const hasUserMessage = messages.some((m) => m.role === 'user');
  const showStarters =
    !hasUserMessage && !showTracker && !driving && !masterUrl && !previewUrl && !error;

  // §5 — localized chip label (presets carry ka + en; ru reuses en).
  const mvText = (en: string, ka: string, ru: string) => (locale === 'en' ? en : locale === 'ru' ? ru : ka);
  const mvItemLabel = (it: { labelKa: string; labelEn: string }) => (locale === 'ka' ? it.labelKa : it.labelEn);
  const renderMvChips = (
    label: string,
    items: ReadonlyArray<{ id: string; labelKa: string; labelEn: string }>,
    selected: string | null,
    onSelect: (id: string | null) => void,
  ) => (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[12px] text-white/40">{label}</span>
      {/* Horizontally-scrollable carousel of chips — saves vertical space on
          mobile and keeps each category to a single tidy row. */}
      <div className="flex flex-1 gap-1.5 overflow-x-auto no-scrollbar -mx-0.5 px-0.5 py-0.5" style={{ WebkitOverflowScrolling: 'touch' }}>
        {items.map((it) => {
          const active = selected === it.id;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onSelect(active ? null : it.id)}
              aria-pressed={active}
              className={[
                'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] transition-colors touch-manipulation',
                active
                  ? 'border-[#00D2FF]/50 bg-[#00D2FF]/10 text-[#00D2FF]'
                  : 'border-white/12 text-white/55 hover:border-white/30 hover:text-white/80',
              ].join(' ')}
            >
              {mvItemLabel(it)}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    // STRICT three-tone matrix — pure black canvas (#000000, infinite depth on
    // OLED iPhones), white type, electric-cyan (#00D2FF) for every active accent.
    // A true full-screen chatbot shell: header pinned top, the conversation feed
    // owns the height, and the composer is locked to the bottom so it rides above
    // the iOS keyboard. overflow-hidden on the shell + a single inner scroller
    // kills the Safari/Chrome rubber-band "page slide".
    <>
    {/* ABSOLUTE viewport lock: `fixed inset-0` pins the shell to all four edges
        of the visual viewport, so the studio can never be center-clamped or
        leave dead space regardless of any parent layout. `height: 100dvh` is the
        iOS-correct unit (tracks Safari/Chrome dynamic toolbars), so the composer
        is never cut off behind the keyboard or address bar — the regression a
        raw 100vh `h-screen` would reintroduce. */}
    <div
      className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-black text-white antialiased"
      style={{ height: '100dvh' }}
    >
      {/* ── Top app bar ────────────────────────────────────────────────── */}
      <header
        className="shrink-0 sticky top-0 z-30 border-b border-white/10 bg-black/90 backdrop-blur-xl"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-2 px-4">
          <Link href={`/${locale}/dashboard`} className="group flex items-center gap-2.5 min-w-0">
            {/* 3D rocket mark — cyan halo, ambient pulse, gentle hover tilt. */}
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#00D2FF]/40 bg-[#00D2FF]/10 shadow-[0_0_15px_rgba(0,210,255,0.25)] transition-transform duration-500 ease-out group-hover:rotate-12 group-hover:scale-105">
              <span className="text-[15px] leading-none animate-pulse motion-reduce:animate-none" aria-hidden="true">
                🚀
              </span>
            </span>
            {/* Clean brand name only — no subtitle. Decluttered per the
                App-Store-grade header spec. */}
            <span className="block truncate text-sm font-bold tracking-wide text-white">
              MyAvatar<span className="text-[#00D2FF]">.ge</span>
            </span>
          </Link>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Financial GEL ledger — live wallet balance in ₾, with a compact
                cyan top-up control that opens the Stripe-hosted checkout inline
                (no page leave). Replaces the old opaque "credits" badge. */}
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-white/10 bg-black">
              {/* Live wallet balance. `formatGEL` already emits the `₾` suffix, so
                  we render it exactly ONCE (the previous extra cyan prefix made the
                  chip read "₾ 0.00 ₾"); the trailing symbol is tinted cyan via the
                  flex layout below. */}
              <span className="flex items-baseline gap-1 px-2.5 py-1.5 text-xs font-bold tabular-nums text-white">
                {(balanceGel ?? 0).toFixed(2)}
                <span className="text-[#00D2FF]">₾</span>
              </span>
              <button
                type="button"
                onClick={openWallet}
                aria-label={t.topUp}
                // Apple IAP compliance: hidden inside the native iOS shell (top-up is a web/Stripe purchase).
                data-iap-external
                className="flex items-center gap-1 border-l border-white/10 bg-[#00D2FF]/10 px-2 py-1.5 text-xs font-bold text-[#00D2FF] transition-colors hover:bg-[#00D2FF]/20 touch-manipulation"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.topUp}</span>
              </button>
            </div>
            {/* Native hamburger — slides out the minimalist settings panel. */}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label={t.menu}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black text-neutral-300 transition-colors hover:border-[#00D2FF]/40 hover:text-white touch-manipulation"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Conversation feed (the hero — owns all spare height) ────────── */}
      {/* no-scrollbar + momentum + overscroll-contain so only THIS pane scrolls. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto no-scrollbar"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-5 space-y-4">
          {/* §5 — Character Music Video: the "One Window" creative panel. The
              complex LTX-2 prompt parameters (genre, framing, camera move,
              lighting/mood) become tasteful cyan chips, and the user's OWN audio
              becomes the soundtrack. Tucked behind a single toggle so the default
              studio stays minimal; the photo strip below doubles as character +
              location references in this mode. */}
          <div className="rounded-2xl border border-white/10 bg-black p-2.5 sm:p-3">
            <button
              type="button"
              onClick={() => setMvMode((v) => !v)}
              aria-pressed={mvMode}
              className={[
                'flex w-full items-center justify-between gap-2 rounded-xl px-1.5 py-1 text-[14px] transition-colors',
                mvMode ? 'text-[#00D2FF]' : 'text-white/70 hover:text-white',
              ].join(' ')}
            >
              <span className="inline-flex items-center gap-2 font-medium">
                <Music2 className="h-4 w-4" />
                {mvText('Music Video', 'მუსიკალური ვიდეო', 'Музыкальное видео')}
              </span>
              <span
                className={[
                  'rounded-full border px-2 py-0.5 text-[12px]',
                  mvMode ? 'border-[#00D2FF]/40 bg-[#00D2FF]/10 text-[#00D2FF]' : 'border-white/15 text-white/40',
                ].join(' ')}
              >
                {mvMode ? mvText('On', 'ჩართ.', 'Вкл') : mvText('Off', 'გამორთ.', 'Выкл')}
              </span>
            </button>

            {mvMode && (
              <div className="mt-2.5 space-y-2 border-t border-white/10 pt-2.5">
                {renderMvChips(mvText('Genre', 'ჟანრი', 'Жанр'), MV_GENRES, mvGenre, setMvGenre)}
                {renderMvChips(mvText('Shot', 'კადრი', 'Кадр'), MV_SHOTS, mvShot, setMvShot)}
                {renderMvChips(mvText('Camera', 'კამერა', 'Камера'), MV_CAMERA_MOVES, mvCamera, setMvCamera)}
                {renderMvChips(mvText('Light', 'შუქი', 'Свет'), MV_LIGHTING, mvLighting, setMvLighting)}

                <div className="flex items-center gap-2 pt-0.5">
                  <span className="w-14 shrink-0 text-[12px] text-white/40">{mvText('Audio', 'აუდიო', 'Аудио')}</span>
                  <input
                    ref={mvAudioInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => onPickSoundtrack(e.target.files?.[0])}
                  />
                  {mvAudioName ? (
                    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-[#00D2FF]/30 bg-[#00D2FF]/5 px-2.5 py-1 text-[12px] text-[#00D2FF]">
                      <Music2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="max-w-[150px] truncate">{mvAudioName}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setMvAudioDataUrl(null);
                          setMvAudioName(null);
                          if (mvAudioInputRef.current) mvAudioInputRef.current.value = '';
                        }}
                        aria-label={mvText('Remove audio', 'აუდიოს მოშორება', 'Удалить аудио')}
                        className="text-white/40 hover:text-white"
                      >
                        ✕
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => mvAudioInputRef.current?.click()}
                      className="rounded-lg border border-white/15 px-2.5 py-1 text-[12px] text-white/60 transition-colors hover:border-[#00D2FF]/40 hover:text-white"
                    >
                      {mvText('Upload track', 'ატვირთე ტრეკი', 'Загрузить трек')}
                    </button>
                  )}
                </div>

                <p className="text-[12px] leading-snug text-white/35">
                  {mvText(
                    'Upload a character photo (and a location) below; your track becomes the soundtrack. Then type a one-line scene and press generate.',
                    'ქვემოთ ატვირთე პერსონაჟის ფოტო (და ლოკაცია); შენი ტრეკი გახდება საუნდტრეკი. შემდეგ ჩაწერე სცენის ერთი წინადადება და დააჭირე გენერაციას.',
                    'Загрузите фото персонажа (и локацию) ниже; ваш трек станет саундтреком. Затем введите сцену одной строкой и нажмите генерацию.',
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Compact identity strip — reference photos are OPTIONAL. A slim row
              of small thumbnails so the chat keeps the lion's share of the view. */}
          <div className="rounded-2xl border border-white/10 bg-black p-2.5 sm:p-3">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {[0, 1, 2].map((idx) => {
                  const slot = slots[idx] ?? null;
                  // §5 Music-Video mode relabels the ingestion zones: slot 0 is the
                  // CHARACTER, slot 1 the LOCATION/background (the audio track is the
                  // third zone, in the Music-Video panel above). Otherwise the slots
                  // keep their identity-reference roles (face / profile / lighting).
                  const role = mvMode
                    ? idx === 0
                      ? mvText('Character', 'პერსონაჟი', 'Персонаж')
                      : idx === 1
                        ? mvText('Location', 'ლოკაცია', 'Локация')
                        : mvText('Extra', 'დამატ.', 'Доп.')
                    : t.roles[idx] ?? '';
                  return (
                    <div
                      key={idx}
                      className="relative h-11 w-11 sm:h-14 sm:w-14 rounded-lg border border-white/10 bg-black overflow-hidden group transition-colors hover:border-[#00D2FF]/40"
                    >
                      {slot ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={slot.dataUrl} alt={role} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => clearSlot(idx)}
                            disabled={driving}
                            aria-label="Remove photo"
                            className="absolute top-0.5 right-0.5 rounded-md border border-white/10 bg-black/70 p-0.5 text-neutral-300 hover:text-white disabled:opacity-40"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </>
                      ) : (
                        <label
                          aria-label={role}
                          className="flex h-full w-full cursor-pointer items-center justify-center"
                        >
                          <ImagePlus className="h-4 w-4 text-neutral-600 transition-colors group-hover:text-[#00D2FF]" />
                          {/* accept="image/*" natively offers Take Photo / Library on iOS & Android. */}
                          <input
                            type="file"
                            accept="image/*"
                            disabled={driving}
                            onChange={(e) => void handlePick(idx, e.target.files)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-bold uppercase tracking-wider text-neutral-400">
                  {t.identityLabel}
                </p>
                <p className="text-[11px] text-neutral-600">{t.identityHint}</p>
              </div>
            </div>
          </div>

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={[
                  'max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-white text-black font-medium rounded-tr-sm shadow-[0_0_20px_rgba(255,255,255,0.06)]'
                    : 'bg-black text-neutral-300 border border-white/10 rounded-tl-sm',
                ].join(' ')}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* First-run starter chips — tappable example director scripts that
              pre-fill the composer (never auto-send). Shown only on the pristine
              canvas so they guide the empty state without crowding a live chat. */}
          {showStarters && (
            <div className="space-y-2">
              <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                {t.starterHint}
              </p>
              <div className="flex flex-col gap-2">
                {filmStarterPrompts(locale).map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => fillFromStarter(prompt)}
                    className="group flex items-center gap-2.5 rounded-2xl border border-white/10 bg-black px-3.5 py-3 text-left text-[14px] leading-snug text-neutral-300 transition-colors hover:border-[#00D2FF]/40 hover:text-white active:scale-[0.99] motion-reduce:active:scale-100 touch-manipulation"
                  >
                    <Clapperboard className="h-4 w-4 shrink-0 text-[#00D2FF]/70 transition-colors group-hover:text-[#00D2FF]" />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Live per-leg progress tracker (real onProgress) — cyan accents. */}
          {showTracker && (
            <div className="rounded-2xl border border-white/10 bg-black p-4 space-y-3">
              <div className="flex items-center gap-3">
                {/* Terminal-failure FIRST: a HALTED render must never keep spinning
                    the "in progress" loader (the contradictory state users saw —
                    a spinner + "render could not be completed"). Halted → red
                    alert; done → cyan check; otherwise (incl. mid-render with some
                    failed scenes) → the live spinner, because the film can still
                    stitch from the scenes that succeeded. */}
                {halted ? (
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                ) : finished ? (
                  <CheckCircle2 className="w-5 h-5 text-[#00D2FF] shrink-0" />
                ) : (
                  <Loader2 className="w-5 h-5 text-[#00D2FF] animate-spin shrink-0 motion-reduce:animate-none" />
                )}
                <div className="min-w-0">
                  <span
                    className={[
                      'block text-[11px] font-bold uppercase tracking-wider',
                      halted ? 'text-red-300' : 'text-neutral-400',
                    ].join(' ')}
                  >
                    {halted ? t.pipelineFailed : finished ? t.pipelineDone : t.pipelineRunning}
                  </span>
                  <p className="text-xs text-neutral-300 mt-0.5">{progress?.message || 'Working…'}</p>
                </div>
                {driving && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="ml-auto shrink-0 rounded-lg border border-white/10 bg-black px-2.5 py-1 text-[12px] font-semibold text-neutral-400 hover:text-white"
                  >
                    {t.cancel}
                  </button>
                )}
              </div>

              {/* Storyboard skeleton — a cinematic shimmer while the script is
                  being written (before any scene status exists). Reassures the
                  user that work is happening during the longest silent gap. */}
              {progress?.phase === 'dispatching' && (
                <div className="space-y-2">
                  <p className="text-[12px] font-medium text-[#00D2FF]/80">{t.writingStoryboard}</p>
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-3 overflow-hidden rounded-full bg-[linear-gradient(110deg,rgba(255,255,255,0.04)_30%,rgba(0,210,255,0.14)_50%,rgba(255,255,255,0.04)_70%)] bg-[length:200%_100%] animate-shimmer"
                        style={{ width: `${[92, 78, 60][i]}%` }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {/* Whole-pipeline progress: a thin cyan bar + scene/percent readout,
                  both driven by the unit-tested summarizeFilmPipeline metrics. */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider tabular-nums">
                  {/* Honest live breakdown: how many scenes are READY, still
                      RENDERING (cyan), and FAILED (red) — so the counter explains
                      the bar instead of a lone discouraging "0/5". A failed scene
                      doesn't doom the film; the editor stitches from the ones that
                      land, so failures read as a calm tally, not an alarm. */}
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-neutral-300">
                      {pipeline.scenesRendered} / {pipeline.totalScenes} {t.statReady}
                    </span>
                    {pipeline.scenesRendering > 0 && (
                      <span className="text-[#00D2FF]">· {pipeline.scenesRendering} {t.statRendering}</span>
                    )}
                    {pipeline.scenesFailed > 0 && (
                      <span className="text-red-300">· {pipeline.scenesFailed} {t.statFailed}</span>
                    )}
                  </span>
                  <span className={halted ? 'text-red-300' : 'text-[#00D2FF]'}>{pipeline.percent}%</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={[
                      'h-full rounded-full transition-[width] duration-500 ease-out',
                      halted ? 'bg-red-400/80' : 'bg-[#00D2FF] shadow-[0_0_10px_rgba(0,210,255,0.5)]',
                    ].join(' ')}
                    style={{ width: `${pipeline.percent}%` }}
                  />
                </div>
              </div>
              {/* Flow legs (storyboard → editor → score) as a quiet checklist. */}
              <ul className="space-y-1.5">
                {flowStages.map((s) => (
                  <li key={s.key} className="flex items-center gap-2.5 text-xs">
                    <StatusDot state={s.state} />
                    <span
                      className={
                        s.state === 'done'
                          ? 'text-neutral-300'
                          : s.state === 'active'
                            ? 'text-white'
                            : s.state === 'failed'
                              ? 'text-red-300'
                              : 'text-neutral-600'
                      }
                    >
                      {s.label}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Scene gallery — a stylish tile per clip: shimmer while it
                  renders, the live thumbnail the instant it lands (tap to preview),
                  a calm red tile on failure. The content the film is made of, made
                  visible. */}
              {sceneStages.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                      {t.scenes}
                    </span>
                    {sceneStages.some((s) => s.state === 'done' && s.previewUrl) && !masterUrl && (
                      <span className="text-[11px] text-neutral-600">{t.scenePreviewHint}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {sceneStages.map((s, i) => (
                      <FilmSceneCard
                        key={s.key}
                        index={i}
                        state={s.state}
                        previewUrl={s.previewUrl}
                        sceneWord={roleSceneLabel}
                        selected={!!s.previewUrl && s.previewUrl === selectedSceneUrl}
                        statusLabel={
                          s.state === 'done'
                            ? t.statReady
                            : s.state === 'active'
                              ? t.statRendering
                              : s.state === 'failed'
                                ? t.statFailed
                                : t.statQueued
                        }
                        onPreview={(url) => setSelectedSceneUrl(url)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error card — restrained red is kept ONLY here so a failure always
              reads unambiguously as an error (a deliberate exception to the
              black/white/cyan brand palette). */}
          {error && (
            <div className="space-y-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-xs text-red-300">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {/* Action-oriented recovery: one tap re-runs the last prompt. */}
              {!driving && lastPromptRef.current.trim() && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-white/15 bg-black px-4 py-2 text-xs font-semibold text-white transition-colors hover:border-[#00D2FF]/50 hover:text-[#00D2FF]"
                >
                  <RefreshCw className="h-4 w-4" />
                  {t.tryAgain}
                </button>
              )}
            </div>
          )}

          {/* Hero preview — ONE premium player. Shows the finished master, or a
              scene the user tapped, or the honest first-rendered-scene fallback.
              Master gets the cyan "ready" ring + download; a scene preview is
              clearly labelled so it's never mistaken for the final cut. */}
          {heroPreviewUrl && (
            <FilmPreviewPlayer
              url={heroPreviewUrl}
              isMaster={!!masterUrl}
              isScenePreview={!masterUrl && !!selectedSceneUrl}
              headline={masterUrl ? t.masterReady : selectedSceneUrl ? `${roleSceneLabel} · ${t.statReady}` : t.firstScene}
              openLabel={t.openMaster}
              shareLabel={t.share}
              copiedLabel={t.copied}
            />
          )}

          {/* Supervisor QA verdict — the automated quality gate's grade on the
              finished master. Cyan when the film passed every check; red (the
              only sanctioned use of red) when a real defect was detected, so a
              flawed cut is never silently presented as final. */}
          {masterUrl && filmQa && (
            <div
              className={`mt-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] ${
                filmQa.pass
                  ? 'border-[#00D2FF]/30 bg-[#00D2FF]/5 text-[#00D2FF]'
                  : 'border-red-500/40 bg-red-500/10 text-red-400'
              }`}
              role={filmQa.pass ? undefined : 'alert'}
            >
              <span aria-hidden className="text-[15px] leading-none">{filmQa.pass ? '✓' : '⚠'}</span>
              <span className="font-medium">
                {filmQa.pass
                  ? locale === 'en'
                    ? 'Quality check passed'
                    : locale === 'ru'
                      ? 'Проверка качества пройдена'
                      : 'ხარისხის შემოწმება გავლილია'
                  : locale === 'en'
                    ? 'Quality warning — review before sharing'
                    : locale === 'ru'
                      ? 'Предупреждение о качестве'
                      : 'ხარისხის გაფრთხილება — გადახედეთ გაზიარებამდე'}
                {' · '}
                {filmQa.grade} · {filmQa.score}/100
              </span>
            </div>
          )}

          {/* Start-over — once a master is assembled (or the run failed), offer a
              clean slate so the next film doesn't pile under the old one. */}
          {!driving && (masterUrl || (finished && !heroPreviewUrl) || (error && lastPromptRef.current.trim())) && (
            <button
              type="button"
              onClick={handleNewFilm}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black px-4 py-3 text-xs font-bold uppercase tracking-widest text-neutral-200 transition-colors hover:border-[#00D2FF]/50 hover:text-[#00D2FF]"
            >
              <Plus className="h-4 w-4" />
              {t.newFilm}
            </button>
          )}

          <div ref={feedEndRef} />
        </div>
      </div>

      {/* ── Composer — locked to the bottom, rides above the iOS keyboard ─ */}
      <div
        className="shrink-0 border-t border-white/10 bg-black/95 backdrop-blur-lg"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 pt-3">
          {/* Ephemeral mic toast — permission denied / unsupported. Non-intrusive,
              auto-dismissed, and visually distinct from the red pipeline error so a
              mic hiccup never reads like a production failure. */}
          {micNotice && (
            <div
              role="status"
              className="mb-2 rounded-xl border border-white/10 bg-black px-3 py-2 text-center text-[12px] text-neutral-300"
            >
              {micNotice}
            </div>
          )}
          {/* Prompt + the big "Generate video" CTA in ONE focused conversion bar.
              The bar lights cyan on focus; the CTA turns full electric-cyan when the
              server confirms a free founder slot, otherwise it stays clean white and
              the existing /api/video/assemble billing gate charges normally. */}
          <div className="flex items-end gap-2 rounded-2xl border border-[#3f3f46] bg-black p-2 transition-all focus-within:border-[#00D2FF] focus-within:shadow-[0_0_15px_rgba(0,210,255,0.15)]">
            <textarea
              ref={textareaRef}
              rows={1}
              className="flex-1 bg-transparent text-[17px] leading-relaxed px-2.5 py-2 focus:outline-none placeholder-neutral-600 resize-none text-white max-h-32"
              placeholder={driving ? t.placeholderBusy : t.placeholder}
              disabled={driving}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {/* Native Voice-to-Text toggle, docked just before Send. Minimalist:
                muted gray when idle, pulse Electric-Cyan while live-transcribing.
                Only rendered when the browser exposes the Web Speech API. */}
            {(speechSupported || recorderSupported) && (
              <button
                type="button"
                onClick={toggleRecording}
                disabled={driving || transcribing}
                aria-pressed={isRecording}
                aria-busy={transcribing}
                aria-label={isRecording ? t.micStop : t.micStart}
                title={isRecording ? t.micStop : t.micStart}
                className={[
                  // 44px touch target (a11y / mobile tap). Recording = animated RED
                  // pulse (the universal "rec" signal); transcribing = cyan pulse.
                  'inline-flex h-11 w-11 items-center justify-center rounded-full transition-all shrink-0 touch-manipulation',
                  driving
                    ? 'text-neutral-700 cursor-not-allowed'
                    : isRecording
                      ? 'text-red-500 bg-red-500/10 animate-pulse motion-reduce:animate-none'
                      : transcribing
                        ? 'text-[#00D2FF] animate-pulse motion-reduce:animate-none'
                        : 'text-white/40 hover:text-white/70 active:scale-90 motion-reduce:active:scale-100',
                ].join(' ')}
              >
                <Mic className="w-4 h-4" />
              </button>
            )}
            {/* Native round action button, docked in the bar's corner like
                ChatGPT/Claude. Electric-cyan glow when the action is fundable
                (promo slot OR balance covers the cost); clean white when active
                but not yet validated; muted + non-interactive until prompt text
                exists. */}
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label={t.generate}
              title={t.generate}
              className={[
                'inline-flex h-11 w-11 items-center justify-center rounded-full transition-all shrink-0 touch-manipulation',
                !canSend
                  ? 'bg-white/10 text-neutral-600 cursor-not-allowed'
                  : sendValidated
                    ? 'bg-[#00D2FF] text-black shadow-[0_0_18px_rgba(0,210,255,0.45)] hover:brightness-110 active:scale-90 motion-reduce:active:scale-100'
                    : 'bg-white text-black hover:bg-neutral-200 active:scale-90 motion-reduce:active:scale-100',
              ].join(' ')}
            >
              {driving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          {/* No always-on "tariff" menu — the studio goes straight to the
              process. The cost is shown ONLY once the user has typed a prompt
              (or as the free-film note), so it reads as "this video costs X ₾"
              for the action they're about to take, not a price list. */}
          {(isFreeFilm || input.trim().length > 0) && (
            <p className="mt-2 text-center text-[12px] font-semibold">
              {isFreeFilm ? (
                <span className="inline-flex items-center gap-1.5 text-[#00D2FF]">
                  <CheckCircle2 className="h-3 w-3" />
                  {t.promoLimit}
                </span>
              ) : (
                <span className="text-white">
                  {locale === 'ka'
                    ? 'ვიდეოს ღირებულება'
                    : locale === 'ru'
                      ? 'Стоимость видео'
                      : 'Video cost'}{' '}
                  ≈ <span className="text-[#00D2FF]">{formatGEL(estCost)}</span>
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>

      {/* ── Settings drawer — slides in from the right on hamburger tap ──── */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[80] flex justify-end bg-black/70 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-72 max-w-[80vw] flex-col border-l border-white/10 bg-black shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-[slideIn_0.2s_ease-out]"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <span className="text-sm font-bold tracking-wide text-white">{t.settings}</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={t.cancel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black text-neutral-400 transition-colors hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div
              className="flex flex-1 flex-col gap-2 overflow-y-auto p-4"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
            >
              {/* Field 1 — Account details. Non-interactive identity line: the
                  authenticated email, or the localized "Guest" label when
                  anonymous. Truncates gracefully for long addresses. */}
              <div className="rounded-xl border border-white/10 bg-black px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{t.account}</p>
                <p className="mt-0.5 truncate text-xs font-medium text-white" title={userEmail ?? undefined}>
                  {userEmail ?? t.accountGuest}
                </p>
              </div>

              {/* Field 2 — Provider status indicator. Green = LTX/Replicate
                  wired (render path can fire), red = unconfigured, neutral while
                  the names-only probe resolves. */}
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black px-3 py-2.5">
                <span className="text-xs font-semibold text-neutral-300">{t.providerLabel}</span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={`h-2 w-2 rounded-full ${
                      providerReady === null
                        ? 'bg-neutral-600'
                        : providerReady
                          ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]'
                          : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.75)]'
                    }`}
                  />
                  <span className={`text-[12px] font-medium ${providerReady === false ? 'text-red-300' : 'text-neutral-400'}`}>
                    {providerReady === null ? '…' : providerReady ? t.providerOnline : t.providerOffline}
                  </span>
                </span>
              </div>

              {/* Theme toggle relocated here from the header. */}
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black px-3 py-2.5">
                <span className="text-xs font-semibold text-neutral-300">{t.theme}</span>
                <ThemeToggle label={t.theme} />
              </div>

              {/* Library / History — every rendered film + generation lands in
                  the persisted history; this is the always-available entry to it. */}
              <Link
                href={`/${locale}/studio/history`}
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-black px-3 py-2.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-[#00D2FF]/50 hover:text-[#00D2FF]"
              >
                <History className="h-4 w-4" />
                {t.library}
              </Link>

              {/* Auth — Sign in + Sign up side by side when anonymous. The pages
                  already exist at /{locale}/login and /{locale}/signup. */}
              {!authed && (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href={`/${locale}/login`}
                    onClick={() => setMenuOpen(false)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#00D2FF]/40 bg-[#00D2FF]/10 px-3 py-2.5 text-xs font-semibold text-[#00D2FF] transition-colors hover:bg-[#00D2FF]/20"
                  >
                    <LogIn className="h-4 w-4" />
                    {t.login}
                  </Link>
                  <Link
                    href={`/${locale}/signup`}
                    onClick={() => setMenuOpen(false)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black px-3 py-2.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-[#00D2FF]/50 hover:text-[#00D2FF]"
                  >
                    <UserPlus className="h-4 w-4" />
                    {t.signup}
                  </Link>
                </div>
              )}

              {/* Sign out — authenticated users (was missing; every account-based
                  app needs a logout control). Clears the Supabase session, then
                  returns to a clean dashboard. */}
              {authed && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await createBrowserClient().auth.signOut();
                    } catch {
                      /* ignore — fall through to navigation */
                    }
                    setMenuOpen(false);
                    if (typeof window !== 'undefined') window.location.href = `/${locale}/dashboard`;
                  }}
                  className="inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-black px-3 py-2.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-white/25 hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                  {t.signOut}
                </button>
              )}

              {/* Delete account — Apple App Store Guideline 5.1.1(v): an
                  account-based app must let users delete their account from
                  within the app. Type-to-confirm modal lives in the component. */}
              {authed && <DeleteAccountButton locale={locale} />}

              {/* Legal + Support — App Store / public-launch requirement. The
                  pages already exist; this is the entry point to them. */}
              <div className="space-y-2 border-t border-white/10 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{t.legalLabel}</p>
                <Link
                  href={`/${locale}/privacy`}
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-black px-3 py-2.5 text-xs font-medium text-neutral-300 transition-colors hover:border-[#00D2FF]/40 hover:text-[#00D2FF]"
                >
                  <Shield className="h-4 w-4" /> {t.privacy}
                </Link>
                <Link
                  href={`/${locale}/terms`}
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-black px-3 py-2.5 text-xs font-medium text-neutral-300 transition-colors hover:border-[#00D2FF]/40 hover:text-[#00D2FF]"
                >
                  <FileText className="h-4 w-4" /> {t.terms}
                </Link>
                <Link
                  href={`/${locale}/support`}
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-black px-3 py-2.5 text-xs font-medium text-neutral-300 transition-colors hover:border-[#00D2FF]/40 hover:text-[#00D2FF]"
                >
                  <LifeBuoy className="h-4 w-4" /> {t.support}
                </Link>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Stripe-hosted wallet top-up — opens inline, redirects to Stripe on tier
          select. We NEVER render a card form ourselves. `variant="obsidian"`
          forces the pure-#000000 / white / cyan studio skin so the modal matches
          the OLED shell regardless of the user's light/dark theme. */}
      <WalletRefillModal
        open={walletOpen}
        locale={locale}
        variant="obsidian"
        onClose={() => setWalletOpen(false)}
      />
    </>
  );
}

// ─── Small presentational atoms ──────────────────────────────────────────────

function StatusDot({ state }: { state: StageState }) {
  if (state === 'done') return <CheckCircle2 className="w-3.5 h-3.5 text-[#00D2FF] shrink-0" />;
  if (state === 'active') return <Loader2 className="w-3.5 h-3.5 text-[#00D2FF] animate-spin shrink-0" />;
  if (state === 'failed') return <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  return <span className="w-3.5 h-3.5 rounded-full border border-white/15 shrink-0" />;
}

/**
 * A single cinematic scene tile. Shimmers in electric-cyan while the clip
 * renders, swaps to the live thumbnail the instant it lands (tap → hero
 * preview, hover → autoplay scrub), and shows a calm red state on failure.
 * Strict black / white / cyan palette; red reserved for the failed leg only.
 */
function FilmSceneCard({
  index,
  state,
  previewUrl,
  sceneWord,
  statusLabel,
  selected,
  onPreview,
}: {
  index: number;
  state: StageState;
  previewUrl?: string | null;
  sceneWord: string;
  statusLabel: string;
  selected: boolean;
  onPreview: (url: string) => void;
}) {
  const n = index + 1;
  const isDone = state === 'done';
  const isActive = state === 'active';
  const isFailed = state === 'failed';
  const hasClip = isDone && !!previewUrl;

  return (
    <button
      type="button"
      disabled={!hasClip}
      aria-label={`${sceneWord} ${n} — ${statusLabel}`}
      // Staggered entrance so the gallery assembles like a film strip, not a pop.
      style={{ animationDelay: `${Math.min(index, 5) * 70}ms` }}
      onClick={() => hasClip && onPreview(previewUrl as string)}
      onMouseEnter={(e) => {
        const v = e.currentTarget.querySelector('video') as HTMLVideoElement | null;
        if (v) void v.play().catch(() => {});
      }}
      onMouseLeave={(e) => {
        const v = e.currentTarget.querySelector('video') as HTMLVideoElement | null;
        if (v) {
          v.pause();
          v.currentTime = 0;
        }
      }}
      className={[
        'group relative aspect-video overflow-hidden rounded-xl border text-left transition-all duration-300 motion-safe:animate-fade-in',
        hasClip ? 'cursor-pointer' : 'cursor-default',
        isFailed
          ? 'border-red-500/30 bg-red-500/5'
          : isActive
            ? 'border-[#00D2FF]/40 bg-[#00D2FF]/[0.04] shadow-[0_0_18px_rgba(0,210,255,0.10)]'
            : isDone
              ? selected
                ? 'border-[#00D2FF] shadow-[0_0_18px_rgba(0,210,255,0.30)]'
                : 'border-white/10 bg-black hover:border-[#00D2FF]/60'
              : 'border-white/10 bg-white/[0.02]',
      ].join(' ')}
    >
      {hasClip ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={previewUrl as string}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity duration-300 group-hover:opacity-100"
        />
      ) : isActive ? (
        <span className="absolute inset-0 animate-shimmer bg-[linear-gradient(110deg,transparent_20%,rgba(0,210,255,0.10)_45%,rgba(0,210,255,0.18)_50%,rgba(0,210,255,0.10)_55%,transparent_80%)] bg-[length:200%_100%]" />
      ) : null}

      {/* Legibility floor for the overlaid labels. */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />

      {/* Scene ordinal. */}
      <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white/85 backdrop-blur-sm tabular-nums">
        {sceneWord} {n}
      </span>

      {/* Status corner glyph. */}
      <span className="absolute right-2 top-2">
        {isDone ? (
          <CheckCircle2 className="h-4 w-4 text-[#00D2FF] drop-shadow-[0_0_4px_rgba(0,210,255,0.6)]" />
        ) : isActive ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#00D2FF]" />
        ) : isFailed ? (
          <AlertTriangle className="h-4 w-4 text-red-400" />
        ) : (
          <span className="block h-3.5 w-3.5 rounded-full border border-white/25" />
        )}
      </span>

      {/* Play affordance over a finished clip. */}
      {hasClip && (
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/20 backdrop-blur-sm">
            <Play className="h-4 w-4 text-white" />
          </span>
        </span>
      )}

      {/* Footer status word. */}
      <span
        className={[
          'absolute inset-x-2 bottom-1.5 text-[11px] font-semibold tracking-wide',
          isFailed ? 'text-red-300' : isActive ? 'text-[#00D2FF]' : isDone ? 'text-white/80' : 'text-white/35',
        ].join(' ')}
      >
        {statusLabel}
      </span>
    </button>
  );
}

/**
 * The hero preview player. One premium surface for the finished master (cyan
 * "ready" ring + download), a tapped scene, or the honest first-scene fallback.
 * `key={url}` remounts the <video> on source change so a switch always reloads
 * cleanly. The master plays with sound on the user's press; scene/fallback
 * previews autoplay muted-loop for an instant glance.
 */
function FilmPreviewPlayer({
  url,
  isMaster,
  isScenePreview,
  headline,
  openLabel,
  shareLabel,
  copiedLabel,
}: {
  url: string;
  isMaster: boolean;
  isScenePreview: boolean;
  headline: string;
  openLabel: string;
  shareLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    // Native share sheet first (mobile/PWA); fall back to copying the link.
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    try {
      if (nav?.share) {
        await nav.share({ title: 'MyAvatar.ge — 30-second film', url });
        return;
      }
    } catch {
      /* user dismissed the share sheet — fall through to copy */
    }
    try {
      await nav?.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard blocked — the Download link remains the reliable path */
    }
  }, [url]);

  return (
    <div
      className={[
        'space-y-2.5 rounded-2xl border bg-black p-3 transition-all',
        isMaster ? 'border-[#00D2FF]/40 shadow-[0_0_30px_rgba(0,210,255,0.12)]' : 'border-white/10',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className={[
            'flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest',
            isMaster ? 'text-[#00D2FF]' : 'text-neutral-400',
          ].join(' ')}
        >
          {isMaster ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : isScenePreview ? (
            <Play className="h-3.5 w-3.5" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          )}
          <span className="truncate">{headline}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Share — only for the finished master; a scene preview isn't shareable yet. */}
          {isMaster && (
            <button
              type="button"
              onClick={handleShare}
              className={[
                'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-colors',
                copied
                  ? 'border-[#00D2FF]/60 text-[#00D2FF]'
                  : 'border-white/10 text-neutral-300 hover:border-[#00D2FF]/50 hover:text-[#00D2FF]',
              ].join(' ')}
            >
              {copied ? <Check className="h-3 w-3" /> : <Share2 className="h-3 w-3" />}
              {copied ? copiedLabel : shareLabel}
            </button>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[12px] font-semibold text-neutral-300 transition-colors hover:border-[#00D2FF]/50 hover:text-[#00D2FF]"
          >
            <Download className="h-3 w-3" /> {openLabel}
          </a>
        </div>
      </div>
      <div
        className={[
          'relative aspect-video w-full overflow-hidden rounded-xl bg-black ring-1',
          isMaster ? 'ring-[#00D2FF]/30' : 'ring-white/10',
        ].join(' ')}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          key={url}
          src={url}
          controls
          autoPlay={!isMaster}
          muted={!isMaster}
          loop={!isMaster}
          playsInline
          className="h-full w-full bg-black object-contain"
        />
      </div>
    </div>
  );
}

export default ConversationalFilmStudio;
