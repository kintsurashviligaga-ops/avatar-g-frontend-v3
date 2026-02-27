"use client";

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center radius-lg text-base font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 shadow-md',
  {
    variants: {
      variant: {
        default:
          'border border-app-border/40 bg-app-surface/80 text-app-text hover:bg-app-elevated/90 active:scale-98',
        primary:
          'bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white shadow-lg hover:brightness-110 active:scale-98 focus-visible:ring-cyan-400/80',
        secondary:
          'border border-app-border/40 bg-app-surface/80 text-app-text hover:bg-app-elevated/90 active:scale-98',
        outline:
          'border border-white/20 bg-transparent text-app-text hover:bg-app-surface/70 active:scale-98',
        ghost:
          'text-app-muted hover:text-app-text hover:bg-app-surface/70 active:scale-98',
        glow:
          'bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white shadow-lg hover:brightness-110 active:scale-98',
        danger:
          'bg-app-danger/20 text-red-100 border border-app-danger/40 hover:bg-app-danger/30 active:scale-98',
        destructive:
          'bg-app-danger/20 text-red-100 border border-app-danger/40 hover:bg-app-danger/30 active:scale-98',
      },
      size: {
        default: 'h-11 px-6 spacing-md',
        sm: 'h-9 px-4 text-sm spacing-sm',
        md: 'h-11 px-6 spacing-md',
        lg: 'h-12 px-8 text-lg spacing-lg',
        icon: 'h-11 w-11 spacing-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);

Button.displayName = 'Button';

export { Button, buttonVariants };
