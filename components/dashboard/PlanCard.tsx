/**
 * Plan Card Component
 */

'use client';

import { getPlan, type PlanTier } from '@/lib/billing/plans';
import { useState } from 'react';

interface PlanCardProps {
  plan: PlanTier;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export function PlanCard({ plan, status, currentPeriodEnd, cancelAtPeriodEnd }: PlanCardProps) {
  const planConfig = getPlan(plan);
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
      default: return 'text-gray-400';
    }
  };
  
  const getPlanIcon = (plan: PlanTier) => {
    switch (plan) {
      case 'FREE': return '🌱';
      case 'PRO': return '⚡';
      case 'PREMIUM': return '👑';
      case 'ENTERPRISE': return '🏢';
      default: return '📦';
    }
  };
  
  return (
    <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-cyan-500/20 rounded-xl p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">Current Plan</h2>
        <div className="text-4xl">{getPlanIcon(plan)}</div>
      </div>
      
      <div className="space-y-4">
        {/* Plan Name */}
        <div>
          <h3 className="text-3xl font-bold text-white">{planConfig.name}</h3>
          <p className="text-sm text-gray-400 mt-1">{planConfig.description}</p>
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
        <div className="space-y-2 pt-2 border-t border-gray-700">
          {planConfig.features.slice(0, 4).map((feature, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-gray-300">
              <span className="text-cyan-400">✓</span>
              <span>{feature}</span>
            </div>
          ))}
        </div>
        
        {/* Upgrade CTA */}
        {plan !== 'ENTERPRISE' && (
          <div className="pt-4">
            <button
              onClick={() => {
                const nextPlan = plan === 'FREE' ? 'PRO' : plan === 'PRO' ? 'PREMIUM' : 'ENTERPRISE';
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
