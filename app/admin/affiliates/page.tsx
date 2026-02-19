'use client';

/**
 * Admin Affiliates Management Page
 * 
 * List and manage all affiliates
 * Route: /admin/affiliates
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, RefreshCw, Check, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/affiliate/DataTable';
import { StatusBadge } from '@/components/affiliate/StatusBadge';

interface Affiliate {
  user_id: string;
  affiliate_code: string;
  status: 'active' | 'disabled';
  total_clicks: number;
  total_signups: number;
  totals: {
    pending: number;
    eligible: number;
    paid: number;
    total: number;
  };
  created_at: string;
}

export default function AdminAffiliatesPage() {
  const t = useTranslations();
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchAffiliates = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`/api/admin/affiliates?${params}`);
      
      if (response.status === 403) {
        setError('Unauthorized: Admin access required');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch affiliates');
      }

const data = await response.json();
      setAffiliates(data.affiliates || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching affiliates:', err);
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void fetchAffiliates();
  }, [fetchAffiliates]);

  const toggleStatus = async (userId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
      
      const response = await fetch('/api/admin/affiliates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      // Refresh list
      await fetchAffiliates();
    } catch (err) {
      console.error('Error toggling status:', err);
      alert('Failed to update affiliate status');
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
              {t('admin.affiliates.title')}
            </h1>
            <p className="text-gray-400">
              {affiliates.length} {t('admin.affiliates.list_title').toLowerCase()}
            </p>
          </div>
          
          <Button
            onClick={fetchAffiliates}
            variant="outline"
            className="bg-white/5 border-white/10 text-white hover:bg-white/10"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('common.retry')}
          </Button>
        </div>

        {/* Filters */}
        <Card className="bg-black/40 border-white/10 p-6">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-400 mb-2">
                {t('admin.affiliates.search')}
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('admin.affiliates.search')}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-10 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t('admin.affiliates.status')}
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
              >
                <option value="all">{t('affiliate.commissions.all_statuses')}</option>
                <option value="active">{t('affiliate.status.active')}</option>
                <option value="disabled">{t('affiliate.status.disabled')}</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Affiliates Table */}
        <Card className="bg-black/40 border-white/10 p-6">
          <DataTable
            columns={[
              {
                key: 'code',
                header: t('admin.affiliates.code'),
                render: (item: Affiliate) => (
                  <code className="text-cyan-400 font-mono">
                    {item.affiliate_code}
                  </code>
                ),
                width: '15%',
              },
              {
                key: 'user_id',
                header: t('admin.affiliates.user_id'),
                render: (item: Affiliate) => (
                  <code className="text-xs text-gray-400">
                    {item.user_id.slice(0, 8)}...
                  </code>
                ),
                width: '15%',
              },
              {
                key: 'status',
                header: t('admin.affiliates.status'),
                render: (item: Affiliate) => (
                  <StatusBadge
                    status={item.status}
                    label={t(`affiliate.status.${item.status}`)}
                  />
                ),
                width: '12%',
              },
              {
                key: 'clicks',
                header: t('admin.affiliates.clicks'),
                render: (item: Affiliate) => item.total_clicks,
                width: '10%',
              },
              {
                key: 'signups',
                header: t('admin.affiliates.signups'),
                render: (item: Affiliate) => item.total_signups,
                width: '10%',
              },
              {
                key: 'commissions',
                header: t('admin.affiliates.commissions'),
                render: (item: Affiliate) => (
                  <div className="space-y-1 text-xs">
                    <div className="text-green-400">
                      {formatCurrency(item.totals.eligible)} eligible
                    </div>
                    <div className="text-gray-400">
                      {formatCurrency(item.totals.paid)} paid
                    </div>
                  </div>
                ),
                width: '15%',
              },
              {
                key: 'created',
                header: 'Created',
                render: (item: Affiliate) => (
                  <span className="text-xs text-gray-400">
                    {formatDate(item.created_at)}
                  </span>
                ),
                width: '13%',
              },
              {
                key: 'actions',
                header: t('admin.affiliates.actions'),
                render: (item: Affiliate) => (
                  <Button
                    onClick={() => toggleStatus(item.user_id, item.status)}
                    size="sm"
                    variant="outline"
                    className={`text-xs ${
                      item.status === 'active'
                        ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                        : 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
                    }`}
                  >
                    {item.status === 'active' ? (
                      <>
                        <X className="w-3 h-3 mr-1" />
                        {t('admin.affiliates.disable')}
                      </>
                    ) : (
                      <>
                        <Check className="w-3 h-3 mr-1" />
                        {t('admin.affiliates.activate')}
                      </>
                    )}
                  </Button>
                ),
                width: '10%',
              },
            ]}
            data={affiliates}
            isLoading={isLoading}
            emptyMessage={t('admin.affiliates.no_affiliates')}
            keyExtractor={(item) => item.user_id}
          />
        </Card>
      </div>
    </div>
  );
}
