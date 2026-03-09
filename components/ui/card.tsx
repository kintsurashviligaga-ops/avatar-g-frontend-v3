import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  'rounded-2xl border border-white/[0.10] bg-[linear-gradient(155deg,rgba(12,22,46,0.88),rgba(7,14,32,0.80))] backdrop-blur-xl transition-all duration-300 shadow-[0_0_0_1px_rgba(255,255,255,0.13),0_16px_48px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.07)]',
  {
    variants: {
      variant: {
        glass: 'border-cyan-400/[0.12] shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_0_40px_rgba(34,211,238,0.06),inset_0_0_32px_rgba(34,211,238,0.03)]',
        soft: 'border-white/[0.08] bg-white/[0.04] shadow-[0_8px_32px_rgba(0,0,0,0.35)]',
        solid: 'border-white/[0.12] bg-[linear-gradient(135deg,rgba(14,26,58,0.95),rgba(8,15,36,0.92))] shadow-2xl',
      },
    },
    defaultVariants: {
      variant: 'glass',
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  glow?: boolean;
  gradient?: string;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, glow = false, gradient, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        cardVariants({ variant }),
        'relative overflow-hidden',
        glow && 'shadow-[0_0_64px_rgba(6,182,212,0.18)]',
        className
      )}
      {...props}
    >
      {gradient ? <div className={cn('absolute inset-0 bg-gradient-to-br opacity-5', gradient)} /> : null}
      <div className="relative z-10">{children}</div>
    </div>
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mb-4 flex items-center justify-between gap-3', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-2xl md:text-3xl font-bold text-app-text tracking-tight', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-app-muted', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('space-y-3', className)} {...props} />
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mt-4 flex items-center gap-3', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
