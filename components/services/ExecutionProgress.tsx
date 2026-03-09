import { Progress } from '@/components/ui/progress';

type ExecutionProgressProps = {
  progress: number;
  label?: string;
};

export function ExecutionProgress({ progress, label = 'Execution Progress' }: ExecutionProgressProps) {
  const safe = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-white/50 tracking-wide">{label}</span>
        <span
          className="text-[11px] font-bold tabular-nums"
          style={{ color: safe === 100 ? '#34d399' : '#22d3ee' }}
        >
          {safe}%
        </span>
      </div>
      <Progress value={safe} />
    </div>
  );
}
