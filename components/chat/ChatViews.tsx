'use client';

/**
 * ChatViews — the embedded in-place views of MyAvatarChat (Roadmap #12 cont.).
 *
 * Extracted from the MyAvatarChat monolith: the Avatar gallery, Analytics
 * dashboard, Billing/plans surface, and the drawer Account section. Each renders
 * in place (no redirects) and owns its own data fetching; the container just
 * switches between them by `activeView`.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles, Loader2, CreditCard, ExternalLink, LogOut, Check, Zap, Crown, Volume2,
  User as UserIcon, Image as ImageIcon, Video as VideoIcon, Music as MusicIcon, Sofa as SofaIcon,
} from 'lucide-react';
import InlineMedia from '@/components/dashboard/command-center/InlineMedia';
import { BarChart, KpiTile, LineChart, TopicList, WeeklyUsageChart } from '@/components/analytics/AnalyticsCharts';
import { PricingGrid } from '@/components/dashboard/PricingGrid';
import { createBrowserClient } from '@/lib/supabase/browser';

export function AvatarGalleryView({ locale, onBackToChat }: { locale: string; onBackToChat: () => void }) {
  const [items, setItems] = useState<Array<{ id: string; url: string | null; prompt: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const res = await fetch('/api/creations?kind=video&service=avatar&limit=24', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json() as { creations?: Array<{ id: string; url: string | null; prompt: string | null; created_at: string }> };
        if (!cancel) setItems(data.creations ?? []);
      } catch {
        // ignore
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-[13px] text-[#94A3B8] mb-3">
        {locale === 'ka' ? 'შენი HeyGen ვიდეო-ავატარები' : 'Your HeyGen video avatars'}
      </p>
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="aspect-video rounded-xl bg-white/[0.04] animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-8 text-center">
          <p className="text-[14px] text-white mb-2">
            {locale === 'ka' ? 'ჯერ არ გაქვს ავატარი' : 'No avatars yet'}
          </p>
          <p className="text-[12px] text-[#94A3B8] mb-4">
            {locale === 'ka' ? 'დაიწყე "ავატარი" სერვისით ჩატში' : 'Use the Avatar pill in chat to create one'}
          </p>
          <button onClick={onBackToChat} className="px-4 py-2 rounded-full bg-white text-black text-[13px] font-semibold">
            {locale === 'ka' ? 'მთავარ ჩატში დაბრუნება' : 'Back to chat'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map(it => (
            <div key={it.id} className="rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.02]">
              {it.url
                ? <InlineMedia kind="video" url={it.url} prompt={it.prompt ?? ''} />
                : <div className="aspect-video flex items-center justify-center text-[#94A3B8] text-[12px]">No URL</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AnalyticsView({ locale }: { locale: string }) {
  const [data, setData] = useState<{
    messagesPerDay: Array<{ date: string; count: number }>;
    generationUsage: { image: number; video: number; audio: number; avatar: number; code: number; text: number };
    topTopics: Array<{ topic: string; count: number }>;
    totalMessages: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const res = await fetch('/api/analytics/summary', { credentials: 'include' });
        if (!res.ok) return;
        const j = await res.json();
        if (!cancel) setData(j);
      } catch { /* ignore */ }
      finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-[#94A3B8] text-[13px]">{locale === 'ka' ? 'იტვირთება...' : 'Loading…'}</div>;
  }
  if (!data || data.totalMessages < 5) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <p className="text-[14px] text-white">{locale === 'ka' ? 'ჯერ მცირე მონაცემია' : 'Not enough data yet'}</p>
        <p className="text-[12px] text-[#94A3B8] mt-2">
          {locale === 'ka' ? 'გააგზავნე მინიმუმ 5 შეტყობინება' : 'Send at least 5 messages to unlock analytics'}
        </p>
      </div>
    );
  }
  const u = data.generationUsage;
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label={locale === 'ka' ? 'შეტყობინება' : 'Messages'} value={data.totalMessages} accent="#0ea5e9" />
        <KpiTile label={locale === 'ka' ? 'სურათი' : 'Images'} value={u.image} accent="#06b6d4" />
        <KpiTile label={locale === 'ka' ? 'ვიდეო' : 'Videos'} value={u.video} accent="#f97316" />
        <KpiTile label={locale === 'ka' ? 'აუდიო' : 'Audio'} value={u.audio} accent="#06b6d4" />
      </div>
      <section className="rounded-2xl p-4 bg-white/[0.04] border border-white/[0.08]">
        <h3 className="text-[13px] font-semibold text-white mb-3">
          {locale === 'ka' ? 'კვირეული გამოყენება — ბოლო 7 დღე' : locale === 'ru' ? 'Недельная активность — 7 дней' : 'Weekly Usage · last 7 days'}
        </h3>
        <WeeklyUsageChart data={data.messagesPerDay} locale={locale === 'ka' || locale === 'ru' ? locale : 'en'} />
      </section>
      <section className="rounded-2xl p-4 bg-white/[0.04] border border-white/[0.08]">
        <h3 className="text-[13px] font-semibold text-white mb-3">
          {locale === 'ka' ? 'შეტყობინებები / დღე — ბოლო 30 დღე' : 'Messages per day · last 30 days'}
        </h3>
        <LineChart data={data.messagesPerDay} />
      </section>
      <section className="rounded-2xl p-4 bg-white/[0.04] border border-white/[0.08]">
        <h3 className="text-[13px] font-semibold text-white mb-3">
          {locale === 'ka' ? 'გენერაცია სერვისების მიხედვით' : 'Generation usage'}
        </h3>
        <BarChart data={[
          { label: 'image', count: u.image,  color: 'linear-gradient(180deg,#06b6d4,#0e7490)' },
          { label: 'video', count: u.video,  color: 'linear-gradient(180deg,#f97316,#c2410c)' },
          { label: 'audio', count: u.audio,  color: 'linear-gradient(180deg,#06b6d4,#0891b2)' },
          { label: 'avatar', count: u.avatar, color: 'linear-gradient(180deg,#22d3ee,#0284c7)' },
          { label: 'code',  count: u.code,   color: 'linear-gradient(180deg,#10b981,#047857)' },
        ]} />
      </section>
      {data.topTopics.length > 0 && (
        <section className="rounded-2xl p-4 bg-white/[0.04] border border-white/[0.08]">
          <h3 className="text-[13px] font-semibold text-white mb-3">{locale === 'ka' ? 'ტოპ თემები' : 'Top topics'}</h3>
          <TopicList topics={data.topTopics} />
        </section>
      )}
    </div>
  );
}

