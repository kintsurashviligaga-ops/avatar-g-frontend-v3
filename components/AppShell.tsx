"use client";

import { usePathname } from 'next/navigation';
import { GlobalNavbar } from './GlobalNavbar';
import { ClientErrorBoundary } from './ClientErrorBoundary';
import dynamic from 'next/dynamic';

const CosmicSingularityBackground = dynamic(() => import('./CosmicSingularityBackground'), { ssr: false });

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLocaleHome = pathname === '/' || /^\/(ka|en|ru)\/?$/.test(pathname);

  return (
    <div className='relative min-h-screen flex flex-col text-white isolate'>
      {!isLocaleHome && (
        <ClientErrorBoundary>
          <CosmicSingularityBackground />
        </ClientErrorBoundary>
      )}
      <GlobalNavbar />
      <main className='relative flex-1 pt-16 md:pt-20 z-10 w-full ag-premium-page ag-neon-grid-lines'>
        {!isLocaleHome && (
          <>
            <div className='pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_18%_15%,rgba(34,211,238,0.18),transparent_50%),radial-gradient(circle_at_82%_82%,rgba(124,92,252,0.2),transparent_52%)]' />
            <div className='pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(2,6,18,0.52)_0%,rgba(2,6,18,0.22)_42%,rgba(2,6,18,0.64)_100%)]' />
            <div className='pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_center,transparent_44%,rgba(3,7,18,0.72)_100%)]' />
          </>
        )}
        <ClientErrorBoundary>
          <div className='relative z-10'>
            {children}
          </div>
        </ClientErrorBoundary>
      </main>
    </div>
  );
}