/**
 * Affiliate Stat Card Component
 * 
 * Displays a metric with an icon and optional trend indicator
 */

'use client';

import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  subtitle?: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  isLoading?: boolean;
}

export function StatCard({
  title,
  value,
  icon,
  subtitle,
  trend,
  isLoading = false,
}: StatCardProps) {
  if (isLoading) {
    return (
      <Card className="bg-black/40 border-white/10 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-white/10 rounded w-1/2 mb-3"></div>
          <div className="h-8 bg-white/10 rounded w-3/4 mb-2"></div>
          {subtitle && <div className="h-3 bg-white/10 rounded w-1/3"></div>}
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-black/60 via-black/40 to-black/60 border-white/10 p-6 hover:border-cyan-500/30 transition-all duration-300">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-400 mb-2">{title}</p>
          <p className="text-3xl font-bold text-white mb-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-500">{subtitle}</p>
          )}
        </div>
        
        {icon && (
          <div className="ml-4 text-cyan-500/70">
            {icon}
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <span
            className={`text-xs font-medium ${
              trend.isPositive ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {trend.isPositive ? '↑' : '↓'} {trend.value}
          </span>
        </div>
      )}
    </Card>
  );
}
