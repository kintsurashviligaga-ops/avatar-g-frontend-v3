'use client';

/**
 * CreditBadge
 *
 * Displays the live credit balance from the AI pipeline store.
 * Colour-codes the state: healthy → cyan, low (≤20%) → amber, empty → red.
 * Optionally shows the cost of running a specific agent so users know
 * before they click whether they can afford the next generation.
 *
 * Usage:
 *   <CreditBadge />
 *   <CreditBadge agent="video" showCost />
 *   <CreditBadge compact />
 */

import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAiPipelineStore,
  selectBalance,
  AGENT_COSTS,
  type AgentType,
} from '@/store/useAiPipelineStore';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Balance at or below this threshold is considered "low" */
const LOW_THRESHOLD_ABSOLUTE = 15;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreditBadgeProps {
  /** Bind to a specific agent to show whether the user can afford it */
  agent?:    AgentType;
  /** Show the cost next to the balance */
  showCost?: boolean;
  /** Minimal mode — icon + number only, no label */
  compact?:  boolean;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreditBadge({ agent, showCost, compact, className }: CreditBadgeProps) {
  const balance = useAiPipelineStore(selectBalance);
  const cost    = agent ? AGENT_COSTS[agent] : 0;

  const isEmpty  = balance === 0;
  const isLow    = !isEmpty && balance <= LOW_THRESHOLD_ABSOLUTE;
  const canAfford = agent ? balance >= cost : true;

  const colorVariant = isEmpty || (agent && !canAfford)
    ? 'empty'
    : isLow
      ? 'low'
      : 'ok';

  const styles: Record<string, string> = {
    ok    : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.12)]',
    low   : 'border-amber-400/30 bg-amber-400/10 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.12)]',
    empty : 'border-red-400/30   bg-red-400/10   text-red-300   shadow-[0_0_10px_rgba(248,113,113,0.12)]',
  };

  const iconStyles: Record<string, string> = {
    ok    : 'text-cyan-400',
    low   : 'text-amber-400',
    empty : 'text-red-400',
  };

  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide backdrop-blur-sm',
          styles[colorVariant],
          className
        )}
        title={`${balance} credits remaining`}
      >
        <Zap className={cn('h-3 w-3', iconStyles[colorVariant])} />
        {balance}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide backdrop-blur-sm',
        styles[colorVariant],
        className
      )}
    >
      <Zap className={cn('h-3.5 w-3.5 shrink-0', iconStyles[colorVariant])} />

      <span>
        {balance}
        {showCost && agent && (
          <span className="ml-1 opacity-60">
            {canAfford ? `/ ${cost} needed` : `— need ${cost}`}
          </span>
        )}
      </span>

      {!compact && (
        <span className="opacity-60">
          {isEmpty
            ? 'no credits'
            : isLow
              ? 'low'
              : 'credits'}
        </span>
      )}
    </span>
  );
}
