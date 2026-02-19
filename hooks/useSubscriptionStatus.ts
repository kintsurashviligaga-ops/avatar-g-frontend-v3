/**
 * Subscription Status Hook
 * 
 * Client-side React hook for subscription status + actions.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/browser';

export interface SubscriptionStatusResponse {
  hasSubscription: boolean;
  status: string | null;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
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

export function useSubscriptionStatus() {
  const [data, setData] = useState<SubscriptionStatusResponse | null>(null);
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
        setData(null);
        setLoading(false);
        return;
      }

      const response = await fetch('/api/stripe/subscription/get-status');
      if (!response.ok) {
        if (response.status === 401 || response.status === 404) {
          setData(null);
          setError(null);
          setLoading(false);
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch subscription status');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const startCheckout = useCallback(async (priceId: string, customerEmail?: string) => {
    const response = await fetch('/api/stripe/subscription/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId, customerEmail }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create checkout session');
    }

    const { url } = await response.json();
    if (url) {
      window.location.href = url;
    }
  }, []);

  const openCustomerPortal = useCallback(async () => {
    const response = await fetch('/api/stripe/customer-portal', {
      method: 'POST',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to open customer portal');
    }

    const { url } = await response.json();
    if (url) {
      window.location.href = url;
    }
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchStatus,
    startCheckout,
    openCustomerPortal,
  };
}
