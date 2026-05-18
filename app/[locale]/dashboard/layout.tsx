/**
 * Pass-through layout for /[locale]/dashboard.
 *
 * The root /dashboard page is now the One Window CommandCenter — a
 * full-screen chat surface that should NOT be wrapped in the legacy
 * DashboardShell sidebar. The shell still lives at
 * app/[locale]/dashboard/(legacy)/layout.tsx and wraps every legacy
 * sub-route (agent-g, analytics, avatar, music, video, workflows…)
 * so those keep their previous chrome.
 *
 * Route map:
 *   /[locale]/dashboard              → CommandCenter (no shell)
 *   /[locale]/dashboard/avatar       → DashboardShell + page (via (legacy))
 *   /[locale]/dashboard/music        → DashboardShell + page (via (legacy))
 *   …etc.
 */
import './hyperframe.css';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return <>{children}</>;
}
