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
    <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-cyan-500/20 rounded-xl p-6 backdrop-blur-sm">
      <h2 className="text-xl font-semibold text-white mb-6">Usage This Month</h2>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Total Jobs */}
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm mb-1">Total Jobs</p>
          <p className="text-2xl font-bold text-white">{stats.totalJobs}</p>
        </div>
        
        {/* Completed */}
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm mb-1">Completed</p>
          <p className="text-2xl font-bold text-green-400">{stats.completedJobs}</p>
        </div>
        
        {/* Success Rate */}
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm mb-1">Success Rate</p>
          <p className="text-2xl font-bold text-cyan-400">{successRate}%</p>
        </div>
        
        {/* Credits Spent */}
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm mb-1">Credits Spent</p>
          <p className="text-2xl font-bold text-white">{formatCredits(stats.totalCreditsSpent)}</p>
        </div>
      </div>
      
      {/* Top Agents */}
      {topAgents.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
            Most Used Agents
          </h3>
          <div className="space-y-2">
            {topAgents.map(([agentId, count]) => {
              const agent = getAgent(agentId);
              const percentage = ((count / stats.totalJobs) * 100).toFixed(0);
              
              return (
                <div key={agentId} className="flex items-center gap-3">
                  <span className="text-xl">{agent?.icon || '🤖'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-white truncate">
                        {agent?.name || agentId}
                      </span>
                      <span className="text-sm text-gray-400">{count} jobs</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
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
