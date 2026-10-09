import type { ReactNode } from 'react';
import { StudioPageShell } from '@/components/studio/StudioPageShell';

/** Every /{lang}/account page (billing, invoices, delete; payments now redirects to billing) renders inside the studio's own shell (components/studio/StudioPageShell — the old marketing shell is gone). */
export default async function AccountLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <StudioPageShell locale={locale}>{children}</StudioPageShell>;
}
