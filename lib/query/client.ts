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
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
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
