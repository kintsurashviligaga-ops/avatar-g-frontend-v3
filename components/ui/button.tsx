"use client";

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-xl text-base font-semibold tracking-[0.01em] transition-all duration-300 disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-neon/70 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg ag-glass ag-hover-lift',
  {
    variants: {
      variant: {
        default:
          'border border-app-border/30 bg-app-surface/80 text-app-text hover:bg-app-elevated/95 active:scale-[0.985] ag-border-glow',
        primary:
          'bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-500 text-white shadow-[0_12px_30px_rgba(34,211,238,0.22)] hover:brightness-110 hover:shadow-[0_18px_40px_rgba(34,211,238,0.30)] active:scale-[0.985] ag-border-glow',
        secondary:
          'border border-app-border/30 bg-app-surface/80 text-app-text hover:bg-app-elevated/95 active:scale-[0.985] ag-border-glow',
        outline:
          'border border-white/20 bg-transparent text-app-text hover:bg-app-surface/70 hover:border-white/35 active:scale-[0.985] ag-border-glow',
        ghost:
          'text-app-muted hover:text-app-text hover:bg-app-surface/70 active:scale-[0.985] ag-border-glow',
        glow:
          'bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-500 text-white shadow-[0_0_28px_rgba(124,92,252,0.36)] hover:brightness-110 hover:shadow-[0_0_36px_rgba(124,92,252,0.48)] active:scale-[0.985] ag-border-glow',
        danger:
          'bg-app-danger/20 text-red-100 border border-app-danger/40 hover:bg-app-danger/30 active:scale-[0.98]',
        destructive:
          'bg-app-danger/20 text-red-100 border border-app-danger/40 hover:bg-app-danger/30 active:scale-[0.98]',
      },
      size: {
        default: 'h-11 px-6 gap-2',
        sm: 'h-9 px-4 text-sm gap-1.5',
        md: 'h-11 px-6 gap-2',
        lg: 'h-12 px-8 text-base md:text-lg gap-2.5',
        icon: 'h-11 w-11',
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
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          className="h-4 w-4 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
);

Button.displayName = 'Button';

export { Button, buttonVariants };
