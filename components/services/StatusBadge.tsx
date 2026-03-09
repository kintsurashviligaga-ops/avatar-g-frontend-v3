import { cn } from '@/lib/utils';

export type ServiceRunStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'idle';

type StatusBadgeProps = {
  status: ServiceRunStatus;
  className?: string;
};

const STATUS_META: Record<ServiceRunStatus, { label: string; classes: string; dot?: string }> = {
  idle:       { label: 'Idle',       classes: 'border-white/[0.12] bg-white/[0.05] text-white/50' },
  queued:     { label: 'Queued',     classes: 'border-amber-400/35 bg-amber-400/[0.10] text-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.12)]', dot: 'bg-amber-400' },
  processing: { label: 'Processing', classes: 'border-cyan-400/40 bg-cyan-400/[0.10] text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.18)]', dot: 'bg-cyan-400 animate-pulse' },
  completed:  { label: 'Completed',  classes: 'border-emerald-400/35 bg-emerald-400/[0.10] text-emerald-200 shadow-[0_0_10px_rgba(52,211,153,0.12)]', dot: 'bg-emerald-400' },
  failed:     { label: 'Failed',     classes: 'border-red-400/35 bg-red-400/[0.10] text-red-300 shadow-[0_0_10px_rgba(248,113,113,0.12)]', dot: 'bg-red-400' },
  cancelled:  { label: 'Cancelled',  classes: 'border-white/[0.12] bg-white/[0.04] text-white/45' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const meta = STATUS_META[status] ?? STATUS_META.idle;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold tracking-[0.06em] uppercase backdrop-blur-sm',
        meta.classes,
        className
      )}
    >
      {meta.dot && <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />}
      {meta.label}
    </span>
  );
}
