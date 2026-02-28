import { GlobalNavbar } from './GlobalNavbar'
import { ClientErrorBoundary } from './ClientErrorBoundary'

/**
 * AppShell — Root enforcement component.
 * THIS COMPONENT WRAPS ALL CHILDREN IN THE ROOT LAYOUT.
 * NO PAGE-LEVEL LAYOUT MAY OVERRIDE THE NAVBAR.
 * NO PAGE MAY RENDER WITHOUT THE AVATAR G LOGO IN TOP-LEFT.
 *
 * GlobalNavbar: ALWAYS FIRST, ALWAYS PRESENT, NEVER REMOVABLE
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#050510]">
      <GlobalNavbar />
      <main className="flex-1 pt-16">
        <ClientErrorBoundary>
          {children}
        </ClientErrorBoundary>
      </main>
    </div>
  )
}
