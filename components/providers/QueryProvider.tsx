'use client';

/**
 * TanStack Query Provider
 *
 * Wraps the app with QueryClientProvider so all client components can use
 * useQuery / useMutation hooks. The devtools are OPT-IN in development (NEXT_PUBLIC_QUERY_DEVTOOLS=1).
 *
 * ⚠️ THEY USED TO BE ON IN EVERY `next dev`, bottom-left — which is exactly where the composer's „+" sits on a
 * phone once nothing is under the box. Their floating button intercepted the pointer there, so every Playwright
 * test that tapped „+" at a phone width timed out, and a phone preview showed an island picture over the composer.
 * The UI under test and under preview must be the UI that ships.
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
      {process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_QUERY_DEVTOOLS === '1' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  );
}
