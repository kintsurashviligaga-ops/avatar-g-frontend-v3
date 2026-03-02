import { GlobalNavbar } from './GlobalNavbar'
import { ClientErrorBoundary } from './ClientErrorBoundary'
import CosmicSingularityBackground from './CosmicSingularityBackground'

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
    <div className="relative min-h-screen flex flex-col text-white isolation-auto">
      <CosmicSingularityBackground />
      <GlobalNavbar />
      <main className="relative flex-1 pt-16 z-10 w-full">
        <ClientErrorBoundary>
          {children}
        </ClientErrorBoundary>
      </main>
    </div>
  )
}
