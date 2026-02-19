/**
 * Dashboard Header Component
 */

'use client';

import { getPlan, normalizePlanTier, type PlanTier } from '@/lib/billing/plans';

interface DashboardHeaderProps {
  userName: string;
  plan: PlanTier;
}

export function DashboardHeader({ userName, plan }: DashboardHeaderProps) {
  const planName = getPlan(normalizePlanTier(plan)).label;

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
          Welcome back, {userName}
        </h1>
        <p className="text-gray-400 mt-2">
          {planName} Plan • Dashboard Overview
        </p>
      </div>
      
      <div className="flex gap-3">
        <a
          href="/pricing"
          className="px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-400 transition"
        >
          Upgrade Plan
        </a>
        <button
          onClick={async () => {
            const res = await fetch('/api/billing/portal', { method: 'POST' });
            const data = await res.json();
            if (data.url) window.location.href = data.url;
          }}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
        >
          Manage Billing
        </button>
      </div>
    </div>
  );
}
