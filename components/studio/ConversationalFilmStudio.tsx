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
  Upload,
  Cpu,
  Clock,
  Send,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  X,
  ArrowRight,
  MessageSquare,
  LogIn,
} from 'lucide-react';
import { CreditBadge } from '@/components/ui/CreditBadge';
import { ThemeToggle } from '@/components/ThemeToggle';
import { formatGEL } from '@/lib/billing/gel';
import { FILM_SCENE_COUNT } from '@/lib/chat/filmPipeline';
import {
  driveFilmStudio,
  estimateFilmCostGel,
  type FilmStudioProgress,
  type FilmStudioMatrix,
  type FilmStudioPhase,
  type FilmLegClientStatus,
} from '@/lib/chat/filmStudioClient';

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

type DotState = 'pending' | 'active' | 'done' | 'failed' | 'skipped';
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
    chat: string;
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
    chat: 'ჩათი',
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
    chat: 'Chat',
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
    chat: 'Чат',
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

function legToDot(status: FilmLegClientStatus | undefined, active: boolean): DotState {
  if (status === 'succeeded') return 'done';
  if (status === 'failed') return 'failed';
  if (status === 'skipped') return 'skipped';
  if (active) return 'active';
  return 'pending';
}

interface DerivedStage {
  key: string;
  label: string;
  state: DotState;
  previewUrl?: string | null;
}

