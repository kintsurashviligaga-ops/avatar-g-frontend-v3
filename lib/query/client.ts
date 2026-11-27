/**
 * TanStack Query Client Configuration
 *
 * Centralised query client with sensible production defaults:
 * - 5-min stale time (reduces unnecessary refetches on navigation)
 * - 3 retry attempts with exponential back-off (stops after 30s max)
 * - 10-min garbage collection window
 * - Structured error logging via the app's logger
 */

import { QueryClient } from '@tanstack/react-query';

/**
 * Exponential back-off with "equal jitter": half the step is fixed, half is random. Phase 8.21 ("thundering herd"): when
 * the database comes back after an outage, every open tab's failed query used to retry at exactly 1 s, 2 s, 4 s, all in
 * the same instant. Spreading each step over its second half keeps the retries apart without making any of them slower
 * than half of what it was.
 */
export function jitteredRetryDelay(attemptIndex: number, random: () => number = Math.random): number {
  const step = Math.min(1000 * 2 ** attemptIndex, 30_000);
  return Math.round(step / 2 + random() * (step / 2));
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Consider data fresh for 5 minutes — prevents refetch on tab switch
        staleTime: 5 * 60 * 1000,
        // Keep unused data in cache for 10 minutes
        gcTime: 10 * 60 * 1000,
        // Retry failed requests up to 3 times with exponential back-off
        retry: (failureCount, error) => {
          // Don't retry on 4xx client errors
          const status = (error as { status?: number })?.status;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 3;
        },
        retryDelay: jitteredRetryDelay,
        // Refetch on window focus only in production
        refetchOnWindowFocus: process.env.NODE_ENV === 'production',
        // Refetch when reconnecting to network
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

// Browser-side singleton — reused across navigations
let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: always create a new client to avoid sharing state between requests
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
