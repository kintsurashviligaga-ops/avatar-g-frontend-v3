'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Zap, Sparkles, Monitor, Smartphone, Square, RectangleHorizontal,
  Globe, Sun, Moon, User, BarChart3, AlertTriangle, X, Loader2, Check, History,
  type LucideIcon,
} from 'lucide-react';
import { creditsToGel } from '@/lib/credits/pricing';
import { useTheme } from '@/lib/theme/ThemeContext';
import ReferralPanel from '@/components/dashboard/ReferralPanel';

/**
 * Settings — top-level user preferences surface.
 *
 * Six sections wired to the REAL systems already in the app:
 *   • Rendering mode    → localStorage (consumed by future render-quality gating)
 *   • Aspect ratio       → localStorage (consumed by film/video composers)
 *   • Language          → NEXT_LOCALE cookie + router.push (same pattern as GlobalNavbar)
 *   • Theme             → ThemeContext (data-theme attr + .dark class)
 *   • Profile + Usage    → /api/credits/balance (authenticated GET)
 *   • Delete Account    → /api/account/delete (Apple §5.1.1(v) compliant flow)
 *
 * No fakes, no mocks: every control either persists locally or hits a real endpoint.
 * Animations use Framer Motion with `transform`-only properties (hardware-accelerated,
 * no layout reflow).
 */

type Locale = 'ka' | 'en' | 'ru';
interface Copy {
  pageTitle: string; pageSubtitle: string;
  renderMode: { title: string; fast: string; fastDesc: string; ultra: string; ultraDesc: string };
  aspect: { title: string; subtitle: string };
  language: { title: string; subtitle: string };
  theme: { title: string; dark: string; light: string; subtitle: string };
  profile: { title: string; status: string; signedIn: string; signedOut: string };
  usage: { title: string; subtitle: string; loading: string; failed: string; credits: string; resets: string };
  history: { title: string; subtitle: string; loading: string; empty: string; credits: string };
  danger: {
    title: string; description: string; cta: string;
    modalTitle: string; modalBody: string; cancel: string; confirm: string;
    deleting: string; deleted: string; failed: string;
  };
}

