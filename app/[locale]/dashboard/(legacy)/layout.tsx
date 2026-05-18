/**
 * Layout for legacy dashboard sub-routes (analytics, avatar, music,
 * video, workflows, agent-g, business-agent, executive-agent, image,
 * fulfillment, copy).
 *
 * These pages predate the One Window CommandCenter and rely on
 * DashboardShell for the sidebar nav + credits widget + sign-out.
 * Lives inside the (legacy) route group so it does NOT wrap the
 * new /[locale]/dashboard root page.
 */
import DashboardShell from '@/components/dashboard/DashboardShell';

interface LegacyDashboardLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LegacyDashboardLayout({
  children,
  params,
}: LegacyDashboardLayoutProps) {
  const { locale } = await params;
  return <DashboardShell locale={locale}>{children}</DashboardShell>;
}
