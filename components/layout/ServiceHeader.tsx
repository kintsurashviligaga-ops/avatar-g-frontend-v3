import { Badge } from '@/components/ui/badge';

type ServiceHeaderProps = {
  title: string;
  description: string;
  credits?: number;
  action?: React.ReactNode;
};

export function ServiceHeader({ title, description, credits, action }: ServiceHeaderProps) {
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-app-border/25 bg-app-surface/55 p-5 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="accent">Service</Badge>
          {typeof credits === 'number' ? <Badge variant="warning">{credits} credits / job</Badge> : null}
        </div>
        <h1 className="text-2xl font-semibold text-app-text md:text-3xl">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-app-muted md:text-base">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}