const COPY: Record<Locale, Copy> = {
  ka: {
    pageTitle: 'პარამეტრები', pageSubtitle: 'ანგარიში, რენდერი და ენა — ერთ ადგილზე.',
    renderMode: {
      title: 'რენდერის რეჟიმი',
      fast: 'სწრაფი / სტანდარტული', fastDesc: 'სწრაფი შედეგი — სტანდარტული ხარისხი.',
      ultra: 'ულტრა-კინემატოგრაფიული', ultraDesc: 'მაქსიმალური ვიზუალური ხარისხი — ცოტათი მეტი ხანი.',
    },
    aspect: { title: 'რენდერის შეფარდება', subtitle: 'სტანდარტული ფორმატი ახალი ვიდეოებისთვის.' },
    language: { title: 'ენა', subtitle: 'ცვლის ინტერფეისის ენას მთელი აპლიკაციისთვის.' },
    theme: { title: 'თემა', subtitle: 'მუქი ან ღია გარეგნობა.', dark: 'მუქი', light: 'ღია' },
    profile: { title: 'პროფილი', status: 'სტატუსი', signedIn: 'შესული ხართ', signedOut: 'შესული არ ხართ' },
    usage: {
      title: 'API მოხმარება და ბალანსი', subtitle: 'მიმდინარე პერიოდის სტატისტიკა.',
      loading: 'იტვირთება…', failed: 'მონაცემები ვერ მოვიდა.', credits: 'კრედიტი', resets: 'განახლდება',
    },
    history: { title: 'ისტორია', subtitle: 'ბოლო 10 ტრანზაქცია.', loading: 'იტვირთება…', empty: 'ჯერ არ არის ტრანზაქცია.', credits: 'კრედიტი' },
    danger: {
      title: 'საშიში ზონა',
      description: 'წაშალე ანგარიში და ყველა მონაცემი სამუდამოდ. ეს მოქმედება შეუქცევადია.',
      cta: 'ანგარიშის წაშლა',
      modalTitle: 'დაადასტურე წაშლა',
      modalBody: 'ნამდვილად გინდა შენი ანგარიშის წაშლა? დაიკარგება ყველა ვიდეო, სურათი, ხმოვანი მონაცემი და ჩატის ისტორია. ეს მოქმედება ვერ დაბრუნდება.',
      cancel: 'გაუქმება', confirm: 'წავშალო',
      deleting: 'იშლება…', deleted: 'ანგარიში წაშლილია. გადამისამართება…', failed: 'წაშლა ვერ შესრულდა.',
    },
  },
  en: {
    pageTitle: 'Settings', pageSubtitle: 'Account, rendering and language — all in one place.',
    renderMode: {
      title: 'Rendering Mode',
      fast: 'Fast / Standard', fastDesc: 'Quicker results at standard quality.',
      ultra: 'Ultra-Cinematic', ultraDesc: 'Highest visual fidelity — slightly longer renders.',
    },
    aspect: { title: 'Render Aspect Ratio', subtitle: 'Default format for new videos.' },
    language: { title: 'Language', subtitle: 'Switches the interface language across the app.' },
    theme: { title: 'Theme', subtitle: 'Dark or light appearance.', dark: 'Dark', light: 'Light' },
    profile: { title: 'Profile', status: 'Status', signedIn: 'Signed in', signedOut: 'Signed out' },
    usage: {
      title: 'API Usage & Balance', subtitle: 'Current period statistics.',
      loading: 'Loading…', failed: 'Could not load.', credits: 'credits', resets: 'Resets',
    },
    history: { title: 'History', subtitle: 'Your last 10 transactions.', loading: 'Loading…', empty: 'No transactions yet.', credits: 'credits' },
    danger: {
      title: 'Danger Zone',
      description: 'Permanently delete your account and all data. This cannot be undone.',
      cta: 'Delete account',
      modalTitle: 'Confirm deletion',
      modalBody: 'Are you absolutely sure? All videos, images, voice data and chat history will be permanently removed. This action cannot be undone.',
      cancel: 'Cancel', confirm: 'Delete',
      deleting: 'Deleting…', deleted: 'Account deleted. Redirecting…', failed: 'Could not delete.',
    },
  },
  ru: {
    pageTitle: 'Настройки', pageSubtitle: 'Аккаунт, рендер и язык — в одном месте.',
    renderMode: {
      title: 'Режим рендеринга',
      fast: 'Быстрый / Стандарт', fastDesc: 'Быстрее, стандартное качество.',
      ultra: 'Ультра-кинематографичный', ultraDesc: 'Максимальное качество — рендер чуть дольше.',
    },
    aspect: { title: 'Соотношение сторон', subtitle: 'Формат по умолчанию для новых видео.' },
    language: { title: 'Язык', subtitle: 'Меняет язык интерфейса.' },
    theme: { title: 'Тема', subtitle: 'Тёмное или светлое оформление.', dark: 'Тёмная', light: 'Светлая' },
    profile: { title: 'Профиль', status: 'Статус', signedIn: 'Вы вошли', signedOut: 'Не вошли в аккаунт' },
    usage: {
      title: 'Использование и баланс', subtitle: 'Статистика за текущий период.',
      loading: 'Загрузка…', failed: 'Не удалось загрузить.', credits: 'кредитов', resets: 'Обновится',
    },
    history: { title: 'История', subtitle: 'Последние 10 транзакций.', loading: 'Загрузка…', empty: 'Пока нет транзакций.', credits: 'кред.' },
    danger: {
      title: 'Опасная зона',
      description: 'Удалить аккаунт и все данные навсегда. Действие необратимо.',
      cta: 'Удалить аккаунт',
      modalTitle: 'Подтвердите удаление',
      modalBody: 'Вы абсолютно уверены? Все видео, изображения, голосовые данные и история чата будут удалены безвозвратно.',
      cancel: 'Отмена', confirm: 'Удалить',
      deleting: 'Удаление…', deleted: 'Аккаунт удалён. Перенаправление…', failed: 'Не удалось удалить.',
    },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.35, ease: 'easeOut' } }),
};

