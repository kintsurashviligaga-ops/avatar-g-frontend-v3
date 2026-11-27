/**
 * Pass-through layout for /[locale]/dashboard: the studio (FilmStudioHome → ChatChrome + OmniStudio) is a full-screen
 * surface with its own chrome, so nothing wraps it. The old CommandCenter and the legacy DashboardShell sub-routes
 * are gone; /[locale]/dashboard is the only page here.
 */
import './hyperframe.css';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return <>{children}</>;
}
