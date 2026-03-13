'use client';

/**
 * components/chat/ChatAgentPicker.tsx
 * ====================================
 * Elegant agent picker drawer showing all available agents
 * with their icons, names, and service context.
 */

import { motion } from 'framer-motion';
import { ALL_AGENTS, type AgentContract } from '@/lib/agents/contracts';
import { getChatLabels } from '@/lib/chat/constants.legacy';

interface Props {
  activeAgentId: string;
  language: string;
  onSelect: (agentId: string) => void;
  onClose: () => void;
}

export function ChatAgentPicker({ activeAgentId, language, onSelect, onClose }: Props) {
  const labels = getChatLabels(language);
  const lang = language as 'en' | 'ka' | 'ru';

  // Group: director first, then specialists, then integration
  const directors = ALL_AGENTS.filter(a => a.agentType === 'director' && a.active);
  const specialists = ALL_AGENTS.filter(a => a.agentType === 'specialist' && a.active);
  const integrations = ALL_AGENTS.filter(a => a.agentType === 'integration' && a.active);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="overflow-hidden flex-shrink-0"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <div className="p-3 max-h-[280px] overflow-y-auto space-y-3">
        {/* Director */}
        {directors.length > 0 && (
          <AgentGroup agents={directors} activeId={activeAgentId} lang={lang} onSelect={id => { onSelect(id); onClose(); }} />
        )}
        {/* Specialists */}
        {specialists.length > 0 && (
          <div>
            <span className="text-[10px] uppercase tracking-wider font-medium px-2 mb-1.5 block"
              style={{ color: 'var(--color-text-tertiary)' }}>
              {labels.agentsLabel}
            </span>
            <AgentGroup agents={specialists} activeId={activeAgentId} lang={lang} onSelect={id => { onSelect(id); onClose(); }} />
          </div>
        )}
        {/* Integration */}
        {integrations.length > 0 && (
          <AgentGroup agents={integrations} activeId={activeAgentId} lang={lang} onSelect={id => { onSelect(id); onClose(); }} />
        )}
      </div>
    </motion.div>
  );
}

function AgentGroup({ agents, activeId, lang, onSelect }: {
  agents: AgentContract[];
  activeId: string;
  lang: 'en' | 'ka' | 'ru';
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {agents.map(agent => {
        const isActive = agent.agentId === activeId;
        const name = lang === 'ka' ? agent.nameKa : lang === 'ru' ? agent.nameRu : agent.name;
        return (
          <button
            key={agent.agentId}
            onClick={() => onSelect(agent.agentId)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all"
            style={{
              backgroundColor: isActive ? 'var(--color-accent-soft)' : 'transparent',
              color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            }}
          >
            <span className="text-base w-6 text-center flex-shrink-0">{agent.icon}</span>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium truncate block">{name}</span>
              <span className="text-[10px] truncate block" style={{ color: 'var(--color-text-tertiary)' }}>
                {agent.capabilities.slice(0, 2).join(' · ')}
              </span>
            </div>
            {isActive && (
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--color-accent)' }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
