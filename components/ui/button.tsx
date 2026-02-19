"use client";

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-xl text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
  {
    variants: {
      variant: {
        default:
          'border border-app-border/40 bg-app-surface/75 text-app-text hover:bg-app-elevated/80',
        primary:
          'bg-gradient-to-r from-indigo-500 via-cyan-500 to-sky-500 text-white shadow-neon hover:brightness-110',
        secondary:
          'border border-app-border/40 bg-app-surface/75 text-app-text hover:bg-app-elevated/80',
        outline:
          'border border-white/20 bg-transparent text-app-text hover:bg-app-surface/60',
        ghost:
          'text-app-muted hover:text-app-text hover:bg-app-surface/60',
        glow:
          'bg-gradient-to-r from-indigo-500 via-cyan-500 to-sky-500 text-white shadow-neon hover:brightness-110',
        danger:
          'bg-app-danger/20 text-red-100 border border-app-danger/40 hover:bg-app-danger/30',
        destructive:
          'bg-app-danger/20 text-red-100 border border-app-danger/40 hover:bg-app-danger/30',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-9 px-3.5',
        md: 'h-10 px-4',
        lg: 'h-11 px-5 text-base',
        icon: 'h-10 w-10',
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
