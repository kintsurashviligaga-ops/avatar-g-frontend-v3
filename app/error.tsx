'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Only log in development, never expose errors in production
    if (process.env.NODE_ENV === 'development') {
      console.error('[App Error]', error);
    }
    
    // Send to error tracking service if configured
    if (typeof window !== 'undefined' && window.location.hostname === 'myavatar.ge') {
      try {
        // Log to error tracking in production
        fetch('/api/log-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: error.message,
            digest: error.digest,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent,
          }),
        }).catch(() => {}); // Silently fail
      } catch {}
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-[#05070A] flex items-center justify-center p-4" dir="ltr">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-[#0A0F1C] border border-red-500/30 rounded-2xl p-8 text-center"
      >
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3 }}
          className="w-20 h-20 mx-auto rounded-full bg-red-500/20 flex items-center justify-center mb-6"
        >
          <AlertTriangle size={40} className="text-red-400" />
        </motion.div>

        <h2 className="text-2xl font-bold text-red-400 mb-2">სისტემური შეცდომა</h2>
        <p className="text-gray-400 mb-2">
          დაფიქსირდა მოულოდელი შეცდომა. გთხოვთ სცადოთ თავიდან ან დაბრუნდით მთავარ გვერდზე.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-600 mb-6 font-mono break-all">
            შეცდომის ID: {error.digest}
          </p>
        )}

        <div className="flex gap-3 justify-center flex-wrap">
          <Button variant="outline" onClick={reset} className="border-red-500/30 hover:bg-red-500/10">
            <RefreshCw size={18} className="mr-2" />
            სცადეთ თავიდან
          </Button>
          <Link href="/">
            <Button variant="primary">
              <Home size={18} className="mr-2" />
              მთავარი
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
