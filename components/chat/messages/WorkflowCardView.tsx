'use client';

/**
 * components/chat/messages/WorkflowCardView.tsx
 * ================================================
 * Shows workflow progress with step indicators, current step highlight,
 * and completion percentage.
 */

import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, Circle, XCircle, SkipForward } from 'lucide-react';
import type { WorkflowSnapshot } from '@/lib/chat/types';

interface Props {
  snapshot: WorkflowSnapshot;
}

const STATUS_ICONS = {
  completed: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  running: <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-accent)' }} />,
  pending: <Circle className="w-4 h-4" style={{ color: 'var(--color-text-tertiary)' }} />,
  failed: <XCircle className="w-4 h-4 text-red-400" />,
  skipped: <SkipForward className="w-4 h-4" style={{ color: 'var(--color-text-tertiary)' }} />,
};

export function WorkflowCardView({ snapshot }: Props) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">⚡</span>
          <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {snapshot.workflowType}
          </h4>
        </div>
        <span className="text-[11px] font-medium" style={{ color: 'var(--color-accent)' }}>
          {snapshot.percent}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full mb-3" style={{ backgroundColor: 'var(--color-border)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: 'var(--color-accent)' }}
          initial={{ width: 0 }}
          animate={{ width: `${snapshot.percent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {snapshot.steps.map((step) => (
          <div
            key={step.index}
            className="flex items-center gap-2.5 py-1"
          >
            {STATUS_ICONS[step.status] || STATUS_ICONS.pending}
            <span
              className="text-xs"
              style={{
                color: step.status === 'running'
                  ? 'var(--color-accent)'
                  : step.status === 'completed'
                    ? 'var(--color-text)'
                    : 'var(--color-text-tertiary)',
                fontWeight: step.status === 'running' ? 600 : 400,
              }}
            >
              {step.label}
            </span>
            {step.agentId && (
              <span className="text-[10px] ml-auto" style={{ color: 'var(--color-text-tertiary)' }}>
                {step.agentId}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
