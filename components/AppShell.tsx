"use client";

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { TopNavbar, SidebarMenu, BottomNavigation } from './shell/ModernShell';
import { ClientErrorBoundary } from './ClientErrorBoundary';
import { FloatingChatButton } from './chat/FloatingChatButton';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const isFullscreenChat = !!pathname && /\/services\/agent-g\/?$/.test(pathname);

  return (
    <div className='relative min-h-screen flex flex-col' style={{ color: 'var(--color-text)' }}>
      {/* Skip to content — accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[999] focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold"
        style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
      >
        Skip to content
      </a>
      {!isFullscreenChat && <TopNavbar onMenuToggle={() => setSidebarOpen(v => !v)} menuOpen={sidebarOpen} />}
      {!isFullscreenChat && <SidebarMenu open={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
      <main id="main-content" className="relative flex-1 w-full" style={isFullscreenChat ? undefined : { paddingTop: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>
        <ClientErrorBoundary>
          {children}
        </ClientErrorBoundary>
      </main>
      {!isFullscreenChat && <BottomNavigation />}
      {!isFullscreenChat && <FloatingChatButton />}
      {!isFullscreenChat && <div className="h-16 md:hidden shrink-0" />}
    </div>
  );
}