/**
 * Plan Card Component
 */

'use client';

import { getPlan, normalizePlanTier, type PlanTier } from '@/lib/billing/plans';
import { useState } from 'react';

interface PlanCardProps {
  plan: PlanTier;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export function PlanCard({ plan, status, currentPeriodEnd, cancelAtPeriodEnd }: PlanCardProps) {
  const normalizedPlan = normalizePlanTier(plan);
  const planConfig = getPlan(normalizedPlan);
  const [isUpgrading, setIsUpgrading] = useState(false);
  
  const handleUpgrade = async (targetPlan: PlanTier) => {
    setIsUpgrading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      alert('Failed to start upgrade process');
    } finally {
      setIsUpgrading(false);
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400';
      case 'canceled': return 'text-red-400';
      case 'past_due': return 'text-yellow-400';
      default: return 'text-white/45';
    }
  };
  
  const getPlanIcon = (plan: PlanTier) => {
    switch (normalizePlanTier(plan)) {
      case 'FREE': return '🌱';
      case 'PRO': return '⚡';
      case 'PREMIUM': return '👑';
      default: return '📦';
    }
  };
  
  return (
    <div className="relative rounded-2xl border border-white/[0.08] bg-[linear-gradient(155deg,rgba(7,14,30,0.90),rgba(4,9,22,0.80))] backdrop-blur-2xl p-6 overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.09] to-transparent" />
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">Current Plan</h2>
        <div className="text-4xl">{getPlanIcon(plan)}</div>
      </div>
      
      <div className="space-y-4">
        {/* Plan Name */}
        <div>
          <h3 className="text-3xl font-bold text-white">{planConfig.label}</h3>
          <p className="text-sm text-white/40 mt-1">{planConfig.features[0] || 'Plan features included'}</p>
        </div>
        
        {/* Status */}
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${getStatusColor(status)}`}>
            ● {status.toUpperCase()}
          </span>
          {cancelAtPeriodEnd && (
            <span className="text-xs text-yellow-400">(cancels at period end)</span>
          )}
        </div>
        
        {/* Features */}
        <div className="space-y-2 pt-2 border-t border-white/[0.07]">
          {planConfig.features.slice(0, 4).map((feature, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-white/65">
              <span className="text-cyan-400">✓</span>
              <span>{feature}</span>
            </div>
          ))}
        </div>
        
        {/* Upgrade CTA */}
        {normalizedPlan !== 'PREMIUM' && (
          <div className="pt-4">
            <button
              onClick={() => {
                const nextPlan: PlanTier = normalizedPlan === 'FREE' ? 'PRO' : 'PREMIUM';
                handleUpgrade(nextPlan);
              }}
              disabled={isUpgrading}
              className="w-full px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 rounded-lg font-medium transition disabled:opacity-50"
            >
              {isUpgrading ? 'Processing...' : 'Upgrade Plan'}
            </button>
          </div>
        )}
        
        {/* Period End */}
        {currentPeriodEnd && (
          <p className="text-xs text-gray-500 text-center">
            Renews {new Date(currentPeriodEnd).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}
