'use client';

/**
 * TanStack Query Provider
 *
 * Wraps the app with QueryClientProvider so all client components can use
 * useQuery / useMutation hooks. Includes ReactQueryDevtools in development.
 */

import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { makeQueryClient } from '@/lib/query/client';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState ensures the client is created once per component instance,
  // not recreated on every render.
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  );
}
