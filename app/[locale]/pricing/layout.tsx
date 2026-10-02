import type { ReactNode } from 'react';
import { StudioPageShell } from '@/components/studio/StudioPageShell';

/**
 * Puts the pricing page inside the studio's own shell (components/studio/StudioPageShell — the old marketing shell is
 * gone). The page's metadata lives with the page (app/[locale]/pricing/page.tsx), which is a server component now.
 */
export default async function PricingLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <StudioPageShell locale={locale}>{children}</StudioPageShell>;
}
