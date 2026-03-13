'use client';

/**
 * components/chat/shell/AgentControlStrip.tsx
 * =============================================
 * Horizontal strip showing active + delegated agents.
 * Appears below the header when multi-agent coordination is happening.
 */

import { motion } from 'framer-motion';
import { getAgentContract } from '@/lib/agents/contracts';

interface Props {
  activeAgentId: string;
  delegatedAgents: string[];
  onSelectAgent: (id: string) => void;
}

export function AgentControlStrip({ activeAgentId, delegatedAgents, onSelectAgent }: Props) {
  if (delegatedAgents.length === 0) return null;

  const allAgents = [activeAgentId, ...delegatedAgents.filter(id => id !== activeAgentId)];

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="flex-shrink-0 overflow-hidden"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto">
        <span className="text-[10px] font-medium flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
          Active:
        </span>
        {allAgents.map((id) => {
          const agent = getAgentContract(id);
          const isActive = id === activeAgentId;
          return (
            <button
              key={id}
              onClick={() => onSelectAgent(id)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full transition-all flex-shrink-0"
              style={{
                backgroundColor: isActive ? 'var(--color-accent-soft)' : 'var(--color-surface)',
                color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
              }}
            >
              <span>{agent?.icon || '🤖'}</span>
              <span className="font-medium">{agent?.name || id}</span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 ml-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
