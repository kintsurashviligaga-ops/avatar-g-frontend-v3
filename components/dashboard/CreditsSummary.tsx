/**
 * Credits Summary Card
 */

'use client';

import { formatCredits } from '@/lib/billing/plans';

interface CreditsSummaryProps {
  balance: number;
  monthlyAllowance: number;
  daysLeft: number;
  totalSpent: number;
}

export function CreditsSummary({
  balance,
  monthlyAllowance,
  daysLeft,
  totalSpent,
}: CreditsSummaryProps) {
  const percentUsed = ((monthlyAllowance - balance) / monthlyAllowance) * 100;
  
  return (
    <div className="relative rounded-2xl border border-white/[0.12] bg-[linear-gradient(155deg,rgba(12,22,46,0.88),rgba(7,14,32,0.80))] backdrop-blur-xl p-6 overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.10),0_16px_48px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.07)]">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.09] to-transparent" />
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">Credits</h2>
        <div className="w-12 h-12 bg-cyan-500/10 rounded-full flex items-center justify-center">
          <span className="text-2xl">⚡</span>
        </div>
      </div>
      
      <div className="space-y-4">
        {/* Balance */}
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-white">{formatCredits(balance)}</span>
            <span className="text-white/40">/ {formatCredits(monthlyAllowance)}</span>
          </div>
          <p className="text-sm text-white/40 mt-1">Available credits this month</p>
        </div>
        
        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-white/40">
            <span>Usage</span>
            <span>{percentUsed.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden border border-white/[0.05]">
            <div 
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
              style={{ width: `${percentUsed}%` }}
            />
          </div>
        </div>
        
        {/* Stats Row */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.07]">
          <div>
            <p className="text-xs text-white/40">Used This Month</p>
            <p className="text-lg font-semibold text-white">{formatCredits(totalSpent)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/40">Resets In</p>
            <p className="text-lg font-semibold text-cyan-400">{daysLeft} days</p>
          </div>
        </div>
      </div>
    </div>
  );
}
