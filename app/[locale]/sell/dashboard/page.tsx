'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, ShieldCheck, ExternalLink } from 'lucide-react';

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

export default function SellerDashboardPage() {
  const t = useTranslations('sell.dashboard');
  const [status, setStatus] = useState<ConnectStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/stripe/connect/status');
        if (!response.ok) {
          throw new Error('Failed to fetch status');
        }
        const data = await response.json();
        setStatus(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  const openStripeDashboard = async () => {
    try {
      const response = await fetch('/api/stripe/connect/login-link', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to create login link');
      }
      const { url } = await response.json();
      if (url) {
        window.open(url, '_blank');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const payoutStatus = status?.payoutsEnabled ? t('status.active') : t('status.pending');

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] py-16 px-4">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-3">{t('title')}</h1>
          <p className="text-gray-400">{t('subtitle')}</p>
        </div>

        {error && (
          <Card className="bg-red-500/10 border-red-500/30 p-4 text-red-300">
            {error}
          </Card>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="bg-black/40 border-white/10 p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
              <div>
                <p className="text-sm text-gray-400">{t('status.payouts')}</p>
                <p className="text-white font-semibold">{payoutStatus}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-black/40 border-white/10 p-6">
            <div className="flex items-center gap-3">
              <DollarSign className="w-6 h-6 text-cyan-400" />
              <div>
                <p className="text-sm text-gray-400">{t('sections.earnings')}</p>
                <p className="text-white font-semibold">{t('placeholder.earnings')}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-black/40 border-white/10 p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-purple-400" />
              <div>
                <p className="text-sm text-gray-400">{t('sections.products')}</p>
                <p className="text-white font-semibold">{t('placeholder.products')}</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="bg-black/40 border-white/10 p-6 flex flex-wrap gap-4 items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">{t('status.payouts')}</p>
            <p className="text-white font-semibold">
              {status?.payoutsEnabled ? t('status.active') : t('status.pending')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={openStripeDashboard}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
              disabled={loading}
            >
              {t('actions.open_stripe')}
              <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
            <Button
              onClick={openStripeDashboard}
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
              disabled={loading}
            >
              {t('actions.payout_settings')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
