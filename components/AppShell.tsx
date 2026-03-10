"use client";

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { TopNavbar, SidebarMenu, BottomNavigation } from './shell/ModernShell';
import { ClientErrorBoundary } from './ClientErrorBoundary';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className='relative min-h-screen flex flex-col' style={{ color: 'var(--color-text)' }}>
      <TopNavbar onMenuToggle={() => setSidebarOpen(v => !v)} menuOpen={sidebarOpen} />
      <SidebarMenu open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="relative flex-1 z-10 w-full pt-16">
        <ClientErrorBoundary>
          <div className='relative z-10'>
            {children}
          </div>
        </ClientErrorBoundary>
      </main>
      <BottomNavigation />
      {/* Bottom nav spacer for mobile */}
      <div className="h-14 md:hidden shrink-0" />
    </div>
  );
}