'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface CreditsData {
  plan_id: string;
  balance: number;
  soft_cap: number | null;
  flagged_soft_cap: boolean;
}

/**
 * CreditsWidget — compact credit balance indicator for navbars / sidebars.
 * Fetches from /api/billing/credits on mount and exposes a refresh callback.
 */
export default function CreditsWidget() {
  const t = useTranslations('credits');
  const [data, setData] = useState<CreditsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/billing/credits');
      if (!res.ok) throw new Error('fetch_failed');
      const json = await res.json();
      setData({
        plan_id: json.plan_id,
        balance: json.balance,
        soft_cap: json.soft_cap,
        flagged_soft_cap: json.flagged_soft_cap,
      });
    } catch {
      setError(t('fetch_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/40">
        <span className="h-3 w-3 animate-pulse rounded-full bg-white/20" />
        {t('credits_label')}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg bg-red-900/20 px-3 py-1.5 text-xs text-red-400">
        {error ?? t('fetch_error')}
      </div>
    );
  }

  const isLow = data.soft_cap !== null && data.balance <= data.soft_cap * 0.2;
  const isNearCap = data.flagged_soft_cap;

  return (
    <button
      onClick={fetchCredits}
      className="group flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs transition hover:bg-white/10"
      title={t('balance_label')}
    >
      {/* Dot indicator */}
      <span
        className={`h-2 w-2 rounded-full ${
          isLow
            ? 'bg-red-500'
            : isNearCap
              ? 'bg-yellow-500'
              : 'bg-emerald-500'
        }`}
      />

      {/* Balance */}
      <span className="font-mono text-white/80 group-hover:text-white">
        {data.balance.toLocaleString()}
      </span>

      <span className="text-white/40">{t('credits_label')}</span>

      {/* Soft cap warning */}
      {isNearCap && (
        <span className="text-yellow-400/60">{t('soft_cap_warning')}</span>
      )}
    </button>
  );
}
