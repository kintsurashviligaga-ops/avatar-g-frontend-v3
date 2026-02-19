'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function PayPage() {
  const _router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [customAmount, setCustomAmount] = useState<string>('100');

  const handlePay = async (amountUsd: number = 100) => {
    setLoading(true);
    setError('');

    try {
      const amountCents = Math.round(amountUsd * 100);

      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountCents,
          currency: 'usd',
          description: `Avatar G - Test Payment $${amountUsd}`,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();
      if (url) {
        // Redirect to Stripe Checkout
        window.location.href = url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('[Pay] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomPay = () => {
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }
    handlePay(amount);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-2xl p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">💳 Test Payment</h1>
          <p className="text-sm text-slate-500">
            Use this page to test Stripe payments in sandbox mode
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm font-medium">❌ Error: {error}</p>
          </div>
        )}

        {/* Quick Payment Buttons */}
        <div className="space-y-3 mb-8">
          <p className="text-sm font-semibold text-slate-700 mb-3">Quick Payment Options:</p>
          
          <button
            onClick={() => handlePay(10)}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold py-3 px-4 rounded-lg transition disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Processing...' : '💰 Pay $10'}
          </button>

          <button
            onClick={() => handlePay(50)}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold py-3 px-4 rounded-lg transition disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Processing...' : '💰 Pay $50'}
          </button>

          <button
            onClick={() => handlePay(100)}
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-semibold py-3 px-4 rounded-lg transition disabled:cursor-not-allowed border-2 border-emerald-600"
          >
            {loading ? '⏳ Processing...' : '✨ Pay $100 (Test)'}
          </button>
        </div>

        {/* Custom Amount */}
        <div className="mb-6 p-4 bg-slate-50 rounded-lg">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Custom Amount (USD):
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              disabled={loading}
              placeholder="100.00"
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-200"
            />
            <button
              onClick={handleCustomPay}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 text-white font-semibold px-4 py-2 rounded-lg transition disabled:cursor-not-allowed"
            >
              {loading ? '⏳' : 'Pay'}
            </button>
          </div>
        </div>

        {/* Test Card Info */}
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-6">
          <p className="text-xs font-semibold text-amber-900 mb-2">🧪 Use Stripe Test Card:</p>
          <p className="text-xs text-amber-800 font-mono">Card: 4242 4242 4242 4242</p>
          <p className="text-xs text-amber-800 font-mono">Expires: Any future date</p>
          <p className="text-xs text-amber-800 font-mono">CVC: Any 3-digit number</p>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6">
          <p className="text-xs text-blue-900">
            <strong>ℹ️ Sandbox Mode:</strong> This is a test payment in Stripe&apos;s sandbox environment. 
            No real charges will be made.
          </p>
        </div>

        {/* Navigation */}
        <div className="flex gap-2">
          <Link
            href="/"
            className="flex-1 text-center bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold py-2 px-4 rounded-lg transition"
          >
            ← Back Home
          </Link>
          <Link
            href="/pay/success"
            className="flex-1 text-center bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold py-2 px-4 rounded-lg transition text-xs"
          >
            View Success ✓
          </Link>
        </div>
      </div>
    </div>
  );
}
