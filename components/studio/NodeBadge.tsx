'use client';

import { cn } from '@/lib/utils';
import type { NodeStreamStatus } from '@/lib/hooks/usePipelineStream';

const TOOL_LABELS: Record<string, string> = {
  generate_image: 'Image',
  generate_video: 'Video',
  compose_music: 'Music',
  create_avatar: 'Avatar',
  run_workflow: 'Workflow',
};

const STATUS_STYLES: Record<NodeStreamStatus, {
  dot: string;
  ring: string;
  text: string;
  bg: string;
  label: string;
}> = {
  pending: {
    dot: 'bg-white/20',
    ring: 'border-white/[0.12]',
    text: 'text-white/40',
    bg: 'bg-white/[0.04]',
    label: 'Pending',
  },
  running: {
    dot: 'bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(34,211,238,0.9)]',
    ring: 'border-cyan-400/40',
    text: 'text-cyan-200',
    bg: 'bg-cyan-400/[0.08]',
    label: 'Running',
  },
  completed: {
    dot: 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]',
    ring: 'border-emerald-400/35',
    text: 'text-emerald-200',
    bg: 'bg-emerald-400/[0.07]',
    label: 'Done',
  },
  failed: {
    dot: 'bg-red-400 shadow-[0_0_5px_rgba(248,113,113,0.7)]',
    ring: 'border-red-400/35',
    text: 'text-red-300',
    bg: 'bg-red-400/[0.07]',
    label: 'Failed',
  },
};

interface NodeBadgeProps {
  id: string;
  tool: string;
  status: NodeStreamStatus;
  fromCache?: boolean;
  className?: string;
}

export function NodeBadge({ id: _id, tool, status, fromCache, className }: NodeBadgeProps) {
  const s = STATUS_STYLES[status];
  const label = TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ');

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-xl border backdrop-blur-sm',
        'transition-all duration-300',
        s.ring,
        s.bg,
        className
      )}
    >
      {/* Status dot */}
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', s.dot)} />

      {/* Tool name */}
      <span className={cn('text-[11px] font-semibold tracking-wide whitespace-nowrap', s.text)}>
        {label}
      </span>

      {/* Cache indicator */}
      {fromCache && status === 'completed' && (
        <span
          className="text-[9px] font-bold uppercase tracking-wider text-amber-300/70 border border-amber-300/25 bg-amber-300/[0.08] rounded-full px-1.5 py-0.5"
          title="Served from cache"
        >
          cached
        </span>
      )}
    </div>
  );
}
