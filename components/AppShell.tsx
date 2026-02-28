import { GlobalNavbar } from './GlobalNavbar'
import { ClientErrorBoundary } from './ClientErrorBoundary'

/**
 * AppShell — Root enforcement component.
 * THIS COMPONENT WRAPS ALL CHILDREN IN THE ROOT LAYOUT.
 * NO PAGE-LEVEL LAYOUT MAY OVERRIDE THE NAVBAR.
 * NO PAGE MAY RENDER WITHOUT THE AVATAR G LOGO IN TOP-LEFT.
 */
interface AppShellProps {
  children: React.ReactNode
  variant?: 'light' | 'dark' | 'transparent'
}

export function AppShell({ children, variant = 'dark' }: AppShellProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <GlobalNavbar variant={variant} />
      <main className="flex-1 pt-16">
        <ClientErrorBoundary>
          {children}
        </ClientErrorBoundary>
      </main>
    </div>
  )
}
