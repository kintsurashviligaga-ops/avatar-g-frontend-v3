import { Badge } from '@/components/ui/badge';

export type ServiceRunStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'idle';

type StatusBadgeProps = {
  status: ServiceRunStatus;
};

const STATUS_META: Record<ServiceRunStatus, { label: string; variant: 'warning' | 'success' | 'danger' | 'outline'; pulse?: boolean }> = {
  idle: { label: 'Idle', variant: 'outline' },
  queued: { label: 'Queued', variant: 'warning' },
  processing: { label: 'Processing', variant: 'warning', pulse: true },
  completed: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
  cancelled: { label: 'Cancelled', variant: 'outline' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const meta = STATUS_META[status] ?? STATUS_META.idle;

  return (
    <Badge variant={meta.variant} className={meta.pulse ? 'animate-pulse' : ''}>
      {meta.label}
    </Badge>
  );
}
