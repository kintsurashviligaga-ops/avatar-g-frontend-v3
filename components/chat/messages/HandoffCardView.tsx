'use client';

/**
 * components/chat/messages/HandoffCardView.tsx
 * =============================================
 * Visual card showing agent-to-agent handoff
 * with source → target agent, task summary.
 */

import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { AgentBadge } from '../shared/AgentBadge';

interface Props {
  fromAgent: string;
  toAgent: string;
  taskSummary: string;
  status: 'pending' | 'delegated' | 'in-progress' | 'completed' | 'failed';
}

export function HandoffCardView({ fromAgent, toAgent, taskSummary, status }: Props) {
  return (
    <div
      className="rounded-2xl p-3.5"
      style={{ backgroundColor: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <AgentBadge agentId={fromAgent} size="sm" showName />
        <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-accent)' }} />
        <AgentBadge agentId={toAgent} size="sm" showName />
        <span className="ml-auto">
          {status === 'completed' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
          {status === 'delegated' && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-accent)' }} />}
          {status === 'pending' && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />}
        </span>
      </div>
      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        {taskSummary}
      </p>
    </div>
  );
}
