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
} from 'lucide-react';
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
} from '@/lib/chat/filmStudioClient';
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

export function ConversationalFilmStudio({
  locale = 'ka',
  isAuthenticated = false,
}: ConversationalFilmStudioProps) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [slots, setSlots] = useState<(Slot | null)[]>([null, null, null]);
  const [input, setInput] = useState('');
  const [driving, setDriving] = useState(false);
  const [progress, setProgress] = useState<FilmStudioProgress | null>(null);
  const [masterUrl, setMasterUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const msgIdRef = useRef(1);
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    { id: 0, role: 'system', text: COPY[lang].welcome },
  ]);
  const nudgedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
    if (!isAuthenticated) return;
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
  }, [isAuthenticated]);

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
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/credits/balance', { cache: 'no-store', credentials: 'include' });
      if (!res.ok) return;
      const json = (await res.json()) as { balance?: number | null };
      if (typeof json?.balance === 'number') setBalanceGel(json.balance);
    } catch {
      /* fail-safe: leave null → chip shows 0.00 ₾ */
    }
  }, [isAuthenticated]);

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

  const runReal = useCallback(
    async (userPrompt: string) => {
      setError(null);
      setMasterUrl(null);
      setPreviewUrl(null);
      setProgress({ phase: 'dispatching', matrix: null, message: '', masterUrl: null, previewUrl: null });
      setDriving(true);
      pushMessage('system', t.producing);
      // PostHog funnel entry — credits is 0 on a free founder slot, else the
      // real GEL estimate. safeCapture is a no-op without a key, never throws.
      const billedGel = isFreeFilm ? 0 : estCost;
      const startedAt = Date.now();
      analytics.generationStarted('film', billedGel);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await driveFilmStudio({
          prompt: userPrompt,
          referenceImages: slots.filter((s): s is Slot => !!s).map((s) => s.dataUrl),
          locale,
          signal: ctrl.signal,
          onProgress: (p) => setProgress(p),
        });
        setMasterUrl(res.masterUrl);
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
    [slots, locale, pushMessage, t.producing, t.ready, t.failed, refreshFreeFilms, refreshBalance, estCost, isFreeFilm],
  );

  const handleSend = useCallback(() => {
    if (!canSend) return;
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
    pushMessage('user', userPrompt);
    void runReal(userPrompt);
  }, [canSend, input, pushMessage, runReal]);

  // Toggle native dictation. On START we explicitly probe mic permission via
  // getUserMedia (the clean Safari/iOS path): a denied promise surfaces the
  // localized "enable in settings" toast instead of a silent no-op. We snapshot
  // the current input as the append base and set the recognizer locale from the
  // active UI language (ka-GE / ru-RU / en-US) right before starting.
  const toggleRecording = useCallback(async () => {
    const rec = recognitionRef.current;
    if (!rec || !speechSupported) {
      setMicNotice(t.voiceUnsupported);
      return;
    }
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
      rec.lang = lang === 'ka' ? 'ka-GE' : lang === 'ru' ? 'ru-RU' : 'en-US';
      rec.start();
      setIsRecording(true);
    } catch {
      // .start() throws if already started — keep the UI honest.
      setIsRecording(false);
    }
  }, [speechSupported, isRecording, input, lang, t.voiceUnsupported, t.micDenied]);

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
  const pipeline = summarizeFilmPipeline(progress, roleSceneLabel);
  const stages = pipeline.stages;
  const showTracker = driving || (progress != null && progress.phase !== 'idle');
  const finished = pipeline.done;

  // First-run starter chips: shown only on the pristine canvas — before the user
  // has typed/sent anything and while nothing is rendering or rendered — so they
  // guide the empty state without ever cluttering an active conversation.
  const hasUserMessage = messages.some((m) => m.role === 'user');
  const showStarters =
    !hasUserMessage && !showTracker && !driving && !masterUrl && !previewUrl && !error;

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
          {/* Compact identity strip — reference photos are OPTIONAL. A slim row
              of small thumbnails so the chat keeps the lion's share of the view. */}
          <div className="rounded-2xl border border-white/10 bg-black p-2.5 sm:p-3">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {[0, 1, 2].map((idx) => {
                  const slot = slots[idx] ?? null;
                  const role = t.roles[idx] ?? '';
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
                <p className="truncate text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  {t.identityLabel}
                </p>
                <p className="text-[10px] text-neutral-600">{t.identityHint}</p>
              </div>
            </div>
          </div>

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={[
                  'max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed',
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
              <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-neutral-600">
                {t.starterHint}
              </p>
              <div className="flex flex-col gap-2">
                {filmStarterPrompts(locale).map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => fillFromStarter(prompt)}
                    className="group flex items-center gap-2.5 rounded-2xl border border-white/10 bg-black px-3.5 py-3 text-left text-[13px] leading-snug text-neutral-300 transition-colors hover:border-[#00D2FF]/40 hover:text-white active:scale-[0.99] motion-reduce:active:scale-100 touch-manipulation"
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
                {finished ? (
                  <CheckCircle2 className="w-5 h-5 text-[#00D2FF] shrink-0" />
                ) : (
                  <Loader2 className="w-5 h-5 text-[#00D2FF] animate-spin shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    {finished ? t.pipelineDone : t.pipelineRunning}
                  </span>
                  <p className="text-xs text-neutral-300 mt-0.5">{progress?.message || 'Working…'}</p>
                </div>
                {driving && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="ml-auto shrink-0 rounded-lg border border-white/10 bg-black px-2.5 py-1 text-[11px] font-semibold text-neutral-400 hover:text-white"
                  >
                    {t.cancel}
                  </button>
                )}
              </div>
              {/* Whole-pipeline progress: a thin cyan bar + scene/percent readout,
                  both driven by the unit-tested summarizeFilmPipeline metrics. */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider tabular-nums">
                  <span className="text-neutral-500">
                    {pipeline.scenesRendered} / {pipeline.totalScenes} {roleSceneLabel}
                  </span>
                  <span className={pipeline.failed ? 'text-red-300' : 'text-[#00D2FF]'}>{pipeline.percent}%</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={[
                      'h-full rounded-full transition-[width] duration-500 ease-out',
                      pipeline.failed ? 'bg-red-400/80' : 'bg-[#00D2FF] shadow-[0_0_10px_rgba(0,210,255,0.5)]',
                    ].join(' ')}
                    style={{ width: `${pipeline.percent}%` }}
                  />
                </div>
              </div>
              <ul className="space-y-1.5">
                {stages.map((s) => (
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
                    {s.previewUrl && (
                      <video
                        src={s.previewUrl}
                        muted
                        playsInline
                        className="ml-auto h-7 w-12 rounded object-cover border border-white/10"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Error card — restrained red is kept ONLY here so a failure always
              reads unambiguously as an error (a deliberate exception to the
              black/white/cyan brand palette). */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-xs text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Real master output. */}
          {masterUrl && (
            <div className="rounded-2xl border border-white/10 bg-black p-3 space-y-2.5">
              <div className="flex items-center gap-2 text-[#00D2FF] text-[10px] font-bold uppercase tracking-widest">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{t.masterReady}</span>
              </div>
              <div className="relative aspect-video w-full rounded-xl bg-black overflow-hidden border border-white/10">
                <video src={masterUrl} controls playsInline className="w-full h-full object-contain bg-black" />
              </div>
              <a
                href={masterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-neutral-300 hover:text-[#00D2FF]"
              >
                {t.openMaster} <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* First-scene fallback when the editor could not host the master. */}
          {!masterUrl && previewUrl && (
            <div className="rounded-2xl border border-white/10 bg-black p-3 space-y-2">
              <p className="text-[11px] text-neutral-400">{t.firstScene}</p>
              <div className="relative aspect-video w-full rounded-xl bg-black overflow-hidden border border-white/10">
                <video src={previewUrl} controls playsInline className="w-full h-full object-contain bg-black" />
              </div>
            </div>
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
              className="mb-2 rounded-xl border border-white/10 bg-black px-3 py-2 text-center text-[11px] text-neutral-300"
            >
              {micNotice}
            </div>
          )}
          {/* Prompt + the big "Generate video" CTA in ONE focused conversion bar.
              The bar lights cyan on focus; the CTA turns full electric-cyan when the
              server confirms a free founder slot, otherwise it stays clean white and
              the existing /api/video/assemble billing gate charges normally. */}
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-black p-2 transition-all focus-within:border-[#00D2FF] focus-within:shadow-[0_0_15px_rgba(0,210,255,0.15)]">
            <textarea
              ref={textareaRef}
              rows={1}
              className="flex-1 bg-transparent text-[13px] px-2.5 py-2 focus:outline-none placeholder-neutral-600 resize-none text-white max-h-32"
              placeholder={driving ? t.placeholderBusy : t.placeholder}
              disabled={driving}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {/* Native Voice-to-Text toggle, docked just before Send. Minimalist:
                muted gray when idle, pulse Electric-Cyan while live-transcribing.
                Only rendered when the browser exposes the Web Speech API. */}
            {speechSupported && (
              <button
                type="button"
                onClick={toggleRecording}
                disabled={driving}
                aria-pressed={isRecording}
                aria-label={isRecording ? t.micStop : t.micStart}
                title={isRecording ? t.micStop : t.micStart}
                className={[
                  'inline-flex h-10 w-10 items-center justify-center rounded-full transition-all shrink-0 touch-manipulation',
                  driving
                    ? 'text-neutral-700 cursor-not-allowed'
                    : isRecording
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
                'inline-flex h-10 w-10 items-center justify-center rounded-full transition-all shrink-0 touch-manipulation',
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
          {/* Live tariff / promo readout — driven by the same server-authoritative
              freeFilmsRemaining state, so it always tells the truth about cost. */}
          <p className="mt-2 text-center text-[11px] font-semibold">
            {isFreeFilm ? (
              <span className="inline-flex items-center gap-1.5 text-[#00D2FF]">
                <CheckCircle2 className="h-3 w-3" />
                {t.promoLimit}
              </span>
            ) : (
              <span className="text-white">
                {t.tariffLabel} · {formatGEL(estCost)}
              </span>
            )}
          </p>
          <p className="mt-1 text-center text-[10px] text-neutral-600">
            {FILM_SCENE_COUNT} × 6s · {t.signinNote}
          </p>
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
            <div className="flex flex-col gap-2 p-4">
              {/* Field 1 — Account details. Non-interactive identity line: the
                  authenticated email, or the localized "Guest" label when
                  anonymous. Truncates gracefully for long addresses. */}
              <div className="rounded-xl border border-white/10 bg-black px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{t.account}</p>
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
                  <span className={`text-[11px] font-medium ${providerReady === false ? 'text-red-300' : 'text-neutral-400'}`}>
                    {providerReady === null ? '…' : providerReady ? t.providerOnline : t.providerOffline}
                  </span>
                </span>
              </div>

              {/* Theme toggle relocated here from the header. */}
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black px-3 py-2.5">
                <span className="text-xs font-semibold text-neutral-300">{t.theme}</span>
                <ThemeToggle label={t.theme} />
              </div>
              {!isAuthenticated && (
                <Link
                  href={`/${locale}/login`}
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex items-center gap-2.5 rounded-xl border border-[#00D2FF]/40 bg-[#00D2FF]/10 px-3 py-2.5 text-xs font-semibold text-[#00D2FF] transition-colors hover:bg-[#00D2FF]/20"
                >
                  <LogIn className="h-4 w-4" />
                  {t.login}
                </Link>
              )}
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

export default ConversationalFilmStudio;
