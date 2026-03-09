import * as React from 'react';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border border-white/[0.08] bg-[linear-gradient(155deg,rgba(7,14,30,0.85),rgba(4,9,22,0.75))] backdrop-blur-2xl p-8 text-center overflow-hidden',
        className
      )}
    >
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      {icon && (
        <div className="mx-auto mb-4 flex w-fit rounded-xl border border-cyan-400/25 bg-cyan-400/[0.08] p-3 text-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.15)]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm text-white/45 leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}