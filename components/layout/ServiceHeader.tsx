import { Badge } from '@/components/ui/badge';

type ServiceHeaderProps = {
  title: string;
  description: string;
  credits?: number;
  action?: React.ReactNode;
};

export function ServiceHeader({ title, description, credits, action }: ServiceHeaderProps) {
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-white/[0.12] bg-[linear-gradient(155deg,rgba(12,22,46,0.88),rgba(7,14,32,0.78))] backdrop-blur-xl p-5 md:flex-row md:items-center md:justify-between shadow-[0_0_0_1px_rgba(255,255,255,0.10),0_8px_32px_rgba(0,0,0,0.40),inset_0_1px_0_rgba(255,255,255,0.07)]">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="accent">Service</Badge>
          {typeof credits === 'number' ? <Badge variant="warning">{credits} credits / job</Badge> : null}
        </div>
        <h1 className="text-2xl font-black text-white md:text-3xl tracking-tight">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/45 md:text-base">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}