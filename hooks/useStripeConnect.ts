/**
 * useStripeConnect Hook
 * 
 * React hook for managing Stripe Connect onboarding and account status
 * 
 * Example usage:
 * 
 * ```tsx
 * const { account, loading, error, startOnboarding, refreshStatus } = useStripeConnect();
 * 
 * if (!account) {
 *   return <button onClick={startOnboarding}>Complete Seller Setup</button>;
 * }
 * 
 * if (!account.canReceivePayments) {
 *   return <div>Complete onboarding to receive payments</div>;
 * }
 * 
 * return <div>Connected! You can receive payments.</div>;
 * ```
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ConnectAccountStatus {
  hasAccount: boolean;
  canReceivePayments: boolean;
  account: {
    id: string;
    status: 'pending' | 'restricted' | 'enabled' | 'rejected';
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    email?: string;
    country?: string;
    currency?: string;
    onboardingCompletedAt?: string;
  } | null;
  requirements: {
    currentlyDue: string[];
    eventuallyDue: string[];
    pastDue: string[];
    disabled: boolean;
    disabledReason: string | null;
  };
  capabilities: {
    cardPayments: 'active' | 'inactive' | 'pending';
    transfers: 'active' | 'inactive' | 'pending';
  };
  dashboardUrl?: string;
}

export function useStripeConnect() {
  const [account, setAccount] = useState<ConnectAccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch account status from API
   */
  const fetchAccountStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/stripe/connect/account-status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please log in to view account status');
        }
        throw new Error('Failed to fetch account status');
      }

      const data = await response.json();
      setAccount(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('[useStripeConnect] Error fetching status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Start onboarding process
   * Returns onboarding URL or throws error
   */
  const startOnboarding = useCallback(async (businessName?: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/stripe/connect/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ businessName }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please log in to start onboarding');
        }
        throw new Error('Failed to start onboarding');
      }

      const data = await response.json();

      // Redirect to Stripe onboarding
      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('[useStripeConnect] Error starting onboarding:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Refresh account status
   */
  const refreshStatus = useCallback(() => {
    return fetchAccountStatus();
  }, [fetchAccountStatus]);

  /**
   * Open Stripe dashboard
   */
  const openDashboard = useCallback(() => {
    if (account?.dashboardUrl) {
      window.open(account.dashboardUrl, '_blank');
    }
  }, [account]);

  // Fetch status on mount
  useEffect(() => {
    fetchAccountStatus();
  }, [fetchAccountStatus]);

  return {
    account,
    loading,
    error,
    startOnboarding,
    refreshStatus,
    openDashboard,
    // Convenience flags
    hasAccount: account?.hasAccount ?? false,
    canReceivePayments: account?.canReceivePayments ?? false,
    needsOnboarding: account?.hasAccount === false,
    hasRequirementsDue: (account?.requirements.currentlyDue.length ?? 0) > 0,
  };
}

/**
 * Helper: Check if account is enabled
 */
export function isAccountEnabled(account: ConnectAccountStatus | null): boolean {
  return (
    account?.hasAccount === true &&
    account.account?.status === 'enabled' &&
    account.canReceivePayments === true
  );
}

/**
 * Helper: Get status display text
 */
export function getAccountStatusText(account: ConnectAccountStatus | null): string {
  if (!account?.hasAccount) {
    return 'Not connected';
  }

  if (account.account?.status === 'pending') {
    return 'Onboarding in progress';
  }

  if (account.account?.status === 'restricted') {
    return 'Access restricted';
  }

  if (account.account?.status === 'rejected') {
    return 'Application rejected';
  }

  if (account.canReceivePayments) {
    return 'Connected';
  }

  return 'Action required';
}

/**
 * Helper: Get status color
 */
export function getAccountStatusColor(
  account: ConnectAccountStatus | null
): 'green' | 'yellow' | 'red' | 'gray' {
  if (!account?.hasAccount) {
    return 'gray';
  }

  if (account.canReceivePayments) {
    return 'green';
  }

  if (account.account?.status === 'rejected') {
    return 'red';
  }

  if (account.account?.status === 'restricted') {
    return 'yellow';
  }

  return 'yellow';
}