interface PricePlan {
  id: 'starter' | 'pro' | 'ultimate';
  name: string;
  price: string;
  period: string;
  credits: string;
  creditsLabel: string;
  icon: typeof Zap;
  features: string[];
  popular?: boolean;
}

export function BillingView({ locale }: { locale: string }) {
  const t = (ka: string, en: string, ru: string) => (locale === 'ka' ? ka : locale === 'ru' ? ru : en);
  const creditsLabel = t('კრედიტი / თვე', 'credits / month', 'кредитов / мес');

  const plans: PricePlan[] = [
    {
      id: 'starter', name: t('სტარტერი', 'Starter', 'Стартер'), price: '₾0',
      period: t('სამუდამოდ', 'forever', 'навсегда'), credits: '200', creditsLabel, icon: Sparkles,
      features: [
        t('ჩატი + სურათები', 'Chat + images', 'Чат + изображения'),
        t('საბაზისო მოდელები', 'Standard models', 'Базовые модели'),
        t('1 ავატარი', '1 avatar', '1 аватар'),
      ],
    },
    {
      id: 'pro', name: 'Pro', price: '₾9', period: t('თვეში', '/ month', '/ мес'),
      credits: '5,000', creditsLabel, icon: Zap, popular: true,
      features: [
        t('უპირატესი მოდელები', 'Premium models', 'Премиум-модели'),
        t('ვიდეო + მუსიკა', 'Video + music', 'Видео + музыка'),
        t('პრიორიტეტული რიგი', 'Priority queue', 'Приоритетная очередь'),
      ],
    },
    {
      id: 'ultimate', name: 'Ultimate', price: '₾29', period: t('თვეში', '/ month', '/ мес'),
      credits: '20,000', creditsLabel, icon: Crown,
      features: [
        t('HeyGen Pro ავატარები', 'HeyGen Pro avatars', 'HeyGen Pro аватары'),
        t('Voice Clone', 'Voice Clone', 'Клон голоса'),
        t('მაქს. პრიორიტეტი', 'Max priority', 'Макс. приоритет'),
      ],
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-md mx-auto pt-5 pb-10 space-y-5"
    >
      <header className="text-center space-y-1.5">
        <h2 className="text-[24px] font-bold tracking-tight text-white">
          {t('აირჩიე გეგმა', 'Choose your plan', 'Выберите план')}
        </h2>
        <p className="text-[13px] text-white/55 leading-relaxed px-2">
          {t('გაამძაფრე შემოქმედება — გაზარდე ან გააუქმე ნებისმიერ დროს.',
            'Scale your creativity — upgrade or cancel anytime.',
            'Масштабируйте творчество — меняйте план в любой момент.')}
        </p>
      </header>

      {/* Founder-only production verification gate (renders nothing for non-admins). */}
      <PricingGrid locale={locale} />

      <div className="space-y-3.5">
        {plans.map((p, idx) => {
          const Icon = p.icon;
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.06 * idx, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              {/* Gradient halo ring — the memorable anchor on the Pro tier */}
              {p.popular && (
                <div aria-hidden className="absolute -inset-px rounded-[1.55rem] bg-gradient-to-br from-cyan-400/70 via-sky-500/45 to-blue-500/70" />
              )}
              <div
                className={`relative rounded-[1.5rem] p-5 border backdrop-blur-xl transition-all duration-300 ${
                  p.popular
                    ? 'border-transparent bg-[#0b0712] shadow-[0_20px_64px_-22px_rgba(56,189,248,0.6)]'
                    : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.05]'
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.14em] text-white bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 shadow-[0_6px_22px_-6px_rgba(37,99,235,0.85)] whitespace-nowrap">
                    <Sparkles size={11} /> {t('პოპულარული', 'Popular', 'Популярный')}
                  </span>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${p.popular ? 'bg-sky-500/20 text-cyan-200' : 'bg-white/[0.06] text-white/70'}`}>
                      <Icon size={17} />
                    </span>
                    <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/75 truncate">{p.name}</span>
                  </div>
                  <div className="text-right leading-none flex-shrink-0">
                    <span className="text-[26px] font-extrabold tabular-nums text-white">{p.price}</span>
                    <span className="block text-[11px] text-white/45 mt-1">{p.period}</span>
                  </div>
                </div>

                {/* Credit structure — high-contrast, unmissable */}
                <div className="mt-4 flex items-baseline gap-1.5 rounded-2xl bg-black/40 border border-white/[0.06] px-3.5 py-2.5">
                  <span className={`text-[22px] font-bold tabular-nums tracking-tight ${p.popular ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-sky-200' : 'text-white'}`}>{p.credits}</span>
                  <span className="text-[12px] text-white/55">{p.creditsLabel}</span>
                </div>

                <ul className="mt-3.5 space-y-2">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-[12.5px] text-white/75">
                      <Check size={14} className={`flex-shrink-0 ${p.popular ? 'text-cyan-300' : 'text-emerald-400'}`} />
                      <span className="truncate">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Credit → output guide — makes per-route cost legible to first-time
          guests. Mirrors PRODUCE_COST in lib/orchestrator/rate-limit.ts. */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55 mb-3">
          {t('რას ქმნის კრედიტი', 'What your credits make', 'Что создают кредиты')}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {([
            { icon: VideoIcon, label: t('ფილმი', 'Film', 'Фильм'), cr: 20 },
            { icon: UserIcon, label: t('ავატარი', 'Avatar', 'Аватар'), cr: 15 },
            { icon: SofaIcon, label: t('ინტერიერი 3D', 'Interior 3D', 'Интерьер 3D'), cr: 8 },
            { icon: MusicIcon, label: t('მუსიკა', 'Music', 'Музыка'), cr: 6 },
            { icon: ImageIcon, label: t('სურათი', 'Image', 'Изображение'), cr: 2 },
            { icon: Volume2, label: t('ხმა', 'Voice', 'Голос'), cr: 2 },
          ]).map(({ icon: Icon, label, cr }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[12.5px] text-white/75 min-w-0">
                <Icon size={14} className="text-sky-300 flex-shrink-0" />
                <span className="truncate">{label}</span>
              </span>
              <span className="text-[12px] font-semibold tabular-nums text-cyan-200 flex-shrink-0">
                {cr} {t('კრ', 'cr', 'кр')}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-white/40 leading-relaxed">
          {t('მაგ: Pro-ს 5,000 კრედიტი = 250 ფილმი ან 2,500 სურათი.',
            "e.g. Pro's 5,000 credits = 250 films or 2,500 images.",
            'Напр.: 5,000 кредитов Pro = 250 фильмов или 2,500 изображений.')}
        </p>
      </div>

      <StripePortalButton locale={locale} />

      <p className="text-center text-[11px] text-white/35 leading-relaxed px-4">
        {t('გადახდები მუშავდება Stripe-ით. გააუქმე ნებისმიერ დროს.',
          'Payments are processed securely by Stripe. Cancel anytime.',
          'Платежи обрабатываются через Stripe. Отмена в любое время.')}
      </p>
    </motion.div>
  );
}

// Glassmorphic primary CTA — animated diagonal sheen on hover, explicit
// loading/active/focus states, perfectly centered within the billing column.
function StripePortalButton({ locale }: { locale: string }) {
  const [loading, setLoading] = useState(false);
  const label = locale === 'ka' ? 'Stripe პორტალის გახსნა' : locale === 'ru' ? 'Открыть портал Stripe' : 'Open Stripe Customer Portal';
  const openPortal = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const r = await fetch('/api/billing/portal', { method: 'POST', credentials: 'include' });
      const j = await r.json() as { url?: string };
      if (j.url) { window.location.href = j.url; return; }
      setLoading(false);
    } catch { setLoading(false); }
  }, [loading]);

  return (
    <button
      type="button"
      onClick={openPortal}
      disabled={loading}
      aria-label={label}
      className="group relative w-full overflow-hidden rounded-2xl px-5 py-3.5 flex items-center justify-center gap-2.5 border border-white/[0.14] bg-white/[0.06] backdrop-blur-xl text-white font-semibold text-[14px] transition-all duration-300 hover:bg-white/[0.10] hover:border-white/[0.24] hover:shadow-[0_14px_44px_-14px_rgba(56,189,248,0.55)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-70"
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/[0.16] to-transparent" />
      {loading
        ? <Loader2 size={16} className="relative animate-spin text-cyan-200" />
        : <CreditCard size={16} className="relative text-cyan-200" />}
      <span className="relative">{label}</span>
      {!loading && <ExternalLink size={14} className="relative text-white/50 group-hover:text-white/85 transition" />}
    </button>
  );
}

/**
 * AccountSection — pinned to the bottom of the single left hamburger drawer.
 * Consolidates credits, live system status, language settings, auth, and the
 * legal/support links.
 */
export function AccountSection({
  locale,
  userName,
  isAuthenticated,
  onLogin,
}: {
  locale: string;
  userName: string;
  isAuthenticated: boolean;
  onLogin: () => void;
}) {
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [online, setOnline] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [providersReachable, setProvidersReachable] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    void (async () => {
      try {
        const r = await fetch('/api/billing/usage', { credentials: 'include' });
        if (!r.ok) return;
        const j = await r.json() as { credits_balance?: number; balance?: number };
        const v = j.credits_balance ?? j.balance ?? null;
        if (v != null) setCreditsBalance(v);
      } catch { /* ignore */ }
    })();
  }, [isAuthenticated]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  type Bucket = 'ok' | 'degraded' | 'down' | 'unconfigured';
  type Category = 'chat' | 'image' | 'video' | 'music' | 'voice' | 'avatar';
  const [providerSnapshot, setProviderSnapshot] = useState<Record<Category, Bucket> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/health/public');
        if (!r.ok) { if (!cancelled) setProvidersReachable(false); return; }
        const j = await r.json() as { online?: boolean; categories?: Record<Category, Bucket> };
        if (cancelled) return;
        setProvidersReachable(j.online === true);
        if (j.categories) setProviderSnapshot(j.categories);
      } catch {
        if (!cancelled) setProvidersReachable(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const statusOk = online && providersReachable !== false;

  const signOut = useCallback(async () => {
    try {
      const supabase = createBrowserClient();
      if (supabase) await supabase.auth.signOut();
    } catch { /* ignore */ }
    window.location.href = `/${locale}/login`;
  }, [locale]);

  const switchLocale = useCallback((next: 'ka' | 'en' | 'ru') => {
    if (next === locale) return;
    try { document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`; } catch { /* ignore */ }
    const path = window.location.pathname.replace(/^\/(ka|en|ru)(?=\/|$)/, '') || '/dashboard';
    window.location.href = `/${next}${path}`;
  }, [locale]);

  const LOCALES: Array<{ id: 'ka' | 'en' | 'ru'; label: string }> = [
    { id: 'ka', label: 'ქარ' },
    { id: 'en', label: 'EN' },
    { id: 'ru', label: 'RU' },
  ];

  return (
    <div className="flex-shrink-0 border-t border-white/[0.08] bg-black">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition text-left"
      >
        <span className="h-8 w-8 rounded-full bg-white/[0.06] border border-white/[0.10] flex items-center justify-center flex-shrink-0">
          <UserIcon size={15} className="text-white/80" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] text-white font-medium truncate">
            {userName || (locale === 'ka' ? 'სტუმარი' : locale === 'ru' ? 'Гость' : 'Guest')}
          </span>
          <span className="block text-[11px] text-white/45">
            {creditsBalance != null
              ? `${creditsBalance.toLocaleString()} ${locale === 'ka' ? 'კრედიტი' : locale === 'ru' ? 'кредитов' : 'credits'}`
              : (locale === 'ka' ? 'ანგარიში' : locale === 'ru' ? 'Аккаунт' : 'Account')}
          </span>
        </span>
        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${statusOk ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 max-h-[46vh] overflow-y-auto">
          <section className="rounded-xl p-3 bg-white/[0.02] border border-white/[0.08]">
            <div className="text-[10px] font-bold tracking-wider uppercase text-[#94A3B8] mb-2">
              {locale === 'ka' ? 'სისტემის სტატუსი' : locale === 'ru' ? 'Состояние' : 'System Status'}
            </div>
            {!online ? (
              <div className="text-[12px] text-rose-300">
                {locale === 'ka' ? 'ინტერნეტი გათიშულია' : locale === 'ru' ? 'Нет сети' : 'You are offline'}
              </div>
            ) : providerSnapshot ? (
              <div className="grid grid-cols-2 gap-1.5">
                {(['chat','image','video','music','voice','avatar'] as Category[]).map(cat => {
                  const b = providerSnapshot[cat];
                  const dot = b === 'ok' ? 'bg-emerald-400' : b === 'down' ? 'bg-rose-400' : b === 'degraded' ? 'bg-amber-400' : 'bg-white/25';
                  const labels: Record<Category, [string, string]> = {
                    chat: ['ჩატი','Chat'], image: ['სურათი','Image'], video: ['ვიდეო','Video'],
                    music: ['მუსიკა','Music'], voice: ['ხმა','Voice'], avatar: ['ავატარი','Avatar'],
                  };
                  return (
                    <div key={cat} className="flex items-center gap-1.5 text-[12px] text-white/80">
                      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                      {locale === 'ka' ? labels[cat][0] : labels[cat][1]}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[12px] text-white/55">{locale === 'ka' ? 'შემოწმება...' : 'Checking…'}</div>
            )}
          </section>

          <section className="rounded-xl p-3 bg-white/[0.02] border border-white/[0.08]">
            <div className="text-[10px] font-bold tracking-wider uppercase text-[#94A3B8] mb-2">
              {locale === 'ka' ? 'ენა' : locale === 'ru' ? 'Язык' : 'Language'}
            </div>
            <div className="flex gap-1.5">
              {LOCALES.map(l => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => switchLocale(l.id)}
                  className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition ${
                    l.id === locale ? 'bg-white text-black' : 'bg-black border border-white/[0.12] text-white/70 hover:border-white/[0.25]'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </section>

          {isAuthenticated ? (
            <button
              type="button"
              onClick={signOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition text-left"
            >
              <LogOut size={15} className="text-rose-400" />
              <span className="text-[13px] text-rose-400 font-medium">{locale === 'ka' ? 'გასვლა' : locale === 'ru' ? 'Выйти' : 'Sign out'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white text-black text-[13px] font-semibold hover:bg-white/90 transition"
            >
              <UserIcon size={15} />
              {locale === 'ka' ? 'შესვლა' : locale === 'ru' ? 'Войти' : 'Log in'}
            </button>
          )}

          <div className="pt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-white/45">
            {[
              { href: `/${locale}/support`, label: locale === 'ka' ? 'მხარდაჭერა' : locale === 'ru' ? 'Поддержка' : 'Support' },
              { href: `/${locale}/privacy`, label: locale === 'ka' ? 'კონფიდენც.' : locale === 'ru' ? 'Приватность' : 'Privacy' },
              { href: `/${locale}/terms`, label: locale === 'ka' ? 'პირობები' : locale === 'ru' ? 'Условия' : 'Terms' },
              { href: `/${locale}/refund-policy`, label: locale === 'ka' ? 'დაბრუნება' : locale === 'ru' ? 'Возврат' : 'Refunds' },
            ].map((lnk, i, arr) => (
              <span key={lnk.href} className="inline-flex items-center gap-2.5">
                <a
                  href={lnk.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white/85 underline-offset-2 hover:underline transition-colors"
                >
                  {lnk.label}
                </a>
                {i < arr.length - 1 && <span aria-hidden className="text-white/20">·</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
