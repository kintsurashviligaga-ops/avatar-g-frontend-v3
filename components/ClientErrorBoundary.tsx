'use client';

import ErrorBoundary from '@/components/landing/ErrorBoundary';
import type { ReactNode } from 'react';

/**
 * Thin client-component wrapper so the class-based ErrorBoundary
 * can be imported from the server-side root layout.
 */
export function ClientErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-white">
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">რაღაც შეფერხება მოხდა</h2>
            <p className="text-white/60 text-sm mb-4">Something went wrong</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20"
            >
              გადატვირთვა
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
