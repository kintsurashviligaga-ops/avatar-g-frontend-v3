'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * PRODUCTION-SAFE ERROR BOUNDARY
 *
 * ZERO external deps (no framer-motion, no lucide, no custom Button).
 * Must never crash itself — that would cascade to global-error.tsx.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[App Error Boundary]', {
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
      href: typeof window !== 'undefined' ? window.location.href : 'server',
      timestamp: new Date().toISOString(),
    });

    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      try {
        fetch('/api/log-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: error.message,
            digest: error.digest,
            timestamp: new Date().toISOString(),
            url: window.location.href,
          }),
        }).catch(() => {});
      } catch {
        // Never crash on logging
      }
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-[#050510] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#0A0F1C] border border-red-500/30 rounded-2xl p-8 text-center">
        <div className="w-20 h-20 mx-auto rounded-full bg-red-500/20 flex items-center justify-center mb-6">
          <span className="text-4xl">⚠️</span>
        </div>

        <h2 className="text-2xl font-bold text-red-400 mb-2">სისტემური შეცდომა</h2>
        <p className="text-gray-400 mb-2 text-sm">
          სისტემაში დროებითი პრობლემა დაფიქსირდა. გთხოვთ სცადოთ ხელახლა ან დაუკავშირდეთ მხარდაჭერას.
        </p>

        {process.env.NODE_ENV === 'development' && error.message && (
          <p className="text-xs text-gray-500 mb-4 font-mono break-all">
            დეტალი: {error.message}
          </p>
        )}

        <div className="flex gap-3 justify-center flex-wrap mt-6">
          <button
            onClick={reset}
            className="px-4 py-2 border border-red-500/30 rounded-lg text-sm text-white hover:bg-red-500/10 transition-colors"
          >
            🔄 სცადეთ თავიდან
          </button>
          <Link
            href="/"
            className="px-4 py-2 bg-indigo-600 rounded-lg text-sm text-white font-semibold hover:bg-indigo-500 transition-colors"
          >
            🏠 მთავარი
          </Link>
        </div>

        <p className="text-xs text-gray-600 mt-6">
          თუ პრობლემა გრძელდება, გთხოვთ ხელახლა ეწვიეთ მოგვიანებით.
        </p>
      </div>
    </div>
  );
}
