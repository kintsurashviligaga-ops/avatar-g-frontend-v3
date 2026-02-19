'use client';

/**
 * Affiliate Dashboard Page
 * 
 * Main dashboard for affiliates to track their performance
 * Route: /affiliate
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp, Users, DollarSign, MousePointerClick, ExternalLink } from 'lucide-react';
import { StatCard } from '@/components/affiliate/StatCard';
import { CopyButton } from '@/components/affiliate/CopyButton';
import { DataTable } from '@/components/affiliate/DataTable';
import { StatusBadge } from '@/components/affiliate/StatusBadge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface AffiliateData {
  id: string;
  user_id: string;
  affiliate_code: string;
  commission_percent: number;
  is_active: boolean;
  total_clicks: number;
  total_signups: number;
  created_at: string;
}

interface Commission {
  id: string;
  event_type: string;
  stripe_object_id: string;
  gross_amount_cents: number;
  commission_amount_cents: number;
  status: 'pending' | 'available' | 'paid' | 'reversed';
  available_at: string | null;
  created_at: string;
}

interface DashboardStats {
  total_clicks: number;
  total_signups: number;
  pending: number;
  available: number;
  paid: number;
  total: number;
}

interface DashboardChartPoint {
  date: string;
  amount_cents: number;
}

interface DashboardResponse {
  affiliate: AffiliateData;
  stats: DashboardStats;
  chart: DashboardChartPoint[];
  connect: {
    payouts_enabled: boolean;
  };
}

export default function AffiliateDashboard() {
  const t = useTranslations();
  const [affiliate, setAffiliate] = useState<AffiliateData | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMessage, setPayoutMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAffiliateData();
  }, []);

  const fetchAffiliateData = async () => {
    try {
      setIsLoading(true);
      setPayoutMessage(null);
      
      // Fetch affiliate profile
      const profileRes = await fetch('/api/affiliate/me?create=true');
      if (!profileRes.ok) throw new Error('Failed to fetch affiliate data');
      const profileData = await profileRes.json();
      setAffiliate(profileData.affiliate);

      // Fetch commissions
      const commissionsRes = await fetch('/api/affiliate/commissions');
      if (!commissionsRes.ok) throw new Error('Failed to fetch commissions');
      const commissionsData = await commissionsRes.json();
      setCommissions(commissionsData.commissions || []);

      const dashboardRes = await fetch('/api/affiliate/dashboard');
      if (dashboardRes.ok) {
        const dashboardData = await dashboardRes.json();
        setDashboard(dashboardData);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching affiliate data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const totals = dashboard?.stats || {
    pending: 0,
    available: 0,
    paid: 0,
    total: 0,
    total_clicks: 0,
    total_signups: 0,
  };
  const referralLink = affiliate
    ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://myavatar.ge'}/?ref=${affiliate.affiliate_code}`
    : '';

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
      setPayoutMessage(null);
      const amountCents = Math.round(Number(payoutAmount) * 100);
      if (!amountCents || amountCents <= 0) {
        setPayoutMessage(t('affiliate.payouts.invalid_amount'));
        return;
      }

      const response = await fetch('/api/affiliate/payout/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPayoutMessage(data?.error || t('affiliate.payouts.request_failed'));
        return;
      }

      if (data?.requiresConnect) {
        setPayoutMessage(t('affiliate.payouts.connect_required'));
      } else {
        setPayoutMessage(t('affiliate.payouts.request_success'));
      }

      await fetchAffiliateData();
    } catch (err) {
      setPayoutMessage(err instanceof Error ? err.message : t('affiliate.payouts.request_failed'));
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <Card className="bg-red-500/10 border-red-500/30 p-6">
            <p className="text-red-400">{t('common.error')}: {error}</p>
            <Button onClick={fetchAffiliateData} className="mt-4">
              {t('common.retry')}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">
            {t('affiliate.title')}
          </h1>
          <p className="text-gray-400">
            {affiliate && (
              <StatusBadge
                status={affiliate.is_active ? 'active' : 'disabled'}
                label={t(`affiliate.status.${affiliate.is_active ? 'active' : 'disabled'}`)}
              />
            )}
          </p>
        </div>

        {/* Affiliate Code & Link */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-black/40 border-white/10 p-6">
            <p className="text-sm text-gray-400 mb-2">
              {t('affiliate.summary.your_code')}
            </p>
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-white/5 text-cyan-400 px-4 py-2 rounded-lg font-mono text-lg">
                {affiliate?.affiliate_code || '...'}
              </code>
              {affiliate && (
                <CopyButton
                  text={affiliate.affiliate_code}
                  label={t('affiliate.summary.copy_code')}
                  successMessage={t('affiliate.summary.copied')}
                />
              )}
            </div>
          </Card>

          <Card className="bg-black/40 border-white/10 p-6">
            <p className="text-sm text-gray-400 mb-2">
              {t('affiliate.summary.referral_link')}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-white/5 px-4 py-2 rounded-lg overflow-hidden">
                <p className="text-white text-sm truncate">{referralLink}</p>
              </div>
              {affiliate && (
                <CopyButton
                  text={referralLink}
                  label={t('affiliate.summary.copy_link')}
                  successMessage={t('affiliate.summary.copied')}
                />
              )}
            </div>
          </Card>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title={t('affiliate.summary.total_clicks')}
            value={totals.total_clicks || 0}
            icon={<MousePointerClick className="w-6 h-6" />}
            subtitle={t('affiliate.summary.all_time')}
            isLoading={isLoading}
          />
          <StatCard
            title={t('affiliate.summary.total_signups')}
            value={totals.total_signups || 0}
            icon={<Users className="w-6 h-6" />}
            subtitle={t('affiliate.summary.all_time')}
            isLoading={isLoading}
          />
          <StatCard
            title={t('affiliate.summary.eligible_commissions')}
            value={formatCurrency(totals.available)}
            icon={<DollarSign className="w-6 h-6" />}
            subtitle={t('affiliate.commissions.available')}
            isLoading={isLoading}
          />
          <StatCard
            title={t('affiliate.summary.paid_commissions')}
            value={formatCurrency(totals.paid)}
            icon={<TrendingUp className="w-6 h-6" />}
            subtitle={t('affiliate.commissions.paid')}
            isLoading={isLoading}
          />
        </div>

        {/* Commissions Table */}
        <Card className="bg-black/40 border-white/10 p-6">
          <h2 className="text-2xl font-bold text-white mb-6">
            {t('affiliate.commissions.title')}
          </h2>

          <DataTable
            columns={[
              {
                key: 'date',
                header: t('affiliate.commissions.date'),
                render: (item: Commission) => formatDate(item.created_at),
                width: '15%',
              },
              {
                key: 'type',
                header: t('affiliate.commissions.source_type'),
                render: (item: Commission) => (
                  <span className="capitalize">{item.event_type}</span>
                ),
                width: '15%',
              },
              {
                key: 'id',
                header: t('affiliate.commissions.source_id'),
                render: (item: Commission) => (
                  <code className="text-xs text-gray-400">
                    {item.stripe_object_id ? `${item.stripe_object_id.slice(0, 8)}...` : '--'}
                  </code>
                ),
                width: '15%',
              },
              {
                key: 'amount',
                header: t('affiliate.commissions.amount'),
                render: (item: Commission) => (
                  <span className="font-mono text-cyan-400">
                    {formatCurrency(item.commission_amount_cents)}
                  </span>
                ),
                width: '15%',
              },
              {
                key: 'rate',
                header: t('affiliate.commissions.rate'),
                render: () => `${affiliate?.commission_percent || 0}%`,
                width: '10%',
              },
              {
                key: 'status',
                header: t('affiliate.commissions.status'),
                render: (item: Commission) => (
                  <StatusBadge
                    status={item.status}
                    label={t(`affiliate.commissions.${item.status}`)}
                  />
                ),
                width: '15%',
              },
              {
                key: 'available',
                header: t('affiliate.commissions.available_at'),
                render: (item: Commission) =>
                  item.status === 'pending' && item.available_at ? formatDate(item.available_at) : '-',
                width: '15%',
              },
            ]}
            data={commissions}
            isLoading={isLoading}
            emptyMessage={t('affiliate.commissions.no_commissions')}
            keyExtractor={(item) => item.id}
          />

          {commissions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
              <p className="text-sm text-gray-400">
                {t('affiliate.commissions.total')}: {commissions.length}
              </p>
              <p className="text-lg font-bold text-white">
                {formatCurrency(totals.total)}
              </p>
            </div>
          )}
        </Card>

        {/* Earnings Chart */}
        <Card className="bg-black/40 border-white/10 p-6">
          <h2 className="text-2xl font-bold text-white mb-6">
            {t('affiliate.summary.earnings_chart')}
          </h2>
          <div className="grid grid-cols-7 gap-3 items-end h-32">
            {(dashboard?.chart || []).map((point) => (
              <div key={point.date} className="flex flex-col items-center gap-2">
                <div
                  className="w-6 rounded-full bg-gradient-to-t from-cyan-500/60 to-blue-500/60"
                  style={{ height: `${Math.max(12, Math.min(100, point.amount_cents / 50))}px` }}
                />
                <span className="text-[10px] text-gray-500">
                  {new Date(point.date).toLocaleDateString('ka-GE', { weekday: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Referrals Section */}
        <Card className="bg-black/40 border-white/10 p-6">
          <h2 className="text-2xl font-bold text-white mb-6">
            {t('affiliate.referrals.title')} ({t('affiliate.referrals.last_50')})
          </h2>
          
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">
              {t('affiliate.referrals.no_referrals')}
            </p>
          </div>
        </Card>

        {/* Payouts */}
        <Card className="bg-black/40 border-white/10 p-6">
          <h2 className="text-2xl font-bold text-white mb-6">
            {t('affiliate.payouts.title')}
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <p className="text-sm text-gray-400">{t('affiliate.payouts.available_balance')}</p>
              <p className="text-3xl font-bold text-white">
                {formatCurrency(totals.available)}
              </p>
              <p className="text-xs text-gray-500">
                {t('affiliate.payouts.threshold_info', { amount: '$10.00' })}
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-sm text-gray-400">
                {t('affiliate.payouts.request_amount')}
              </label>
              <input
                type="number"
                min="0"
                value={payoutAmount}
                onChange={(event) => setPayoutAmount(event.target.value)}
                placeholder="10.00"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={requestPayout}
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
                  disabled={isLoading}
                >
                  {t('affiliate.payouts.request_payout')}
                </Button>
                <Button
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                  onClick={() => (window.location.href = '/affiliate/payouts')}
                >
                  {t('affiliate.payouts.view_history')}
                </Button>
              </div>
              {payoutMessage && (
                <p className="text-xs text-amber-300">{payoutMessage}</p>
              )}
              {!dashboard?.connect?.payouts_enabled && (
                <div className="text-xs text-gray-400">
                  {t('affiliate.payouts.connect_required')}
                  <Button
                    variant="ghost"
                    className="text-cyan-400 px-1"
                    onClick={() => (window.location.href = '/sell/onboarding')}
                  >
                    {t('affiliate.payouts.connect_now')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Settings */}
        <Card className="bg-black/40 border-white/10 p-6">
          <h2 className="text-2xl font-bold text-white mb-6">
            {t('affiliate.settings.title')}
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t('affiliate.settings.payout_method')}
              </label>
              <Button
                disabled
                variant="outline"
                className="bg-white/5 border-white/10 text-gray-400"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {t('affiliate.settings.connect_payout')} ({t('affiliate.settings.coming_soon')})
              </Button>
            </div>

            <div className="pt-4 border-t border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">
                  {t('affiliate.settings.minimum_threshold')}
                </span>
                <span className="text-white font-mono">$10.00</span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-sm text-gray-400">
                  {t('affiliate.settings.current_balance')}
                </span>
                <span className="text-cyan-400 font-mono font-bold">
                  {formatCurrency(totals.available)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
