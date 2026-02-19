/**
 * Stripe Subscription Hook
 * 
 * Client-side React hook for subscription management
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@/lib/supabase/browser';

export interface SubscriptionStatus {
  hasSubscription: boolean;
  subscription: {
    id: string;
    plan: string | null;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    priceId: string;
  } | null;
}

export function useSubscription() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setStatus(null);
        setLoading(false);
        return;
      }

      const response = await fetch('/api/stripe/subscription/get-status');
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 404) {
          setStatus(null);
          setError(null);
          setLoading(false);
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch subscription status');
      }

      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const createCheckoutSession = useCallback(
    async (plan: 'starter' | 'pro' | 'business', interval: 'monthly' | 'yearly') => {
      try {
        const response = await fetch('/api/stripe/subscription/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan, interval }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create checkout session');
        }

        const { url } = await response.json();
        window.location.href = url;
      } catch (err) {
        throw err;
      }
    },
    []
  );

  const openCustomerPortal = useCallback(async () => {
    try {
      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to open customer portal');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (err) {
      throw err;
    }
  }, []);

  return {
    status,
    loading,
    error,
    refetch: fetchStatus,
    createCheckoutSession,
    openCustomerPortal,
  };
}

/**
 * Helper: Check if subscription is active
 */
export function isSubscriptionActive(status: SubscriptionStatus | null): boolean {
  return (
    status?.hasSubscription === true &&
    ['active', 'trialing'].includes(status.subscription?.status || '')
  );
}

/**
 * Helper: Check if user has specific plan
 */
export function hasSubscriptionPlan(
  status: SubscriptionStatus | null,
  plan: string
): boolean {
  return status?.subscription?.plan === plan;
}

/**
 * Helper: Format period end date
 */
export function formatPeriodEnd(periodEnd: string): string {
  return new Date(periodEnd).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
