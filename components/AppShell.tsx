"use client";

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { TopNavbar, SidebarMenu, BottomNavigation } from './shell/ModernShell';
import { ClientErrorBoundary } from './ClientErrorBoundary';
import { FloatingChatButton } from './chat/FloatingChatButton';
import { PageEnvironment } from './ui/PageEnvironment';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const isImmersiveWorkspace = !!pathname && (
    /\/services\/[a-z0-9-]+\/?$/.test(pathname) ||
    /\/(dashboard|hub|workspace)\/?$/.test(pathname)
  );

  return (
    <div
      className='app-native-shell relative flex min-h-[var(--app-screen-height)] w-full flex-col overflow-x-hidden'
      style={{ color: 'var(--color-text)', isolation: 'isolate' }}
    >
      {/* Page-aware 4D AI environment — adapts mood per route */}
      <PageEnvironment reduced={isImmersiveWorkspace} />
      {/* Skip to content — accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[999] focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold"
        style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
      >
        Skip to content
      </a>
      {!isImmersiveWorkspace && <TopNavbar onMenuToggle={() => setSidebarOpen(v => !v)} menuOpen={sidebarOpen} />}
      {!isImmersiveWorkspace && <SidebarMenu open={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
      <main
        id="main-content"
        className="relative flex-1 w-full"
        style={
          isImmersiveWorkspace
            ? { zIndex: 2, minHeight: 'var(--app-screen-height)' }
            : { paddingTop: 'calc(4rem + env(safe-area-inset-top, 0px))', zIndex: 2 }
        }
      >
        <ClientErrorBoundary>
          {children}
        </ClientErrorBoundary>
      </main>
      {!isImmersiveWorkspace && <BottomNavigation />}
      {!isImmersiveWorkspace && <FloatingChatButton />}
      {!isImmersiveWorkspace && <div className="h-16 md:hidden shrink-0" />}
    </div>
  );
}