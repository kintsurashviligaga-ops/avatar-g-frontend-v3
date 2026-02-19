import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium', {
  variants: {
    variant: {
      default: 'border-white/15 bg-white/10 text-app-muted',
      neutral: 'border-white/15 bg-white/10 text-app-muted',
      success: 'border-app-success/45 bg-app-success/20 text-emerald-200',
      warning: 'border-app-warning/45 bg-app-warning/20 text-amber-200',
      danger: 'border-app-danger/45 bg-app-danger/20 text-red-200',
      accent: 'border-app-accent/45 bg-app-accent/20 text-indigo-200',
      error: 'border-app-danger/45 bg-app-danger/20 text-red-200',
      primary: 'border-app-accent/45 bg-app-accent/20 text-indigo-200',
      secondary: 'border-white/20 bg-white/5 text-gray-200',
      outline: 'border-white/20 bg-transparent text-gray-300',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
