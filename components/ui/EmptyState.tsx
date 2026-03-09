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
        'relative rounded-2xl border border-white/[0.12] bg-[linear-gradient(155deg,rgba(12,22,46,0.85),rgba(7,14,32,0.75))] backdrop-blur-xl p-8 text-center overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.10),0_16px_48px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]',
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