const ASPECTS = [
  { id: '16:9' as const, label: '16:9', sublabel: { ka: 'ფართო (YouTube)', en: 'Widescreen (YouTube)', ru: 'Широкоэкранный (YouTube)' }, Icon: Monitor },
  { id: '9:16' as const, label: '9:16', sublabel: { ka: 'ვერტიკალური (Reels/TikTok)', en: 'Vertical (Reels/TikTok)', ru: 'Вертикальный (Reels/TikTok)' }, Icon: Smartphone },
  { id: '1:1' as const,  label: '1:1',  sublabel: { ka: 'კვადრატი (Instagram)', en: 'Square (Instagram)', ru: 'Квадрат (Instagram)' }, Icon: Square },
  { id: '4:3' as const,  label: '4:3',  sublabel: { ka: 'სტანდარტული', en: 'Standard', ru: 'Стандартный' }, Icon: RectangleHorizontal },
];

const LANGS: { code: Locale; name: string; native: string }[] = [
  { code: 'ka', name: 'Georgian', native: 'ქართული' },
  { code: 'en', name: 'English',  native: 'English' },
  { code: 'ru', name: 'Russian',  native: 'Русский' },
];

type RenderMode = 'fast' | 'ultra';
type Aspect = '16:9' | '9:16' | '1:1' | '4:3';

const LS_RENDER_MODE = 'myavatar.settings.renderMode';
const LS_ASPECT = 'myavatar.settings.aspect';

