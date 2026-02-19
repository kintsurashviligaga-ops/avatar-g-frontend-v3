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
    <div className={cn('ag-card text-center', className)}>
      {icon && <div className="mx-auto mb-3 flex w-fit rounded-xl border border-app-border/30 bg-app-surface/70 p-3 text-app-neon">{icon}</div>}
      <h3 className="text-base font-semibold text-app-text">{title}</h3>
      <p className="mt-1 text-sm text-app-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}