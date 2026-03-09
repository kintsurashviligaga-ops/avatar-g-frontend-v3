import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';

type CostBadgeProps = {
  credits: number;
  compact?: boolean;
  className?: string;
};

export function CostBadge({ credits, compact = false, className }: CostBadgeProps) {
  const label = compact ? `${credits}cr` : `${credits} credits`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-amber-400/30 bg-amber-400/[0.08] text-[10px] font-bold text-amber-200 tracking-[0.05em] shadow-[0_0_8px_rgba(245,158,11,0.10)] backdrop-blur-sm',
        className
      )}
    >
      <Zap className="w-3 h-3" />
      {label}
    </span>
  );
}
