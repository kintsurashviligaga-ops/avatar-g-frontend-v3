import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type SpinnerProps = {
  className?: string;
  label?: string;
};

export function Spinner({ className, label }: SpinnerProps) {
  return (
    <div className={cn('inline-flex items-center gap-2 text-white/50', className)}>
      <Loader2
        className="h-4 w-4 animate-spin"
        style={{ color: '#22d3ee', filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.8))' }}
      />
      {label && <span className="text-xs font-medium tracking-wide">{label}</span>}
    </div>
  );
}