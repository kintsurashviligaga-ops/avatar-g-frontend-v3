'use client';

/**
 * components/chat/shared/AgentBadge.tsx
 * ======================================
 * Displays agent identity: icon + name + optional status dot.
 * Used in headers, message bubbles, and handoff cards.
 */

import { getAgentContract } from '@/lib/agents/contracts';

interface Props {
  agentId: string;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  className?: string;
}

const SIZES = {
  sm: { icon: 'w-6 h-6 text-xs', text: 'text-[10px]' },
  md: { icon: 'w-8 h-8 text-sm', text: 'text-xs' },
  lg: { icon: 'w-10 h-10 text-base', text: 'text-sm' },
};

export function AgentBadge({ agentId, size = 'md', showName = false, className = '' }: Props) {
  const agent = getAgentContract(agentId);
  const s = SIZES[size];

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div
        className={`${s.icon} rounded-xl flex items-center justify-center flex-shrink-0`}
        style={{
          background: agentId === 'agent-g'
            ? 'linear-gradient(135deg, var(--color-accent), #8b5cf6)'
            : 'var(--color-surface)',
          border: agentId === 'agent-g' ? 'none' : '1px solid var(--color-border)',
          boxShadow: agentId === 'agent-g' ? '0 0 12px var(--color-accent-soft)' : 'none',
        }}
      >
        <span>{agent?.icon || '🤖'}</span>
      </div>
      {showName && (
        <span className={`${s.text} font-medium truncate`} style={{ color: 'var(--color-text-secondary)' }}>
          {agent?.name || agentId}
        </span>
      )}
    </div>
  );
}
