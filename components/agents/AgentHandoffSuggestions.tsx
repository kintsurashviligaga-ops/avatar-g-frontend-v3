/**
 * components/agents/AgentHandoffSuggestions.tsx
 * ==============================================
 * Shows "Next Steps" after agent output, suggesting handoff to other agents.
 * e.g. "Continue with Video Agent →" or "Send to QA Agent for scoring"
 */

'use client';

import { useMemo } from 'react';
import { getAgentContract, getHandoffTargets, type AgentContract } from '@/lib/agents/contracts';

interface AgentHandoffSuggestionsProps {
  currentAgentId: string;
  locale: string;
  onSelect: (agentId: string, serviceSlug: string) => void;
  maxSuggestions?: number;
}

const LABELS = {
  en: { nextSteps: 'Next Steps', continueWith: 'Continue with' },
  ka: { nextSteps: 'შემდეგი ნაბიჯები', continueWith: 'გაგრძელება' },
  ru: { nextSteps: 'Следующие шаги', continueWith: 'Продолжить с' },
} as const;

export default function AgentHandoffSuggestions({
  currentAgentId,
  locale,
  onSelect,
  maxSuggestions = 4,
}: AgentHandoffSuggestionsProps) {
  const labels = LABELS[locale as keyof typeof LABELS] ?? LABELS.en;
  const targets = useMemo(
    () => getHandoffTargets(currentAgentId).slice(0, maxSuggestions),
    [currentAgentId, maxSuggestions]
  );

  if (targets.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
        {labels.nextSteps}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {targets.map((agent) => (
          <button
            key={agent.agentId}
            onClick={() => onSelect(agent.agentId, agent.serviceSlugs[0] ?? '')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-all hover:scale-[1.02]"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <span>{agent.icon}</span>
            <span>{getLocalizedName(agent, locale)}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function getLocalizedName(agent: AgentContract, locale: string): string {
  if (locale === 'ka') return agent.nameKa;
  if (locale === 'ru') return agent.nameRu;
  return agent.name;
}
