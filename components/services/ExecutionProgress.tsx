import { Progress } from '@/components/ui/progress';

type ExecutionProgressProps = {
  progress: number;
  label?: string;
};

export function ExecutionProgress({ progress, label = 'Execution Progress' }: ExecutionProgressProps) {
  const safe = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-app-muted">
        <span>{label}</span>
        <span>{safe}%</span>
      </div>
      <Progress value={safe} />
    </div>
  );
}
