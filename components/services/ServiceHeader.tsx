import { ReactNode } from 'react';

type ServiceHeaderProps = {
  icon?: string;
  title: string;
  description?: string;
  badges?: ReactNode;
};

export function ServiceHeader({ icon, title, description, badges }: ServiceHeaderProps) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold text-app-text sm:text-3xl">
            {icon ? <span className="mr-2">{icon}</span> : null}
            {title}
          </h1>
          {description ? <p className="max-w-3xl text-sm text-app-muted">{description}</p> : null}
        </div>
        {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
      </div>
    </header>
  );
}