function deriveStages(progress: FilmStudioProgress | null, roleScene: string): DerivedStage[] {
  const m: FilmStudioMatrix | null = progress?.matrix ?? null;
  const phase: FilmStudioPhase = progress?.phase ?? 'idle';
  const rendering = phase === 'rendering' || phase === 'dispatching';
  const total = m?.sceneCount || m?.clips.length || FILM_SCENE_COUNT;

  const stages: DerivedStage[] = [];
  stages.push({
    key: 'storyboard',
    label: 'Storyboard — scene breakdown',
    state: m ? legToDot(m.storyboard, rendering) : phase === 'dispatching' ? 'active' : 'pending',
  });

  const clips = m ? [...m.clips].sort((a, b) => a.ordinal - b.ordinal) : [];
  for (let i = 0; i < total; i++) {
    const clip = clips[i];
    stages.push({
      key: `clip_${i + 1}`,
      label: `${roleScene} ${i + 1} / ${total}`,
      state: clip ? legToDot(clip.status, rendering) : rendering ? 'active' : 'pending',
      previewUrl: clip?.url ?? null,
    });
  }

  stages.push({
    key: 'stitch',
    label: 'Editor — stitching the final cut',
    state:
      phase === 'assembled'
        ? 'done'
        : phase === 'stitching'
          ? 'active'
          : m
            ? legToDot(m.stitch, false)
            : 'pending',
  });
  stages.push({
    key: 'score',
    label: 'Audio & Foley — scoring the film',
    state: m ? legToDot(m.audio, rendering) : 'pending',
  });
  return stages;
}

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

  const msgIdRef = useRef(1);
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    { id: 0, role: 'system', text: COPY[lang].welcome },
  ]);
  const nudgedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

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

  // Pull the server-authoritative onboarding state so the ledger reflects the
  // REAL remaining free-film count for this account — never a hardcoded promo.
  // Anonymous visitors (or an unapplied migration) simply keep the paid estimate.
  const refreshFreeFilms = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/profile/onboarding', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as { state?: { freeFilmsRemaining?: number | null } | null };
      const n = json?.state?.freeFilmsRemaining;
      if (typeof n === 'number') setFreeFilmsRemaining(n);
    } catch {
      /* fail-safe: leave null → show the real paid estimate */
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refreshFreeFilms();
  }, [refreshFreeFilms]);

  const estCost = useMemo(() => estimateFilmCostGel(), []);
  const isFreeFilm = typeof freeFilmsRemaining === 'number' && freeFilmsRemaining > 0;
  const filledCount = slots.filter(Boolean).length;
  const canSend = !driving && input.trim().length > 0;

  const handlePick = useCallback(
    async (idx: number, fileList: FileList | null) => {
      const file = fileList?.[0];
      if (!file) return;
      try {
        const dataUrl = await fileToDataUrl(file);
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
        } else {
          pushMessage('system', t.ready);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error.';
        setError(message);
        pushMessage('system', `${t.failed} ${message}`);
      } finally {
        setDriving(false);
        abortRef.current = null;
        // Re-sync the free-film count from the server — a successful render
        // consumes the founder slot, so the ledger should flip to the real
        // paid estimate for the next video. (No-op for anonymous users.)
        void refreshFreeFilms();
      }
    },
    [slots, locale, pushMessage, t.producing, t.ready, t.failed, refreshFreeFilms],
  );

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const userPrompt = input.trim();
    setInput('');
    pushMessage('user', userPrompt);
    void runReal(userPrompt);
  }, [canSend, input, pushMessage, runReal]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setDriving(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const stages = deriveStages(progress, lang === 'ka' ? 'სცენა' : lang === 'ru' ? 'Сцена' : 'Scene');
  const showTracker = driving || (progress != null && progress.phase !== 'idle');
  const finished = progress?.phase === 'assembled';

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#06070a] text-neutral-200 antialiased overflow-hidden">
      {/* ── Top app bar (folds in the former home chrome) ──────────────── */}
      <header
        className="shrink-0 sticky top-0 z-30 border-b border-neutral-900/80 bg-[#090a0f]/90 backdrop-blur-xl"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-2 px-4">
          <Link href={`/${locale}/dashboard`} className="group flex items-center gap-2.5 min-w-0">
            {/* 3D rocket brand mark — ambient pulse + a gentle tilt on hover for
                that premium SaaS feel, without leaning on a heavyweight 3D lib. */}
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-[0_0_18px_rgba(99,102,241,0.30)] transition-transform duration-500 ease-out group-hover:rotate-12 group-hover:scale-105">
              <span className="text-[15px] leading-none animate-pulse" aria-hidden="true">
                🚀
              </span>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-wide text-white">
                MyAvatar<span className="text-indigo-400">.ge</span>
              </span>
              <span className="block text-[9px] uppercase font-bold tracking-[0.18em] text-neutral-500">
                {t.brandSub}
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-1.5 shrink-0">
            <CreditBadge />
            <ThemeToggle label={t.theme} />
            <Link
              href={`/${locale}/chat`}
              aria-label={t.chat}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/40 px-2.5 py-1.5 text-xs font-semibold text-neutral-300 transition-colors hover:border-neutral-700 hover:text-white"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.chat}</span>
            </Link>
            {!isAuthenticated && (
              <Link
                href={`/${locale}/login`}
                aria-label={t.login}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-2.5 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-400/20"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.login}</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Conversational feed ────────────────────────────────────────── */}
      {/* no-scrollbar (hides the WebKit/Firefox track) + momentum scrolling so
          the feed glides natively inside the iOS/Android WebView app shell. */}
      <div
        className="flex-1 overflow-y-auto no-scrollbar"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        <div className="mx-auto max-w-2xl px-4 py-5 space-y-5">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={[
                  'max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-white text-black font-medium rounded-tr-sm shadow-md'
                    : 'bg-[#0d0e15] text-neutral-300 border border-neutral-900 rounded-tl-sm',
                ].join(' ')}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Identity ingestion widget — reference photos are OPTIONAL. */}
          <div className="rounded-2xl border border-neutral-900 bg-[#0d0e15]/60 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                {t.identityLabel}
              </span>
              <span className="text-[10px] text-neutral-600 font-medium">{t.identityHint}</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {[0, 1, 2].map((idx) => {
                const slot = slots[idx] ?? null;
                const role = t.roles[idx] ?? '';
                return (
                  <div
                    key={idx}
                    className="relative aspect-[3/4] rounded-xl border border-neutral-900 bg-black overflow-hidden group hover:border-neutral-700 transition-colors"
                  >
                    {slot ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={slot.dataUrl} alt={role} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => clearSlot(idx)}
                          disabled={driving}
                          aria-label="Remove photo"
                          className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-40"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center justify-center p-2 text-center h-full w-full">
                        <Upload className="w-4 h-4 text-neutral-600 group-hover:text-neutral-400 transition-colors mb-1" />
                        <span className="text-[10px] text-neutral-400 font-medium leading-tight">{role}</span>
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
          </div>

          {/* Honest GEL ledger — real estimate, metered server-side. */}
          <div className="rounded-2xl border border-neutral-900 bg-[#0d0e15]/40 p-4 space-y-3">
            <div className="grid grid-cols-3 gap-px bg-neutral-900/70 rounded-xl overflow-hidden border border-neutral-900">
              <LedgerCard icon={<Cpu className="w-3 h-3" />} label={t.scenes} value={`${FILM_SCENE_COUNT}`} unit="× 6s" />
              <LedgerCard icon={<Clock className="w-3 h-3" />} label={t.runtime} value="30" unit="sec" />
              <LedgerCard
                icon={
                  <span className="w-3 h-3 rounded-full bg-neutral-800 text-neutral-300 text-[9px] flex items-center justify-center font-bold">
                    ₾
                  </span>
                }
                label={t.cost}
                value={isFreeFilm ? '0.00' : formatGEL(estCost).replace(' ₾', '')}
                unit="GEL"
                accent
              />
            </div>
            {isFreeFilm ? (
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" />
                  {t.freeFilmBadge}
                </div>
                <p className="text-[10px] text-neutral-600 leading-relaxed">{t.freeFilmNote}</p>
              </div>
            ) : (
              <p className="text-[10px] text-neutral-600 leading-relaxed">{t.estNote}</p>
            )}
          </div>

          {/* Live per-leg progress tracker (real onProgress). */}
          {showTracker && (
            <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-4 space-y-3">
              <div className="flex items-center gap-3">
                {finished ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
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
                    className="ml-auto shrink-0 rounded-lg border border-neutral-800 bg-neutral-900/40 px-2.5 py-1 text-[11px] font-semibold text-neutral-400 hover:text-neutral-200"
                  >
                    {t.cancel}
                  </button>
                )}
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
                              ? 'text-rose-300'
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
                        className="ml-auto h-7 w-12 rounded object-cover border border-neutral-800"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Error card. */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/25 bg-rose-950/15 p-4 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Real master output. */}
          {masterUrl && (
            <div className="rounded-2xl border border-neutral-900 bg-[#0d0e15] p-3 space-y-2.5">
              <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-bold uppercase tracking-widest">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{t.masterReady}</span>
              </div>
              <div className="relative aspect-video w-full rounded-xl bg-black overflow-hidden border border-neutral-800">
                <video src={masterUrl} controls playsInline className="w-full h-full object-contain bg-black" />
              </div>
              <a
                href={masterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white"
              >
                {t.openMaster} <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* First-scene fallback when the editor could not host the master. */}
          {!masterUrl && previewUrl && (
            <div className="rounded-2xl border border-neutral-900 bg-[#0d0e15] p-3 space-y-2">
              <p className="text-[11px] text-amber-300/90">{t.firstScene}</p>
              <div className="relative aspect-video w-full rounded-xl bg-black overflow-hidden border border-neutral-800">
                <video src={previewUrl} controls playsInline className="w-full h-full object-contain bg-black" />
              </div>
            </div>
          )}

          <div ref={feedEndRef} />
        </div>
      </div>

      {/* ── Persistent bottom composer — App Store safe spacing ────────── */}
      <div
        className="shrink-0 border-t border-neutral-900/70 bg-[#06070a]/95 backdrop-blur-lg"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mx-auto max-w-2xl px-4 pt-3">
          <div className="flex items-end gap-2 rounded-2xl border border-neutral-800 bg-[#0d0e15] p-1.5 focus-within:border-neutral-700 transition-colors">
            <textarea
              rows={1}
              className="flex-1 bg-transparent text-[13px] px-2.5 py-2 focus:outline-none placeholder-neutral-700 resize-none text-white max-h-32"
              placeholder={driving ? t.placeholderBusy : t.placeholder}
              disabled={driving}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label={t.sendAria}
              className={[
                'p-2.5 rounded-xl transition-all shrink-0',
                !canSend
                  ? 'bg-neutral-900 text-neutral-600 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-neutral-200 shadow-md active:scale-95',
              ].join(' ')}
            >
              {driving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          {/* Live tariff / promo readout — driven by the same server-authoritative
              freeFilmsRemaining state, so it always tells the truth about cost. */}
          <p className="mt-2 text-center text-[11px] font-semibold">
            {isFreeFilm ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                {t.promoLimit}
              </span>
            ) : (
              <span className="text-neutral-300">
                {t.tariffLabel} · {formatGEL(estCost)}
              </span>
            )}
          </p>
          <p className="mt-1 text-center text-[10px] text-neutral-600">{t.signinNote}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Small presentational atoms ──────────────────────────────────────────────

function LedgerCard({
  icon,
  label,
  value,
  unit,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className="p-3 bg-[#090a0f] flex flex-col justify-center">
      <div className="flex items-center gap-1.5 text-neutral-600 mb-1">
        {icon}
        <span className="text-[9px] uppercase font-bold tracking-wider truncate">{label}</span>
      </div>
      <div className={`text-sm font-bold tracking-tight ${accent ? 'text-white' : 'text-neutral-200'}`}>
        {value} <span className="text-[11px] font-normal text-neutral-600">{unit}</span>
      </div>
    </div>
  );
}

function StatusDot({ state }: { state: DotState }) {
  if (state === 'done') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  if (state === 'active') return <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />;
  if (state === 'failed') return <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
  return <span className="w-3.5 h-3.5 rounded-full border border-neutral-700 shrink-0" />;
}

export default ConversationalFilmStudio;
