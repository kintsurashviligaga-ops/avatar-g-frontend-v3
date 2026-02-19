"use client";

import { useEffect, useMemo, useState } from 'react';
import { ServiceHeader } from '@/components/layout/ServiceHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/Toast';
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@/lib/stripe/plans';

const plans = [
  { id: 'free', name: 'Free', price: '$0', credits: '25 jobs/mo', features: ['Core services', 'Basic queue priority'] },
  {
    id: 'starter',
    name: SUBSCRIPTION_PLANS.starter.name,
    price: `$${SUBSCRIPTION_PLANS.starter.amountMonthlyUSD}`,
    credits: '100 jobs/mo',
    features: SUBSCRIPTION_PLANS.starter.features,
  },
  {
    id: 'pro',
    name: SUBSCRIPTION_PLANS.pro.name,
    price: `$${SUBSCRIPTION_PLANS.pro.amountMonthlyUSD}`,
    credits: '1000 jobs/mo',
    features: SUBSCRIPTION_PLANS.pro.features,
  },
  {
    id: 'business',
    name: SUBSCRIPTION_PLANS.business.name,
    price: `$${SUBSCRIPTION_PLANS.business.amountMonthlyUSD}`,
    credits: '5000 jobs/mo',
    features: SUBSCRIPTION_PLANS.business.features,
  },
];

export default function BillingPage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string>('FREE');
  const { addToast } = useToast();

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await fetch('/api/stripe/subscription/get-status', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        setCurrentPlan(String(data.plan ?? 'FREE').toUpperCase());
      } catch {
        setCurrentPlan('FREE');
      }
    };

    loadStatus();
  }, []);

  const selectedPlanId = useMemo(() => {
    if (currentPlan === 'STARTER') return 'starter';
    if (currentPlan === 'PRO') return 'pro';
    if (currentPlan === 'BUSINESS' || currentPlan === 'EMPIRE') return 'business';
    return 'free';
  }, [currentPlan]);

  const startCheckout = async (planId: SubscriptionPlan) => {
    setLoadingPlan(planId);
    try {
      const response = await fetch('/api/stripe/subscription/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, interval: 'monthly' }),
      });

      if (!response.ok) throw new Error('Checkout initialization failed');
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        addToast('info', 'Checkout placeholder active. Configure Stripe prices for live billing.');
      }
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to start checkout');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div>
      <ServiceHeader title="Billing & Plans" description="Freemium to Pro/Business upgrade paths with subscription gating." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} variant={plan.id === 'pro' ? 'solid' : 'glass'}>
            <CardHeader>
              <div>
                <CardTitle>{plan.name}</CardTitle>
                <p className="text-2xl font-bold text-app-text">{plan.price}</p>
              </div>
              {plan.id === selectedPlanId ? (
                <Badge variant="success">Current</Badge>
              ) : plan.id === 'pro' ? (
                <Badge variant="accent">Popular</Badge>
              ) : null}
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-app-muted">{plan.credits}</p>
              <ul className="mb-4 space-y-2 text-sm text-app-muted">
                {plan.features.map((feature) => (
                  <li key={feature}>• {feature}</li>
                ))}
              </ul>
              <Button
                variant={plan.id === 'free' ? 'secondary' : 'primary'}
                className="w-full"
                onClick={() => plan.id !== 'free' && startCheckout(plan.id as SubscriptionPlan)}
                disabled={loadingPlan === plan.id || plan.id === 'free' || plan.id === selectedPlanId}
              >
                {plan.id === 'free'
                  ? 'Current baseline'
                  : plan.id === selectedPlanId
                  ? 'Current plan'
                  : loadingPlan === plan.id
                  ? 'Opening...'
                  : 'Upgrade'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}