'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, Calendar, CreditCard } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import type { FinanceSummaryResponse } from '@/lib/types/finance';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function AccountBillingPage() {
  const t = useTranslations('billing');
  const subscriptionT = useTranslations('subscription');
  const { data, loading, error, openCustomerPortal } = useSubscriptionStatus();
  const [actionError, setActionError] = useState<string | null>(null);
  const [financeData, setFinanceData] = useState<FinanceSummaryResponse | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);

  useEffect(() => {
    if (!data?.hasSubscription) {
      return;
    }

    const fetchFinanceData = async () => {
      try {
        setFinanceLoading(true);
        const response = await fetch('/api/finance/me/summary', { method: 'GET' });
        if (!response.ok) {
          return;
        }
        const financeJson = (await response.json()) as FinanceSummaryResponse;
        setFinanceData(financeJson);
      } catch (fetchError) {
        console.error('Error fetching finance data:', fetchError);
      } finally {
        setFinanceLoading(false);
      }
    };

    fetchFinanceData();
  }, [data?.hasSubscription]);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) {
      return t('summary.no_date');
    }
    return new Date(dateString).toLocaleDateString('ka-GE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (cents: number | null | undefined) => {
    const amount = cents ?? 0;
    return `$${(amount / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const resolveStatusLabel = (status: string | null | undefined) => {
    if (!status) {
      return t('status.none');
    }
    return subscriptionT(`status.${status}`);
  };

  const planLabel = data?.subscription?.plan
    ? subscriptionT(`plans.${data.subscription.plan}.title`)
    : t('summary.no_plan');

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-white/10 rounded" />
            <div className="h-4 w-64 bg-white/5 rounded" />
            <div className="h-48 bg-white/5 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] py-16 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-3">{t('title')}</h1>
          <p className="text-gray-400">{t('subtitle')}</p>
        </div>

        {(error || actionError) && (
          <Card className="bg-red-500/10 border-red-500/30 p-4 text-red-300">
            {actionError || t('errors.loadFailed')}
          </Card>
        )}

        {!data?.hasSubscription && (
          <Card className="bg-black/40 border-white/10 p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-cyan-300" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">{t('empty.title')}</h2>
                <p className="text-gray-400 mt-2">{t('empty.description')}</p>
              </div>
            </div>
            <Link href="/pricing" className="inline-flex">
              <Button className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white">
                {t('empty.cta')}
              </Button>
            </Link>
          </Card>
        )}

        {data?.hasSubscription && (
          <Card className="bg-black/40 border-white/10 p-6 space-y-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm text-gray-400">{t('summary.plan')}</p>
                <h2 className="text-2xl font-semibold text-white">{planLabel}</h2>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-400">{t('summary.status')}</p>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {resolveStatusLabel(data.status)}
                </span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-gray-300" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">{t('summary.nextBilling')}</p>
                  <p className="text-white font-medium">{formatDate(data.currentPeriodEnd)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5 text-gray-300" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">{t('summary.cancelAtPeriodEnd')}</p>
                  <p className="text-white font-medium">
                    {data.cancelAtPeriodEnd ? t('summary.cancelYes') : t('summary.cancelNo')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={async () => {
                  try {
                    setActionError(null);
                    await openCustomerPortal();
                  } catch (openError) {
                    setActionError(openError instanceof Error ? openError.message : t('errors.loadFailed'));
                  }
                }}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
              >
                {t('actions.manageBilling')}
              </Button>
              <Link href="/pricing">
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                  {t('actions.changePlan')}
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {data?.hasSubscription && financeLoading && (
          <Card className="bg-black/40 border-white/10 p-6 text-gray-300">
            {t('history.loading') || 'Loading payment history...'}
          </Card>
        )}

        {data?.hasSubscription && financeData && (
          <Card className="bg-black/40 border-white/10 p-6 space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-sm text-gray-400">{t('history.totalPaid') || 'Total Paid'}</p>
                <p className="text-2xl font-bold text-white mt-2">{formatCurrency(financeData.totals?.totalPaid)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-sm text-gray-400">{t('history.invoices') || 'Invoices'}</p>
                <p className="text-2xl font-bold text-white mt-2">{financeData.totals?.invoiceCount ?? 0}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-sm text-gray-400">{t('history.payments') || 'Transactions'}</p>
                <p className="text-2xl font-bold text-white mt-2">{financeData.totals?.paymentCount ?? 0}</p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
