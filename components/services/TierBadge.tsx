import { cn } from '@/lib/utils';

type TierBadgeProps = {
  plan?: 'FREE' | 'PRO' | 'PREMIUM' | 'ENTERPRISE';
  className?: string;
};

const TIER_META = {
  FREE:       { label: 'Free',       classes: 'border-white/[0.12] bg-white/[0.05] text-white/55' },
  PRO:        { label: 'Pro',        classes: 'border-cyan-400/35 bg-cyan-400/[0.10] text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.12)]' },
  PREMIUM:    { label: 'Premium',    classes: 'border-cyan-400/35 bg-cyan-400/[0.10] text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.12)]' },
  ENTERPRISE: { label: 'Enterprise', classes: 'border-amber-400/35 bg-amber-400/[0.10] text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.12)]' },
} as const;

export function TierBadge({ plan = 'FREE', className }: TierBadgeProps) {
  const meta = TIER_META[plan];
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold tracking-[0.06em] uppercase backdrop-blur-sm',
        meta.classes,
        className
      )}
    >
      {meta.label}
    </span>
  );
}
