import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-[0.05em] backdrop-blur-sm',
  {
    variants: {
      variant: {
        default:     'border-white/[0.12] bg-white/[0.07] text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
        neutral:     'border-white/[0.12] bg-white/[0.07] text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
        success:     'border-emerald-400/35 bg-emerald-400/[0.12] text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.15)]',
        warning:     'border-amber-400/35 bg-amber-400/[0.12] text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.15)]',
        danger:      'border-red-400/35 bg-red-400/[0.12] text-red-200 shadow-[0_0_12px_rgba(248,113,113,0.15)]',
        error:       'border-red-400/35 bg-red-400/[0.12] text-red-200 shadow-[0_0_12px_rgba(248,113,113,0.15)]',
        accent:      'border-cyan-400/35 bg-cyan-400/[0.12] text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.15)]',
        primary:     'border-cyan-400/35 bg-cyan-400/[0.12] text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.15)]',
        secondary:   'border-white/[0.12] bg-white/[0.05] text-white/70',
        outline:     'border-white/[0.15] bg-transparent text-white/60',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
