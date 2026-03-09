/**
 * Usage Statistics Component
 */

'use client';

import { getAgent } from '@/lib/agents/registry';
import { formatCredits } from '@/lib/billing/plans';

interface UsageStatsProps {
  stats: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    totalCreditsSpent: number;
    jobsByAgent: Record<string, number>;
  };
}

export function UsageStats({ stats }: UsageStatsProps) {
  const successRate = stats.totalJobs > 0 
    ? ((stats.completedJobs / stats.totalJobs) * 100).toFixed(1)
    : '0';
  
  // Sort agents by usage
  const topAgents = Object.entries(stats.jobsByAgent)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  
  return (
    <div className="relative rounded-2xl border border-white/[0.12] bg-[linear-gradient(155deg,rgba(12,22,46,0.88),rgba(7,14,32,0.80))] backdrop-blur-xl p-6 overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.10),0_16px_48px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.07)]">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.09] to-transparent" />
      <h2 className="text-lg font-bold text-white mb-6 tracking-tight">Usage This Month</h2>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {/* Total Jobs */}
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
          <p className="text-white/45 text-xs font-medium mb-1.5 tracking-wide">Total Jobs</p>
          <p className="text-2xl font-black text-white">{stats.totalJobs}</p>
        </div>
        
        {/* Completed */}
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
          <p className="text-white/45 text-xs font-medium mb-1.5 tracking-wide">Completed</p>
          <p className="text-2xl font-black text-emerald-300">{stats.completedJobs}</p>
        </div>
        
        {/* Success Rate */}
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4">
          <p className="text-white/45 text-xs font-medium mb-1.5 tracking-wide">Success Rate</p>
          <p className="text-2xl font-black text-cyan-300">{successRate}%</p>
        </div>
        
        {/* Credits Spent */}
        <div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.05] p-4">
          <p className="text-white/45 text-xs font-medium mb-1.5 tracking-wide">Credits Spent</p>
          <p className="text-2xl font-black text-white">{formatCredits(stats.totalCreditsSpent)}</p>
        </div>
      </div>
      
      {/* Top Agents */}
      {topAgents.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-white/40 mb-3 uppercase tracking-[0.08em]">
            Most Used Agents
          </h3>
          <div className="space-y-2">
            {topAgents.map(([agentId, count]) => {
              const agent = getAgent(agentId);
              const percentage = ((count / stats.totalJobs) * 100).toFixed(0);
              
              return (
                <div key={agentId} className="flex items-center gap-3">
                  <span className="text-xl">🤖</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-white truncate">
                        {agent?.name || agentId}
                      </span>
                      <span className="text-sm text-white/40">{count} jobs</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden border border-white/[0.05]">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
