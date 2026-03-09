import { ReactNode } from 'react';

type ServiceCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function ServiceCard({ title, description, children, actions, className }: ServiceCardProps) {
  return (
    <div
      className={`relative rounded-2xl border border-white/[0.09] bg-[linear-gradient(155deg,rgba(7,14,30,0.90),rgba(4,9,22,0.80))] backdrop-blur-2xl shadow-[0_16px_48px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden ${className ?? ''}`}
    >
      {/* top shine */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" />
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white leading-tight">{title}</h3>
            {description ? (
              <p className="text-xs text-white/45 mt-1 leading-relaxed">{description}</p>
            ) : null}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}
