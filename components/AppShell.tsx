import { GlobalNavbar } from './GlobalNavbar'
import { ClientErrorBoundary } from './ClientErrorBoundary'
import dynamic from 'next/dynamic'

const SolarSystemBackground = dynamic(() => import('./SolarSystemBackground'), { ssr: false })

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
      <SolarSystemBackground />
      <GlobalNavbar />
      <main className="relative flex-1 pt-16 md:pt-24 z-10 w-full">
        <ClientErrorBoundary>
          {children}
        </ClientErrorBoundary>
      </main>
    </div>
  )
}
