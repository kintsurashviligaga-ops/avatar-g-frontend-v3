'use client';

import Link from 'next/link';

export default function CancelPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-2xl p-8">
        {/* Cancel Icon */}
        <div className="text-center mb-6">
          <div className="inline-block w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <span className="text-4xl">⚠️</span>
          </div>
          <h1 className="text-3xl font-bold text-orange-900">Payment Cancelled</h1>
        </div>

        {/* Message */}
        <div className="text-center mb-6">
          <p className="text-slate-600">
            Your payment was cancelled or not completed. No charges were made to your account.
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <p className="text-xs text-orange-900">
            <strong>ℹ️ What happened?</strong> You either clicked the back button or closed the checkout page. 
            Feel free to try again whenever you&apos;re ready.
          </p>
        </div>

        {/* Reasons */}
        <div className="mb-6 space-y-2 text-sm">
          <p className="font-semibold text-slate-700">Possible reasons:</p>
          <ul className="text-xs text-slate-600 space-y-1 ml-4">
            <li>• You clicked &quot;Back&quot; or closed the checkout page</li>
            <li>• Your browser session expired</li>
            <li>• You cancelled the payment on Stripe Checkout</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link
            href="/pay"
            className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition"
          >
            ← Try Payment Again
          </Link>
          
          <Link
            href="/"
            className="block w-full text-center bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold py-3 px-4 rounded-lg transition"
          >
            Return to Home
          </Link>
        </div>

        {/* Help */}
        <div className="mt-6 pt-6 border-t border-slate-200 text-center text-xs text-slate-500">
          <p>If you have questions, please contact support</p>
        </div>
      </div>
    </div>
  );
}
