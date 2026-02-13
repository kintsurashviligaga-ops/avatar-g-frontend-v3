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
    <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-cyan-500/20 rounded-xl p-6 backdrop-blur-sm">
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
            <span className="text-gray-400">/ {formatCredits(monthlyAllowance)}</span>
          </div>
          <p className="text-sm text-gray-400 mt-1">Available credits this month</p>
        </div>
        
        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Usage</span>
            <span>{percentUsed.toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
              style={{ width: `${percentUsed}%` }}
            />
          </div>
        </div>
        
        {/* Stats Row */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-700">
          <div>
            <p className="text-xs text-gray-400">Used This Month</p>
            <p className="text-lg font-semibold text-white">{formatCredits(totalSpent)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Resets In</p>
            <p className="text-lg font-semibold text-cyan-400">{daysLeft} days</p>
          </div>
        </div>
      </div>
    </div>
  );
}
