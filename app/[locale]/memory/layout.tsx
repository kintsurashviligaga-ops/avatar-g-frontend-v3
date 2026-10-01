import type { ReactNode } from 'react';
import { StudioPageShell } from '@/components/studio/StudioPageShell';

/** /{lang}/memory renders inside the studio's own shell (components/studio/StudioPageShell — the old marketing shell is gone). */
export default async function MemoryLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <StudioPageShell locale={locale}>{children}</StudioPageShell>;
}
