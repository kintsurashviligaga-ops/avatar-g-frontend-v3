'use client';

import { cn } from '@/lib/utils';
import { NodeBadge } from './NodeBadge';
import type { WaveStreamState } from '@/lib/hooks/usePipelineStream';

// Wave-level status label + colour
const WAVE_STATUS_META = {
  pending: { label: 'Pending', classes: 'text-white/35 border-white/[0.10] bg-white/[0.03]' },
  running: {
    label: 'Running',
    classes:
      'text-cyan-200 border-cyan-400/35 bg-cyan-400/[0.07] shadow-[0_0_10px_rgba(34,211,238,0.10)]',
  },
  completed: {
    label: 'Completed',
    classes:
      'text-emerald-200 border-emerald-400/30 bg-emerald-400/[0.07] shadow-[0_0_8px_rgba(52,211,153,0.10)]',
  },
  failed: {
    label: 'Failed',
    classes: 'text-red-300 border-red-400/30 bg-red-400/[0.07] shadow-[0_0_8px_rgba(248,113,113,0.10)]',
  },
};

interface WaveRowProps {
  wave: WaveStreamState;
  /** Whether this wave has at least one node that ran in parallel with another. */
  isParallel?: boolean;
}

export function WaveRow({ wave, isParallel }: WaveRowProps) {
  const meta = WAVE_STATUS_META[wave.status];

  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3 transition-all duration-500',
        wave.status === 'running'
          ? 'border-cyan-400/25 bg-white/[0.04]'
          : wave.status === 'completed'
          ? 'border-emerald-400/20 bg-white/[0.03]'
          : wave.status === 'failed'
          ? 'border-red-400/20 bg-white/[0.03]'
          : 'border-white/[0.07] bg-white/[0.02]'
      )}
    >
      {/* Wave header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-white/35">
            Wave {wave.index + 1}
          </span>
          {isParallel && wave.nodes.length > 1 && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-blue-300/60 border border-blue-300/20 bg-blue-300/[0.07] rounded-full px-1.5 py-0.5">
              {wave.nodes.length}× parallel
            </span>
          )}
        </div>

        {/* Status pill */}
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-bold tracking-[0.08em] uppercase',
            meta.classes
          )}
        >
          {wave.status === 'running' && (
            <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />
          )}
          {meta.label}
        </span>
      </div>

      {/* Node badges — horizontal, wrapping */}
      <div className="flex flex-wrap gap-2">
        {wave.nodes.map((node) => (
          <NodeBadge
            key={node.id}
            id={node.id}
            tool={node.tool}
            status={node.status}
            fromCache={node.fromCache}
          />
        ))}
      </div>

      {/* Per-wave progress bar — only shown while running */}
      {wave.status === 'running' && (
        <div className="mt-3 h-px w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-blue-500 to-sky-400 transition-all duration-500 ease-out"
            style={{
              width: `${
                wave.nodes.length > 0
                  ? Math.round(
                      (wave.nodes.filter((n) => n.status === 'completed' || n.status === 'failed')
                        .length /
                        wave.nodes.length) *
                        100
                    )
                  : 0
              }%`,
              boxShadow: '0 0 6px rgba(34,211,238,0.6)',
            }}
          />
        </div>
      )}
    </div>
  );
}
