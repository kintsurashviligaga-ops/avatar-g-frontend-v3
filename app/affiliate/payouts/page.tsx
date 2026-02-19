'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/affiliate/DataTable';
import { StatusBadge } from '@/components/affiliate/StatusBadge';

interface Payout {
  id: string;
  amount_cents: number;
  currency: string;
  status: 'requested' | 'processing' | 'paid' | 'failed' | 'canceled';
  stripe_transfer_id?: string | null;
  requested_at: string;
  processed_at?: string | null;
}

function mapPayoutStatusToBadgeStatus(status: Payout['status']) {
  if (status === 'paid') return 'completed' as const;
  if (status === 'requested') return 'pending' as const;
  if (status === 'canceled') return 'reversed' as const;
  return status;
}

interface Balance {
  available: number;
  pending: number;
  paid: number;
  total: number;
}

export default function AffiliatePayoutsPage() {
  const t = useTranslations('affiliate.payouts');
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [connectEnabled, setConnectEnabled] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [payoutRes, balanceRes, dashboardRes] = await Promise.all([
        fetch('/api/affiliate/payouts'),
        fetch('/api/affiliate/balance'),
        fetch('/api/affiliate/dashboard'),
      ]);

      if (payoutRes.ok) {
        const payoutData = await payoutRes.json();
        setPayouts(payoutData.payouts || []);
      }

      if (balanceRes.ok) {
        const balanceData = await balanceRes.json();
        setBalance(balanceData);
      }

      if (dashboardRes.ok) {
        const dashboardData = await dashboardRes.json();
        setConnectEnabled(Boolean(dashboardData?.connect?.payouts_enabled));
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ka-GE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const requestPayout = async () => {
    try {
      setMessage(null);
      const amountCents = Math.round(Number(payoutAmount) * 100);

      if (!amountCents || amountCents <= 0) {
        setMessage(t('invalid_amount'));
        return;
      }

      const response = await fetch('/api/affiliate/payout/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents }),
      });

      const data = await response.json();
      if (!response.ok) {
        setMessage(data?.error || t('request_failed'));
        return;
      }

      if (data?.requiresConnect) {
        setMessage(t('connect_required'));
      } else {
        setMessage(t('request_success'));
      }

      await fetchData();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('request_failed'));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] py-16 px-4">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">{t('title')}</h1>
          <p className="text-gray-400">{t('subtitle')}</p>
        </div>

        {error && (
          <Card className="bg-red-500/10 border-red-500/30 p-4 text-red-300">{error}</Card>
        )}

        <Card className="bg-black/40 border-white/10 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-400">{t('available_balance')}</p>
              <p className="text-3xl font-bold text-white">
                {formatCurrency(balance?.available || 0)}
              </p>
            </div>
            <div className="text-xs text-gray-500">
              {t('threshold_info', { amount: '$10.00' })}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <input
              type="number"
              min="0"
              value={payoutAmount}
              onChange={(event) => setPayoutAmount(event.target.value)}
              placeholder="10.00"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
            />
            <div className="flex gap-3">
              <Button
                onClick={requestPayout}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
              >
                {t('request_payout')}
              </Button>
              {!connectEnabled && (
                <Button
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                  onClick={() => (window.location.href = '/sell/onboarding')}
                >
                  {t('connect_now')}
                </Button>
              )}
            </div>
          </div>

          {message && <p className="text-xs text-amber-300">{message}</p>}
        </Card>

        <Card className="bg-black/40 border-white/10 p-6">
          <DataTable
            columns={[
              {
                key: 'date',
                header: t('date'),
                render: (item: Payout) => formatDate(item.requested_at),
                width: '20%',
              },
              {
                key: 'amount',
                header: t('amount'),
                render: (item: Payout) => (
                  <span className="font-mono text-cyan-400">
                    {formatCurrency(item.amount_cents)}
                  </span>
                ),
                width: '20%',
              },
              {
                key: 'status',
                header: t('status'),
                render: (item: Payout) => (
                  <StatusBadge
                    status={mapPayoutStatusToBadgeStatus(item.status)}
                    label={t(item.status)}
                  />
                ),
                width: '20%',
              },
              {
                key: 'transfer',
                header: t('transfer_id'),
                render: (item: Payout) => (
                  <code className="text-xs text-gray-400">
                    {item.stripe_transfer_id ? `${item.stripe_transfer_id.slice(0, 8)}...` : '--'}
                  </code>
                ),
                width: '20%',
              },
            ]}
            data={payouts}
            isLoading={loading}
            emptyMessage={t('no_payouts')}
            keyExtractor={(item) => item.id}
          />
        </Card>
      </div>
    </div>
  );
}
