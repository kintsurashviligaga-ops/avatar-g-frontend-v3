import { ReactNode } from 'react';

type ServiceHeaderProps = {
  icon?: string;
  title: string;
  description?: string;
  badges?: ReactNode;
};

export function ServiceHeader({ icon, title, description, badges }: ServiceHeaderProps) {
  return (
    <header className="relative space-y-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
            {icon ? (
              <span className="mr-2.5 inline-block align-middle text-2xl">{icon}</span>
            ) : null}
            {title}
          </h1>
          {description ? (
            <p className="max-w-3xl text-sm text-white/45 leading-relaxed">{description}</p>
          ) : null}
        </div>
        {badges ? (
          <div className="flex flex-wrap items-center gap-2">{badges}</div>
        ) : null}
      </div>
      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
    </header>
  );
}
