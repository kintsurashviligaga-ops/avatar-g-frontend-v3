'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, KeyRound, Wallet, RotateCw, X, CalendarDays } from 'lucide-react';

export type RuntimeStatusData = {
  keys: {
    status: 'ready' | 'partial' | 'missing';
    configured: number;
    total: number;
    providers: Array<{ id: string; configured: boolean }>;
  };
  billing: {
    authenticated: boolean;
    balance: number | null;
    plan: string | null;
    resetAt: string | null;
  };
};

interface Props {
  language: string;
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  status: RuntimeStatusData | null;
  onRefresh: () => void;
  onClose: () => void;
}

const COPY = {
  en: {
    title: 'Runtime Status',
    loading: 'Loading latest status...',
    keys: 'API Keys',
    providers: 'Providers',
    billing: 'Billing',
    plan: 'Plan',
    balance: 'Balance',
    reset: 'Reset',
    refresh: 'Refresh',
    unavailable: 'Unavailable',
    notSignedIn: 'Sign in to see personal billing details.',
  },
  ka: {
    title: 'რანთაიმის სტატუსი',
    loading: 'სტატუსის განახლება...',
    keys: 'API ქიები',
    providers: 'პროვაიდერები',
    billing: 'ბილინგი',
    plan: 'პლანი',
    balance: 'ბალანსი',
    reset: 'განახლება',
    refresh: 'განახლება',
    unavailable: 'მიუწვდომელია',
    notSignedIn: 'ბილინგის დეტალებისთვის გაიარე ავტორიზაცია.',
  },
  ru: {
    title: 'Статус рантайма',
    loading: 'Обновляем статус...',
    keys: 'API-ключи',
    providers: 'Провайдеры',
    billing: 'Биллинг',
    plan: 'План',
    balance: 'Баланс',
    reset: 'Сброс',
    refresh: 'Обновить',
    unavailable: 'Недоступно',
    notSignedIn: 'Войдите, чтобы увидеть персональные данные биллинга.',
  },
} as const;

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  replicate: 'Replicate',
  deepgram: 'Deepgram',
  elevenlabs: 'ElevenLabs',
  cartesia: 'Cartesia',
  stripe: 'Stripe',
  supabase_service: 'Supabase',
};

function formatResetDate(value: string | null, language: 'en' | 'ka' | 'ru', fallback: string): string {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const locale = language === 'ka' ? 'ka-GE' : language === 'ru' ? 'ru-RU' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function normalizePlan(plan: string | null, fallback: string): string {
  if (!plan) {
    return fallback;
  }

  return plan.replaceAll('_', ' ').toUpperCase();
}

export function ServiceRuntimeStatusPanel({
  language,
  isOpen,
  isLoading,
  error,
  status,
  onRefresh,
  onClose,
}: Props) {
  const lang = (language === 'ka' || language === 'ru' ? language : 'en') as 'en' | 'ka' | 'ru';
  const t = COPY[lang];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
          style={{ borderBottom: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.12)' }}
        >
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text)' }}>
                  {t.title}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onRefresh}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}
                >
                  <RotateCw className="w-3 h-3" />
                  {t.refresh}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {isLoading && (
              <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.loading}
              </p>
            )}

            {error && (
              <div
                className="rounded-lg px-2.5 py-2 text-[11px] flex items-center gap-1.5"
                style={{ border: '1px solid rgba(252,165,165,0.35)', color: '#fecaca', background: 'rgba(127,29,29,0.24)' }}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {error}
              </div>
            )}

            {status && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div className="rounded-xl p-2.5 space-y-2" style={{ border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
                      {t.keys}
                    </span>
                    <span className="text-[11px] font-medium" style={{ color: status.keys.status === 'ready' ? '#86efac' : status.keys.status === 'partial' ? '#fcd34d' : '#fca5a5' }}>
                      {status.keys.configured}/{status.keys.total}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{t.providers}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {status.keys.providers.map((provider) => (
                        <span
                          key={provider.id}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px]"
                          style={{
                            border: '1px solid var(--color-border)',
                            color: provider.configured ? '#86efac' : '#fca5a5',
                            background: provider.configured ? 'rgba(20,83,45,0.25)' : 'rgba(127,29,29,0.2)',
                          }}
                        >
                          {provider.configured ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          {PROVIDER_LABELS[provider.id] || provider.id}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl p-2.5 space-y-2" style={{ border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
                      {t.billing}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'var(--color-text-tertiary)' }}>{t.plan}</span>
                      <span>{normalizePlan(status.billing.plan, t.unavailable)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'var(--color-text-tertiary)' }}>{t.balance}</span>
                      <span>{status.billing.balance === null ? t.unavailable : Math.max(0, Math.round(status.billing.balance))}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1" style={{ color: 'var(--color-text-tertiary)' }}>
                        <CalendarDays className="w-3 h-3" />
                        {t.reset}
                      </span>
                      <span>{formatResetDate(status.billing.resetAt, lang, t.unavailable)}</span>
                    </div>
                  </div>

                  {!status.billing.authenticated && (
                    <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      {t.notSignedIn}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
