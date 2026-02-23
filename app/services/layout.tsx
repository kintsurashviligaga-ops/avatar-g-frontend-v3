import { ReactNode } from 'react';
import ServiceExperienceShell from '@/components/services/ServiceExperienceShell';

type ServicesLayoutProps = {
  children: ReactNode;
};

export default function ServicesLayout({ children }: ServicesLayoutProps) {
  return <ServiceExperienceShell>{children}</ServiceExperienceShell>;
}
