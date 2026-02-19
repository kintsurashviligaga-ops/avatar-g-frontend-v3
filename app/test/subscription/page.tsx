/**
 * Subscription Test Page
 * 
 * Example implementation of subscription management
 * Test at: http://localhost:3000/test/subscription
 */

'use client';

import { useState } from 'react';
import { useSubscription, isSubscriptionActive, formatPeriodEnd } from '@/hooks/useSubscription';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Check, Loader2, CreditCard, Settings } from 'lucide-react';

export default function SubscriptionTestPage() {
  const { status, loading, error, refetch, createCheckoutSession, openCustomerPortal } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | 'business'>('pro');
  const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateCheckout = async () => {
    setIsCreating(true);
    try {
      await createCheckoutSession(selectedPlan, selectedInterval);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create checkout');
      setIsCreating(false);
    }
  };

  const handleOpenPortal = async () => {
    try {
      await openCustomerPortal();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open portal');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] flex items-center justify-center">
        <div className="flex items-center gap-2 text-white">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading subscription status...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2">Subscription Test</h1>
        <p className="text-gray-400 mb-8">Test Stripe subscription integration</p>

        {error && (
          <Card className="bg-red-500/10 border-red-500/30 p-4 mb-6">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span>Error: {error}</span>
            </div>
          </Card>
        )}

        {/* Current Status */}
        <Card className="bg-black/40 border-white/10 p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Current Status</h2>
          
          {status?.hasSubscription ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-400" />
                <span className="text-green-400 font-medium">Active Subscription</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Plan:</span>
                  <span className="text-white ml-2 capitalize">
                    {status.subscription?.plan || 'Unknown'}
                  </span>
                </div>
                
                <div>
                  <span className="text-gray-400">Status:</span>
                  <span className={`ml-2 ${
                    isSubscriptionActive(status) ? 'text-green-400' : 'text-yellow-400'
                  }`}>
                    {status.subscription?.status}
                  </span>
                </div>
                
                <div>
                  <span className="text-gray-400">Current Period End:</span>
                  <span className="text-white ml-2">
                    {status.subscription?.currentPeriodEnd 
                      ? formatPeriodEnd(status.subscription.currentPeriodEnd)
                      : 'N/A'}
                  </span>
                </div>
                
                <div>
                  <span className="text-gray-400">Cancel at Period End:</span>
                  <span className="text-white ml-2">
                    {status.subscription?.cancelAtPeriodEnd ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10">
                <Button
                  onClick={handleOpenPortal}
                  className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  Manage Subscription
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-400">
              <AlertCircle className="w-5 h-5" />
              <span>No active subscription</span>
            </div>
          )}

          <button
            onClick={() => refetch()}
            className="mt-4 text-sm text-cyan-400 hover:text-cyan-300"
          >
            Refresh Status
          </button>
        </Card>

        {/* Create Subscription */}
        {!status?.hasSubscription && (
          <Card className="bg-black/40 border-white/10 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Create Subscription</h2>
            
            {/* Plan Selection */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Select Plan:</label>
              <div className="grid grid-cols-3 gap-2">
                {(['starter', 'pro', 'business'] as const).map((plan) => (
                  <button
                    key={plan}
                    onClick={() => setSelectedPlan(plan)}
                    className={`px-4 py-2 rounded-lg transition ${
                      selectedPlan === plan
                        ? 'bg-purple-600 text-white'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    {plan.charAt(0).toUpperCase() + plan.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Interval Selection */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Billing Interval:</label>
              <div className="grid grid-cols-2 gap-2">
                {(['monthly', 'yearly'] as const).map((interval) => (
                  <button
                    key={interval}
                    onClick={() => setSelectedInterval(interval)}
                    className={`px-4 py-2 rounded-lg transition ${
                      selectedInterval === interval
                        ? 'bg-cyan-600 text-white'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    {interval.charAt(0).toUpperCase() + interval.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Checkout Button */}
            <Button
              onClick={handleCreateCheckout}
              disabled={isCreating}
              className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 text-white flex items-center justify-center gap-2"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating Checkout...
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  Create Checkout Session
                </>
              )}
            </Button>

            <p className="text-xs text-gray-500 mt-3 text-center">
              Test card: 4242 4242 4242 4242 | Exp: Any future date | CVC: Any 3 digits
            </p>
          </Card>
        )}

        {/* Debug Info */}
        <Card className="bg-black/40 border-white/10 p-6 mt-6">
          <h2 className="text-xl font-semibold text-white mb-4">Debug Info</h2>
          <pre className="text-xs text-gray-400 overflow-auto">
            {JSON.stringify(status, null, 2)}
          </pre>
        </Card>
      </div>
    </div>
  );
}
