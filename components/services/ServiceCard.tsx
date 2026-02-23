import { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ServiceCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function ServiceCard({ title, description, children, actions, className }: ServiceCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
