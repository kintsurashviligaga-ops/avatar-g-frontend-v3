'use client';

import { useEffect } from 'react';

/**
 * Locale-scoped error boundary.
 * Catches errors inside [locale] pages without losing the root layout shell.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Locale Error Boundary]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold text-white mb-4">Something went wrong</h2>
        <p className="text-gray-400 mb-6">
          {error.message || 'An unexpected error occurred while loading this page.'}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-lg bg-[#D4AF37] text-black font-semibold text-sm hover:bg-[#c9a432] transition"
          >
            Try again
          </button>
          <a
            href="/"
            className="px-5 py-2.5 rounded-lg border border-white/20 text-white text-sm font-medium hover:bg-white/5 transition"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
