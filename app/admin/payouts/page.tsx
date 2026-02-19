/**
 * Admin Payouts Queue Page
 * 
 * Manage affiliate payouts
 * Route: /admin/payouts
 */

'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DollarSign, RefreshCw, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/affiliate/DataTable';

interface EligibleAffiliate {
  affiliate_id: string;
  affiliate_code: string;
  eligible_amount_cents: number;
  last_payout_at: string | null;
}

export default function AdminPayoutsPage() {
  const t = useTranslations();
  const [eligible, setEligible] = useState<EligibleAffiliate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPayoutDialog, setShowPayoutDialog] = useState(false);
  const [selectedAffiliate, setSelectedAffiliate] = useState<EligibleAffiliate | null>(null);
  const [payoutNotes, setPayoutNotes] = useState('');
  const [isCreatingPayout, setIsCreatingPayout] = useState(false);

  useEffect(() => {
    fetchEligible();
  }, []);

  const fetchEligible = async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/admin/payouts/eligible');
      
      if (response.status === 403) {
        setError('Unauthorized: Admin access required');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch eligible affiliates');
      }

      const data = await response.json();
      setEligible(data.eligible || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching eligible:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const createPayout = async () => {
    if (!selectedAffiliate) return;

    try {
      setIsCreatingPayout(true);
      
      const response = await fetch('/api/admin/payouts/eligible', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          affiliateId: selectedAffiliate.affiliate_id,
          amountCents: selectedAffiliate.eligible_amount_cents,
          notes: payoutNotes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create payout');
      }

      // Success
      alert(t('admin.payouts.success'));
      setShowPayoutDialog(false);
      setSelectedAffiliate(null);
      setPayoutNotes('');
      fetchEligible();
    } catch (err) {
      console.error('Error creating payout:', err);
      alert(err instanceof Error ? err.message : 'Failed to create payout');
    } finally {
      setIsCreatingPayout(false);
    }
  };

  const exportCSV = () => {
    const csv = [
      ['Affiliate Code', 'User ID', 'Eligible Amount', 'Last Payout'],
      ...eligible.map((a) => [
        a.affiliate_code,
        a.affiliate_id,
        formatCurrency(a.eligible_amount_cents),
        a.last_payout_at ? formatDate(a.last_payout_at) : 'Never',
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `affiliate-payouts-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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

  const totalEligible = eligible.reduce((sum, a) => sum + a.eligible_amount_cents, 0);

  if (error && error.includes('Unauthorized')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] flex items-center justify-center p-4">
        <Card className="bg-red-500/10 border-red-500/30 p-6 max-w-md">
          <h2 className="text-xl font-bold text-red-400 mb-2">
            {t('common.error')}
          </h2>
          <p className="text-red-300">{error}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              {t('admin.payouts.title')}
            </h1>
            <p className="text-gray-400">
              {eligible.length} {t('admin.payouts.queue_title').toLowerCase()}
            </p>
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={exportCSV}
              variant="outline"
              className="bg-white/5 border-white/10 text-white hover:bg-white/10"
              disabled={eligible.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              {t('admin.payouts.export_csv')}
            </Button>

            <Button
              onClick={fetchEligible}
              variant="outline"
              className="bg-white/5 border-white/10 text-white hover:bg-white/10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('common.retry')}
            </Button>
          </div>
        </div>

        {/* Total Summary */}
        <Card className="bg-gradient-to-br from-green-500/20 via-green-500/10 to-green-500/20 border-green-500/30 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-400 mb-1">Total Eligible Payouts</p>
              <p className="text-4xl font-bold text-white">
                {formatCurrency(totalEligible)}
              </p>
            </div>
            <DollarSign className="w-12 h-12 text-green-400/50" />
          </div>
        </Card>

        {/* Eligible Table */}
        <Card className="bg-black/40 border-white/10 p-6">
          <DataTable
            columns={[
              {
                key: 'code',
                header: t('admin.payouts.affiliate'),
                render: (item: EligibleAffiliate) => (
                  <code className="text-cyan-400 font-mono">
                    {item.affiliate_code}
                  </code>
                ),
                width: '25%',
              },
              {
                key: 'amount',
                header: t('admin.payouts.eligible_amount'),
                render: (item: EligibleAffiliate) => (
                  <span className="text-green-400 font-bold font-mono">
                    {formatCurrency(item.eligible_amount_cents)}
                  </span>
                ),
                width: '20%',
              },
              {
                key: 'last_payout',
                header: t('admin.payouts.last_payout'),
                render: (item: EligibleAffiliate) => (
                  <span className="text-xs text-gray-400">
                    {item.last_payout_at ? formatDate(item.last_payout_at) : 'Never'}
                  </span>
                ),
                width: '20%',
              },
              {
                key: 'user_id',
                header: 'User ID',
                render: (item: EligibleAffiliate) => (
                  <code className="text-xs text-gray-400">
                    {item.affiliate_id.slice(0, 12)}...
                  </code>
                ),
                width: '20%',
              },
              {
                key: 'actions',
                header: t('admin.affiliates.actions'),
                render: (item: EligibleAffiliate) => (
                  <Button
                    onClick={() => {
                      setSelectedAffiliate(item);
                      setShowPayoutDialog(true);
                    }}
                    size="sm"
                    className="bg-green-500/20 border-green-500/30 text-green-400 hover:bg-green-500/30"
                  >
                    {t('admin.payouts.create_payout')}
                  </Button>
                ),
                width: '15%',
              },
            ]}
            data={eligible}
            isLoading={isLoading}
            emptyMessage={t('admin.payouts.no_eligible')}
            keyExtractor={(item) => item.affiliate_id}
          />
        </Card>

        {/* Payout Dialog */}
        {showPayoutDialog && selectedAffiliate && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <Card className="bg-[#0A0F1C] border-white/20 p-6 max-w-md w-full">
              <h3 className="text-xl font-bold text-white mb-4">
                {t('admin.payouts.confirm_payout')}
              </h3>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    {t('admin.payouts.affiliate')}
                  </label>
                  <code className="block bg-white/5 px-3 py-2 rounded text-cyan-400">
                    {selectedAffiliate.affiliate_code}
                  </code>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    {t('admin.payouts.amount')}
                  </label>
                  <p className="text-2xl font-bold text-green-400 font-mono">
                    {formatCurrency(selectedAffiliate.eligible_amount_cents)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    {t('admin.payouts.notes')}
                  </label>
                  <textarea
                    value={payoutNotes}
                    onChange={(e) => setPayoutNotes(e.target.value)}
                    placeholder="Optional notes..."
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setShowPayoutDialog(false);
                    setSelectedAffiliate(null);
                    setPayoutNotes('');
                  }}
                  variant="outline"
                  className="flex-1 bg-white/5 border-white/10 text-white hover:bg-white/10"
                  disabled={isCreatingPayout}
                >
                  {t('admin.payouts.cancel')}
                </Button>

                <Button
                  onClick={createPayout}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                  disabled={isCreatingPayout}
                >
                  {isCreatingPayout ? t('common.loading') : t('admin.payouts.confirm')}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
