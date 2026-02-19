'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ConnectStatusResponse {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: {
    currentlyDue: string[];
    eventuallyDue: string[];
    pastDue: string[];
  };
  accountId: string | null;
}

export default function SellerOnboardingPage() {
  const t = useTranslations('sell.onboarding');
  const [status, setStatus] = useState<ConnectStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/stripe/connect/status');
      if (!response.ok) {
        throw new Error('Failed to fetch status');
      }
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const startSetup = async () => {
    try {
      setActionLoading(true);
      const createResponse = await fetch('/api/stripe/connect/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create account');
      }

      const { accountId } = await createResponse.json();

      const linkResponse = await fetch('/api/stripe/connect/create-account-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });

      if (!linkResponse.ok) {
        throw new Error('Failed to create onboarding link');
      }

      const { url } = await linkResponse.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(false);
    }
  };

  const continueOnboarding = async () => {
    try {
      setActionLoading(true);
      const linkResponse = await fetch('/api/stripe/connect/create-account-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: status?.accountId || undefined }),
      });

      if (!linkResponse.ok) {
        throw new Error('Failed to create onboarding link');
      }

      const { url } = await linkResponse.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(false);
    }
  };

  const formatRequirement = (value: string) => {
    return value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const requirementsList = useMemo(() => {
    if (!status) return [];
    return [
      ...status.requirements.currentlyDue,
      ...status.requirements.eventuallyDue,
      ...status.requirements.pastDue,
    ];
  }, [status]);

  const isComplete = status?.chargesEnabled && status?.payoutsEnabled && status?.detailsSubmitted;
  const hasAccount = Boolean(status?.accountId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] py-16 px-4">
      <div className="max-w-5xl mx-auto space-y-10">
        <div>
          <h1 className="text-4xl font-bold text-white mb-3">{t('title')}</h1>
          <p className="text-gray-400">{t('subtitle')}</p>
        </div>

        <Card className="bg-black/40 border-white/10 p-6">
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { label: t('steps.create'), complete: hasAccount },
              { label: t('steps.verify'), complete: status?.detailsSubmitted },
              { label: t('steps.payouts'), complete: status?.payoutsEnabled },
            ].map((step, index) => (
              <div key={step.label} className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    step.complete ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {index + 1}
                </div>
                <span className={step.complete ? 'text-white' : 'text-gray-400'}>{step.label}</span>
              </div>
            ))}
          </div>
        </Card>

        {error && (
          <Card className="bg-red-500/10 border-red-500/30 p-4 text-red-300">
            {error}
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-black/40 border-white/10 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">{t('status.connected')}</h2>
            <div className="space-y-3">
              {[
                { label: t('status.connected'), value: status?.connected },
                { label: t('status.charges_enabled'), value: status?.chargesEnabled },
                { label: t('status.payouts_enabled'), value: status?.payoutsEnabled },
                { label: t('status.details_submitted'), value: status?.detailsSubmitted },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-gray-300 text-sm">{item.label}</span>
                  {item.value ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="bg-black/40 border-white/10 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">{t('requirements.title')}</h2>
            {loading ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('actions.refresh')}</span>
              </div>
            ) : requirementsList.length === 0 ? (
              <p className="text-sm text-emerald-300">{t('requirements.none')}</p>
            ) : (
              <ul className="space-y-2 text-sm text-gray-300">
                {requirementsList.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {formatRequirement(item)}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-wrap gap-4">
          {!hasAccount && (
            <Button
              onClick={startSetup}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
              disabled={actionLoading}
            >
              {actionLoading ? t('actions.refresh') : t('actions.start')}
            </Button>
          )}

          {hasAccount && !isComplete && (
            <Button
              onClick={continueOnboarding}
              className="bg-white/10 text-white hover:bg-white/20"
              disabled={actionLoading}
            >
              {t('actions.continue')}
            </Button>
          )}

          <Button
            onClick={fetchStatus}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
            disabled={loading}
          >
            {t('actions.refresh')}
          </Button>

          {isComplete && (
            <Link href="/sell/dashboard" className="inline-flex">
              <Button className="bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 hover:bg-emerald-500/30">
                {t('actions.dashboard')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          )}
        </div>

        {loading && (
          <div className="text-sm text-gray-400">{t('actions.refresh')}</div>
        )}
      </div>
    </div>
  );
}
