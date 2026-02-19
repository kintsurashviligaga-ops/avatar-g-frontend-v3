'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';

function SuccessContent() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    setSessionId(params?.get?.('session_id') ?? null);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-2xl p-8">
        {/* Success Icon */}
        <div className="text-center mb-6">
          <div className="inline-block w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <span className="text-4xl">✅</span>
          </div>
          <h1 className="text-3xl font-bold text-green-900">Payment Successful!</h1>
        </div>

        {/* Message */}
        <div className="text-center mb-6">
          <p className="text-slate-600 mb-4">
            Your payment was processed successfully. Thank you for using Avatar G!
          </p>
          
          {sessionId && (
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">Session ID:</p>
              <p className="text-xs font-mono text-slate-700 break-all">{sessionId}</p>
            </div>
          )}
        </div>

        {/* Next Steps */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-900 text-sm mb-2">📋 Next Steps:</h3>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>✓ Check Stripe Dashboard → Events to see the checkout.session.completed event</li>
            <li>✓ Check Webhooks → Event deliveries for webhook delivery confirmation</li>
            <li>✓ Check Vercel logs for webhook processing logs</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link
            href="/pay"
            className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition"
          >
            ← Make Another Payment
          </Link>
          
          <Link
            href="/"
            className="block w-full text-center bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold py-3 px-4 rounded-lg transition"
          >
            Return to Home
          </Link>
        </div>

        {/* Debug Info */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700 font-mono">
              📊 Verification Checklist
            </summary>
            <div className="mt-3 space-y-2 text-slate-600">
              <div>✓ Payment successful ( redirect received )</div>
              <div>⏳ Check Stripe Dashboard for event (give 30 seconds)</div>
              <div>⏳ Check webhook delivery (Webhooks → Event deliveries)</div>
              <div>⏳ Check Vercel function logs for processing</div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
