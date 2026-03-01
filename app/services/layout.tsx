import { ReactNode } from 'react';

type ServicesLayoutProps = {
  children: ReactNode;
};

export default function ServicesLayout({ children }: ServicesLayoutProps) {
  return <>{children}</>;
}
