"use client";

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError = false, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'ag-input',
        hasError && 'border-app-danger/60 focus:border-app-danger/70 focus:shadow-[0_0_0_2px_rgba(239,68,68,0.15)]',
        className
      )}
      {...props}
    />
  )
);

Input.displayName = 'Input';

export { Input };