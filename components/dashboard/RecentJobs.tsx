/**
 * Recent Jobs List Component
 */

'use client';

import { getAgent } from '@/lib/agents/registry';
import { formatCredits } from '@/lib/billing/plans';

interface Job {
  id: string;
  agent_id: string;
  type?: string;
  status: string;
  cost_credits?: number;
  cost?: number;
  created_at: string;
}

interface RecentJobsProps {
  jobs: Job[];
}

export function RecentJobs({ jobs }: RecentJobsProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'processing': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'queued': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'error': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done': return '✓';
case 'processing': return '⟳';
      case 'queued': return '⋯';
      case 'error': return '✗';
      default: return '•';
    }
  };
  
  if (jobs.length === 0) {
    return (
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-cyan-500/20 rounded-xl p-8 backdrop-blur-sm text-center">
        <span className="text-6xl mb-4 block">📋</span>
        <h3 className="text-xl font-semibold text-white mb-2">No Jobs Yet</h3>
        <p className="text-gray-400">Start using agents to see your job history here</p>
      </div>
    );
  }
  
  return (
    <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-cyan-500/20 rounded-xl p-6 backdrop-blur-sm">
      <h2 className="text-xl font-semibold text-white mb-4">Recent Jobs</h2>
      
      <div className="space-y-3">
        {jobs.map((job) => {
          const agent = getAgent(job.agent_id);
          return (
            <div
              key={job.id}
              className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-gray-700 hover:border-cyan-500/30 transition"
            >
              {/* Left: Agent + Type */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="text-2xl">🤖</div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-white font-medium truncate">
                    {agent?.name || job.agent_id}
                  </h4>
                  <p className="text-sm text-gray-400 truncate">{job.type || job.agent_id}</p>
                </div>
              </div>
              
              {/* Middle: Status */}
              <div className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(job.status)}`}>
                {getStatusIcon(job.status)} {job.status}
              </div>
              
              {/* Right: Cost + Time */}
              <div className="text-right ml-4">
                <p className="text-sm font-medium text-white">{formatCredits(job.cost_credits ?? job.cost ?? 0)} cr</p>
                <p className="text-xs text-gray-400">
                  {new Date(job.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-4 text-center">
        <a
          href="/jobs"
          className="text-sm text-cyan-400 hover:text-cyan-300 transition"
        >
          View All Jobs →
        </a>
      </div>
    </div>
  );
}
