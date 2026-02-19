import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type SpinnerProps = {
  className?: string;
  label?: string;
};

export function Spinner({ className, label }: SpinnerProps) {
  return (
    <div className={cn('inline-flex items-center gap-2 text-app-muted', className)}>
      <Loader2 className="h-4 w-4 animate-spin text-app-neon" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}