import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva('rounded-2xl border p-5', {
  variants: {
    variant: {
      glass: 'ag-glass border-app-border/30',
      soft: 'border-white/10 bg-app-surface/70',
      solid: 'border-app-border/40 bg-app-elevated/85',
    },
  },
  defaultVariants: {
    variant: 'glass',
  },
});

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
        glow && 'shadow-[0_0_40px_rgba(6,182,212,0.15)]',
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
    <h3 ref={ref} className={cn('text-lg font-semibold text-app-text', className)} {...props} />
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
