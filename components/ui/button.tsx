"use client";

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-xl text-base font-semibold tracking-[0.01em] transition-all duration-300 disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020816]',
  {
    variants: {
      variant: {
        default:
          'border border-white/[0.14] bg-[linear-gradient(135deg,rgba(14,26,52,0.90),rgba(8,16,38,0.80))] text-white/85 shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_8px_24px_rgba(0,0,0,0.40)] hover:border-white/[0.26] hover:text-white hover:bg-[linear-gradient(135deg,rgba(20,36,70,0.92),rgba(12,22,50,0.88))] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.22),0_0_24px_rgba(34,211,238,0.18),0_8px_28px_rgba(0,0,0,0.50)] active:scale-[0.985] backdrop-blur-xl',
        primary:
          'bg-gradient-to-r from-cyan-400 via-blue-500 to-sky-500 text-white shadow-[0_0_20px_rgba(34,211,238,0.25),0_8px_24px_rgba(0,0,0,0.4)] hover:brightness-110 hover:shadow-[0_0_28px_rgba(34,211,238,0.38),0_8px_28px_rgba(0,0,0,0.5)] active:scale-[0.985]',
        secondary:
          'border border-white/[0.14] bg-[linear-gradient(135deg,rgba(14,26,52,0.90),rgba(8,16,38,0.80))] text-white/80 shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_8px_24px_rgba(0,0,0,0.40)] hover:border-white/[0.24] hover:text-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.20),0_0_24px_rgba(34,211,238,0.14)] active:scale-[0.985] backdrop-blur-xl',
        outline:
          'border border-white/[0.18] bg-transparent text-white/75 hover:bg-white/[0.06] hover:border-white/[0.30] hover:text-white active:scale-[0.985]',
        ghost:
          'text-white/50 hover:text-white/85 hover:bg-white/[0.06] active:scale-[0.985]',
        glow:
          'bg-gradient-to-r from-cyan-400 via-blue-500 to-sky-500 text-white shadow-[0_0_28px_rgba(34,211,238,0.36)] hover:brightness-110 hover:shadow-[0_0_40px_rgba(34,211,238,0.50)] active:scale-[0.985]',
        danger:
          'bg-red-500/[0.12] text-red-200 border border-red-400/[0.30] hover:bg-red-500/[0.20] active:scale-[0.98]',
        destructive:
          'bg-red-500/[0.12] text-red-200 border border-red-400/[0.30] hover:bg-red-500/[0.20] active:scale-[0.98]',
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