export function SettingsView({ locale }: { locale: string }) {
  const loc = (['ka', 'en', 'ru'] as const).includes(locale as Locale) ? (locale as Locale) : 'ka';
  const t = COPY[loc];

  return (
    <div className="min-h-screen bg-app-bg text-app-text">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-12">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="mb-8 flex items-center gap-3"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-app-elevated ring-1 ring-app-border/40">
            <Settings size={20} className="text-app-accent" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{t.pageTitle}</h1>
            <p className="mt-0.5 text-sm text-app-muted">{t.pageSubtitle}</p>
          </div>
        </motion.header>

        <motion.div initial="hidden" animate="show" className="space-y-5">
          <motion.div variants={fadeUp} custom={0}><RenderingModeSection t={t.renderMode} /></motion.div>
          <motion.div variants={fadeUp} custom={1}><AspectRatioSection t={t.aspect} loc={loc} /></motion.div>
          <motion.div variants={fadeUp} custom={2}><LanguageSection t={t.language} loc={loc} /></motion.div>
          <motion.div variants={fadeUp} custom={3}><ThemeSection t={t.theme} /></motion.div>
          <motion.div variants={fadeUp} custom={4}><ProfileSection t={t.profile} /></motion.div>
          <motion.div variants={fadeUp} custom={5}><ApiUsageSection t={t.usage} loc={loc} /></motion.div>
          <motion.div variants={fadeUp} custom={6}><CreditHistorySection t={t.history} loc={loc} /></motion.div>
          {/* PHASE 4 Task 3 — Invite friends (reuses the existing self-contained ReferralPanel). */}
          <motion.div variants={fadeUp} custom={7}><ReferralPanel isAuthenticated /></motion.div>
          <motion.div variants={fadeUp} custom={8}><DangerZoneSection t={t.danger} loc={loc} /></motion.div>
        </motion.div>
      </div>
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-app-elevated/60 p-5 ring-1 ring-app-border/40 backdrop-blur-sm md:p-6 ${className}`}>
      {children}
    </section>
  );
}

function CardHeader({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle?: string }) {
  return (
    <header className="mb-4 flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-accent/10 ring-1 ring-app-accent/20">
        <Icon size={16} className="text-app-accent" />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight md:text-lg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-app-muted md:text-sm">{subtitle}</p>}
      </div>
    </header>
  );
}

function ToggleSwitch({ checked, onChange, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 ${checked ? 'bg-app-accent' : 'bg-app-bg ring-1 ring-app-border/60'}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 32 }}
        className={`inline-block h-5 w-5 rounded-full bg-white shadow ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}

// ── 1. Rendering Mode ─────────────────────────────────────────────────────────

function RenderingModeSection({ t }: { t: Copy['renderMode'] }) {
  const [mode, setMode] = useState<RenderMode>('fast');
  useEffect(() => {
    const v = (typeof window !== 'undefined' ? localStorage.getItem(LS_RENDER_MODE) : null) as RenderMode | null;
    if (v === 'fast' || v === 'ultra') setMode(v);
  }, []);
  const set = useCallback((m: RenderMode) => { setMode(m); try { localStorage.setItem(LS_RENDER_MODE, m); } catch {} }, []);
  const ultra = mode === 'ultra';
  return (
    <Card>
      <CardHeader icon={ultra ? Sparkles : Zap} title={t.title} />
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium md:text-base">{ultra ? t.ultra : t.fast}</div>
          <p className="mt-1 text-xs text-app-muted md:text-sm">{ultra ? t.ultraDesc : t.fastDesc}</p>
        </div>
        <ToggleSwitch checked={ultra} onChange={(v) => set(v ? 'ultra' : 'fast')} ariaLabel={t.title} />
      </div>
    </Card>
  );
}

// ── 2. Aspect Ratio Presets ───────────────────────────────────────────────────

function AspectRatioSection({ t, loc }: { t: Copy['aspect']; loc: Locale }) {
  const [aspect, setAspect] = useState<Aspect>('16:9');
  useEffect(() => {
    const v = (typeof window !== 'undefined' ? localStorage.getItem(LS_ASPECT) : null) as Aspect | null;
    if (v && ASPECTS.some((a) => a.id === v)) setAspect(v);
  }, []);
  const set = useCallback((a: Aspect) => { setAspect(a); try { localStorage.setItem(LS_ASPECT, a); } catch {} }, []);
  return (
    <Card>
      <CardHeader icon={RectangleHorizontal} title={t.title} subtitle={t.subtitle} />
      <div className="grid grid-cols-2 gap-3">
        {ASPECTS.map((opt) => {
          const active = aspect === opt.id;
          const Icon = opt.Icon;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => set(opt.id)}
              aria-pressed={active}
              className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                active
                  ? 'border-app-accent/60 bg-app-accent/10 text-app-text'
                  : 'border-app-border/40 bg-app-bg/40 text-app-text hover:border-app-border-hover hover:bg-app-bg/60'
              }`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-app-accent/20 text-app-accent' : 'bg-app-elevated text-app-muted'}`}>
                <Icon size={16} />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{opt.label}</div>
                <div className="truncate text-[11px] text-app-muted md:text-xs">{opt.sublabel[loc]}</div>
              </div>
              {active && <Check size={14} className="ml-auto text-app-accent" />}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ── 3. Language ───────────────────────────────────────────────────────────────

function LanguageSection({ t, loc }: { t: Copy['language']; loc: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const switchLocale = useCallback((code: Locale) => {
    if (code === loc) return;
    document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000; SameSite=Lax`;
    const segments = pathname.split('/');
    if (segments.length > 1 && (['ka', 'en', 'ru'] as const).includes((segments[1] ?? '') as Locale)) {
      segments[1] = code;
      router.push(segments.join('/') || '/');
    } else {
      router.push(`/${code}${pathname}`);
    }
  }, [loc, pathname, router]);
  return (
    <Card>
      <CardHeader icon={Globe} title={t.title} subtitle={t.subtitle} />
      <div className="flex flex-wrap gap-2">
        {LANGS.map((l) => {
          const active = l.code === loc;
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => switchLocale(l.code)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-app-accent text-app-bg shadow-sm'
                  : 'bg-app-bg/40 text-app-text ring-1 ring-app-border/40 hover:bg-app-bg/60'
              }`}
            >
              <span className="text-[11px] font-mono uppercase opacity-70">{l.code}</span>
              <span>{l.native}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ── 4. Theme ──────────────────────────────────────────────────────────────────

function ThemeSection({ t }: { t: Copy['theme'] }) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = theme === 'dark';
  return (
    <Card>
      <CardHeader icon={mounted && isDark ? Moon : Sun} title={t.title} subtitle={t.subtitle} />
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-medium md:text-base">{mounted ? (isDark ? t.dark : t.light) : t.dark}</div>
        <ToggleSwitch checked={!isDark} onChange={toggleTheme} ariaLabel={t.title} />
      </div>
    </Card>
  );
}

// ── 5. Profile ────────────────────────────────────────────────────────────────

function ProfileSection({ t }: { t: Copy['profile'] }) {
  // Use the credits/balance endpoint as a lightweight signed-in probe: 200 means
  // there's an authenticated session, anything else (401 etc) means signed out.
  // Avoids inventing a dedicated /me endpoint that doesn't exist yet.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/credits/balance', { credentials: 'include' });
        if (!cancelled) setSignedIn(r.ok);
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return (
    <Card>
      <CardHeader icon={User} title={t.title} />
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-app-muted">{t.status}</div>
          <div className="mt-0.5 flex items-center gap-2 text-sm font-medium md:text-base">
            {signedIn === null ? (
              <Loader2 size={14} className="animate-spin text-app-muted" />
            ) : signedIn ? (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                <span>{t.signedIn}</span>
              </>
            ) : (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-app-muted/60" />
                <span className="text-app-muted">{t.signedOut}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── 6. API Usage & Balance ────────────────────────────────────────────────────

interface CreditsResponse { balance: number; monthlyAllowance: number; resetAt: string | null }

function ApiUsageSection({ t, loc }: { t: Copy['usage']; loc: Locale }) {
  const [data, setData] = useState<CreditsResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/credits/balance', { credentials: 'include' });
        if (!r.ok) { if (!cancelled) setState('failed'); return; }
        const j = (await r.json()) as CreditsResponse;
        if (!cancelled) { setData(j); setState('ok'); }
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pct = useMemo(() => {
    if (!data || !data.monthlyAllowance) return 0;
    const used = Math.max(0, data.monthlyAllowance - data.balance);
    return Math.min(100, Math.round((used / data.monthlyAllowance) * 100));
  }, [data]);

  const resetLabel = useMemo(() => {
    if (!data?.resetAt) return null;
    try {
      const d = new Date(data.resetAt);
      return d.toLocaleDateString(loc === 'ka' ? 'ka-GE' : loc === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
    } catch { return null; }
  }, [data, loc]);

  return (
    <Card>
      <CardHeader icon={BarChart3} title={t.title} subtitle={t.subtitle} />
      {state === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-app-muted">
          <Loader2 size={14} className="animate-spin" /> {t.loading}
        </div>
      )}
      {state === 'failed' && <div className="text-sm text-app-muted">{t.failed}</div>}
      {state === 'ok' && data && (
        <>
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-medium">{data.balance.toLocaleString()} / {data.monthlyAllowance.toLocaleString()} {t.credits}</span>
            <span className="tabular-nums text-app-muted">{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-app-bg/60 ring-1 ring-app-border/40">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="h-full bg-app-accent"
            />
          </div>
          {resetLabel && <p className="mt-3 text-xs text-app-muted">{t.resets}: <span className="text-app-text">{resetLabel}</span></p>}
        </>
      )}
    </Card>
  );
}

// ── 7. Credit history (last 10 transactions) ──────────────────────────────────

interface HistoryItem { action: string; creditsDelta: number; createdAt: string }
const ACTION_LABEL: Record<string, { emoji: string; ka: string; en: string; ru: string }> = {
  video: { emoji: '🎬', ka: 'ვიდეო', en: 'Video', ru: 'Видео' },
  music: { emoji: '🎵', ka: 'მუსიკა', en: 'Music', ru: 'Музыка' },
  image: { emoji: '🖼', ka: 'სურათი', en: 'Image', ru: 'Фото' },
  avatar: { emoji: '🎭', ka: 'ავატარი', en: 'Avatar', ru: 'Аватар' },
  remix: { emoji: '🎞', ka: 'რემიქსი', en: 'Remix', ru: 'Ремикс' },
  topup: { emoji: '💳', ka: 'შევსება', en: 'Top-up', ru: 'Пополнение' },
};

function CreditHistorySection({ t, loc }: { t: Copy['history']; loc: Locale }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'empty'>('loading');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/credits/history?limit=10', { credentials: 'include', cache: 'no-store' });
        const j = (await r.json().catch(() => ({}))) as { items?: HistoryItem[] };
        const list = Array.isArray(j.items) ? j.items : [];
        if (!cancelled) { setItems(list); setState(list.length ? 'ok' : 'empty'); }
      } catch {
        if (!cancelled) { setItems([]); setState('empty'); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(loc === 'ka' ? 'ka-GE' : loc === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
    } catch { return iso.slice(0, 10); }
  };

  return (
    <Card>
      <CardHeader icon={History} title={t.title} subtitle={t.subtitle} />
      {state === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-app-muted"><Loader2 size={14} className="animate-spin" /> {t.loading}</div>
      )}
      {state === 'empty' && <div className="text-sm text-app-muted">{t.empty}</div>}
      {state === 'ok' && items && (
        <ul className="divide-y divide-app-border/30">
          {items.map((it, i) => {
            const meta = ACTION_LABEL[it.action] ?? { emoji: '•', ka: it.action, en: it.action, ru: it.action };
            const positive = it.creditsDelta > 0;
            return (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex items-center gap-2 text-app-text">
                  <span className="text-app-muted tabular-nums">{fmtDate(it.createdAt)}</span>
                  <span>{meta.emoji} {meta[loc]}</span>
                </span>
                <span className={`tabular-nums font-semibold ${positive ? 'text-emerald-400' : 'text-app-muted'}`}>
                  {positive ? '+' : '−'}{Math.abs(it.creditsDelta)} {t.credits} <span className="text-app-muted/70">({creditsToGel(Math.abs(it.creditsDelta)).toFixed(2)} ₾)</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ── 8. Danger Zone (Delete Account) ───────────────────────────────────────────

function DangerZoneSection({ t, loc }: { t: Copy['danger']; loc: Locale }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const confirmDelete = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/account/delete', { method: 'POST', credentials: 'include' });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!j.success) { setErr(j.error || t.failed); setBusy(false); return; }
      setDone(true);
      // Brief delay so the user sees the success state, then bounce to /[locale]/login.
      setTimeout(() => router.push(`/${loc}/login`), 1200);
    } catch {
      setErr(t.failed); setBusy(false);
    }
  }, [loc, router, t.failed]);

  return (
    <Card className="border-red-500/20 !ring-red-500/20">
      <CardHeader icon={AlertTriangle} title={t.title} />
      <p className="mb-4 text-sm text-app-muted">{t.description}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-red-500/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 active:scale-[0.98]"
      >
        <AlertTriangle size={14} /> {t.cta}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => !busy && !done && setOpen(false)}
          >
            <motion.div
              key="modal"
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain rounded-2xl bg-app-elevated p-6 text-app-text ring-1 ring-app-border/60 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold">{t.modalTitle}</h3>
                {!busy && !done && (
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1 text-app-muted transition-colors hover:bg-app-bg/40 hover:text-app-text">
                    <X size={16} />
                  </button>
                )}
              </div>
              <p className="mt-3 text-sm text-app-muted">{t.modalBody}</p>
              {err && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/20">{err}</p>}
              {done ? (
                <div className="mt-5 flex items-center gap-2 text-sm text-app-accent">
                  <Check size={16} /> {t.deleted}
                </div>
              ) : (
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-full px-4 py-2 text-sm font-medium text-app-muted transition-colors hover:text-app-text disabled:opacity-50">
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-full bg-red-500/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                    {busy ? t.deleting : t.confirm}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
