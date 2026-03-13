/**
 * components/agents/AgentBadge.tsx
 * ================================
 * Displays the active agent identity on service pages.
 * Shows agent name, icon, and "Delegated by Agent G" indicator.
 */

'use client';

import { useMemo } from 'react';
import { AGENT_CONTRACTS, getAgentsForService, type AgentContract } from '@/lib/agents/contracts';

interface AgentBadgeProps {
  serviceSlug: string;
  locale: string;
  size?: 'sm' | 'md';
}

const LABELS = {
  en: { delegatedBy: 'Delegated by Agent G', active: 'Active' },
  ka: { delegatedBy: 'დელეგირებულია Agent G-ით', active: 'აქტიური' },
  ru: { delegatedBy: 'Делегировано Agent G', active: 'Активен' },
} as const;

export default function AgentBadge({ serviceSlug, locale, size = 'sm' }: AgentBadgeProps) {
  const agents = useMemo(() => getAgentsForService(serviceSlug), [serviceSlug]);
  const labels = LABELS[locale as keyof typeof LABELS] ?? LABELS.en;

  if (agents.length === 0) return null;

  const primary = agents[0]!;

  if (size === 'md') {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: 'linear-gradient(135deg, var(--color-accent), rgba(139,92,246,0.7))' }}>
          {primary.icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {getLocalizedName(primary, locale)}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {labels.delegatedBy}
          </span>
        </div>
        {agents.length > 1 && (
          <span className="ml-auto px-1.5 py-0.5 text-[9px] rounded-full" style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
            +{agents.length - 1}
          </span>
        )}
      </div>
    );
  }

  // Small inline badge
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded-full" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
      <span>{primary.icon}</span>
      <span>{getLocalizedName(primary, locale)}</span>
      <span className="w-1 h-1 rounded-full bg-emerald-400" />
    </span>
  );
}

function getLocalizedName(agent: AgentContract, locale: string): string {
  if (locale === 'ka') return agent.nameKa;
  if (locale === 'ru') return agent.nameRu;
  return agent.name;
}
