'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_CONFIG,
  type BillingInterval,
  type SubscriptionPlan,
  getPriceId,
} from '@/lib/stripe/plans';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';

const PLAN_ORDER: SubscriptionPlan[] = ['starter', 'pro', 'business'];

export default function PricingPage() {
  const t = useTranslations('subscription');
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, loading, error, startCheckout, openCustomerPortal } = useSubscriptionStatus();

  const currentPlan = data?.subscription?.plan || null;
  const hasSubscription = data?.hasSubscription === true;

  const planFeatures = useMemo(() => {
    return PLAN_ORDER.reduce<Record<SubscriptionPlan, string[]>>((acc, planKey) => {
      const raw = t.raw(`plans.${planKey}.features`) as string[];
      acc[planKey] = Array.isArray(raw) ? raw : [];
      return acc;
    }, {} as Record<SubscriptionPlan, string[]>);
  }, [t]);

  const formatPrice = (amount: number) => {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatGel = (amount: number) => {
    const gelAmount = amount * SUBSCRIPTION_CONFIG.gelRate;
    return gelAmount.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  const resolveActionLabel = (planKey: SubscriptionPlan) => {
    if (!hasSubscription) {
      return SUBSCRIPTION_CONFIG.trialDays > 0
        ? t('actions.startTrial', { days: SUBSCRIPTION_CONFIG.trialDays })
        : t('actions.subscribe');
    }

    if (planKey === currentPlan) {
      return t('actions.manageBilling');
    }

    if (!currentPlan) {
      return t('actions.subscribe');
    }

    const currentPlanConfig = SUBSCRIPTION_PLANS[currentPlan as SubscriptionPlan];
    const targetPlanConfig = SUBSCRIPTION_PLANS[planKey];
    const currentAmount = interval === 'monthly' ? currentPlanConfig.amountMonthlyUSD : currentPlanConfig.amountYearlyUSD;
    const targetAmount = interval === 'monthly' ? targetPlanConfig.amountMonthlyUSD : targetPlanConfig.amountYearlyUSD;

    return targetAmount > currentAmount ? t('actions.upgrade') : t('actions.downgrade');
  };

  const handlePlanAction = async (planKey: SubscriptionPlan) => {
    try {
      setActionError(null);
      if (hasSubscription && planKey === currentPlan) {
        await openCustomerPortal();
        return;
      }

      const priceId = getPriceId(planKey, interval);
      await startCheckout(priceId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('errors.checkoutFailed'));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] py-16 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-cyan-400 uppercase tracking-[0.3em] text-xs mb-4">
            {t('pricing.kicker')}
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {t('pricing.title')}
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            {t('pricing.subtitle')}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setInterval('monthly')}
              className={`px-6 py-2 rounded-full text-sm font-semibold transition ${
                interval === 'monthly'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              {t('interval.monthly')}
            </button>
            <button
              onClick={() => setInterval('yearly')}
              className={`px-6 py-2 rounded-full text-sm font-semibold transition ${
                interval === 'yearly'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              {t('interval.yearly')}
            </button>
            <span className="text-xs text-gray-500">
              {t('pricing.currency_note', { currency: SUBSCRIPTION_CONFIG.currency })}
            </span>
          </div>

          {(error || actionError) && (
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-300 border border-red-500/30">
              {actionError || t('errors.loadFailed')}
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {PLAN_ORDER.map((planKey, _index) => {
            const planConfig = SUBSCRIPTION_PLANS[planKey];
            const price = interval === 'monthly' ? planConfig.amountMonthlyUSD : planConfig.amountYearlyUSD;
            const isCurrent = planKey === currentPlan;
            const highlight = planKey === 'pro';

            return (
              <Card
                key={planKey}
                className={`relative bg-black/40 border p-8 transition ${
                  highlight
                    ? 'border-cyan-500/50 shadow-[0_0_40px_rgba(34,211,238,0.25)]'
                    : 'border-white/10'
                } ${isCurrent ? 'ring-2 ring-emerald-400/40' : ''}`}
              >
                {highlight && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-xs font-semibold text-white flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {t('pricing.popular')}
                  </span>
                )}

                <div className="mb-6">
                  {(() => {
                    const titleKey = `plans.${planKey}.title`;
                    const descriptionKey = `plans.${planKey}.description`;
                    return (
                      <>
                        <h3 className="text-2xl font-bold text-white">{t(titleKey as never)}</h3>
                        <p className="text-gray-400 mt-2">{t(descriptionKey as never)}</p>
                      </>
                    );
                  })()}
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-white">${formatPrice(price)}</span>
                    <span className="text-sm text-gray-400">/{t(`interval.${interval}` as never)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    {t('pricing.approx_gel', { amount: formatGel(price) })}
                  </div>
                </div>

                <div className="space-y-3 mb-8">
                  {planFeatures[planKey].map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-300 text-sm">{feature}</span>
                    </div>
                  ))}
                </div>

                {isCurrent && hasSubscription && (
                  <div className="mb-4 text-xs text-emerald-300">
                    {t('pricing.subscribed_notice')}
                  </div>
                )}

                <Button
                  className={`w-full ${
                    isCurrent
                      ? 'bg-white/10 hover:bg-white/20 text-white'
                      : highlight
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  disabled={loading}
                  onClick={() => handlePlanAction(planKey)}
                >
                  {loading ? t('actions.loading') : resolveActionLabel(planKey)}
                </Button>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
