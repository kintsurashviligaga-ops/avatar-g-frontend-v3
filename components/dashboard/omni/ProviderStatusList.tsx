'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

type ProviderStatus = 'missing_key' | 'configured' | 'healthy' | 'unhealthy';

interface ProviderRow {
  provider: string;
  envKey: string;
  configured: boolean;
  status: ProviderStatus;
  detail: string;
  creditsRemaining: number | null;
}

interface AuditResponse {
  ok: boolean;
  live: boolean;
  timestamp: string;
  audit: {
    providers: ProviderRow[];
    routing: Array<{ category: string; provider: string; envKey: string; configured: boolean }>;
  };
}

const STATUS_COLOR: Record<ProviderStatus, string> = {
  healthy: '#10b981',
  configured: '#00d4ff',
  unhealthy: '#ef4444',
  missing_key: '#6b7280',
};

const STATUS_LABEL: Record<'ka' | 'en' | 'ru', Record<ProviderStatus, string>> = {
  ka: {
    healthy: 'აქტიური',
    configured: 'კონფიგურირებული',
    unhealthy: 'შეცდომა',
    missing_key: 'არ არის გასაღები',
  },
  en: {
    healthy: 'Healthy',
    configured: 'Configured',
    unhealthy: 'Error',
    missing_key: 'No key',
  },
  ru: {
    healthy: 'Активен',
    configured: 'Настроен',
    unhealthy: 'Ошибка',
    missing_key: 'Нет ключа',
  },
};

const COPY = {
  ka: {
    title: 'AI პროვაიდერების სტატუსი',
    refresh: 'განახლება',
    live: 'ცოცხალი შემოწმება',
    fast: 'სწრაფი (key only)',
    error: 'სტატუსის ჩატვირთვა ვერ მოხერხდა',
    credits: 'კრედიტი',
  },
  en: {
    title: 'AI Provider Status',
    refresh: 'Refresh',
    live: 'Live probe',
    fast: 'Fast (key only)',
    error: 'Failed to load status',
    credits: 'credits',
  },
  ru: {
    title: 'Статус AI-провайдеров',
    refresh: 'Обновить',
    live: 'Живая проверка',
    fast: 'Быстрая (только ключи)',
    error: 'Не удалось загрузить статус',
    credits: 'кредитов',
  },
} as const;

type Locale = keyof typeof COPY;

interface Props {
  locale?: string;
}

export function ProviderStatusList({ locale = 'en' }: Props) {
  const loc = (['ka', 'en', 'ru'].includes(locale) ? locale : 'en') as Locale;
  const c = COPY[loc];
  const labels = STATUS_LABEL[loc];

  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const load = async (probeLive: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/app/health${probeLive ? '?live=1' : ''}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as AuditResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/35">{c.title}</p>
        <button
          onClick={() => load(live)}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white/90 disabled:opacity-50"
          aria-label={c.refresh}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          <span>{c.refresh}</span>
        </button>
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        <button
          onClick={() => { setLive(false); load(false); }}
          className={`px-2 py-1 rounded-md transition ${!live ? 'bg-white/10 text-white' : 'bg-transparent text-white/45 hover:text-white/70'}`}
        >
          {c.fast}
        </button>
        <button
          onClick={() => { setLive(true); load(true); }}
          className={`px-2 py-1 rounded-md transition ${live ? 'bg-cyan-500/20 text-cyan-200' : 'bg-transparent text-white/45 hover:text-white/70'}`}
        >
          {c.live}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400">{c.error}: {error}</p>
      )}

      <div className="space-y-1.5">
        {data?.audit.providers.map((p) => (
          <div
            key={p.provider}
            className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{ background: STATUS_COLOR[p.status] }}
                aria-label={labels[p.status]}
              />
              <span className="text-sm text-white/90 truncate">{p.provider}</span>
            </div>
            <div className="flex flex-col items-end gap-0 text-right">
              <span className="text-[11px] text-white/55">{labels[p.status]}</span>
              {p.creditsRemaining !== null && (
                <span className="text-[10px] text-white/35">
                  {p.creditsRemaining} {c.credits}
                </span>
              )}
            </div>
          </div>
        ))}

        {!data && !loading && !error && (
          <p className="text-xs text-white/40">—</p>
        )}
      </div>
    </div>
  );
}
