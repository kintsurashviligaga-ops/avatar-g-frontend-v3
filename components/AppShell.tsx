import { GlobalNavbar } from './GlobalNavbar';
import { ClientErrorBoundary } from './ClientErrorBoundary';
import dynamic from 'next/dynamic';

const SolarSystemBackground = dynamic(() => import('./SolarSystemBackground'), { ssr: false });

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative min-h-screen flex flex-col text-white isolation-auto'>
      <ClientErrorBoundary>
        <SolarSystemBackground />
      </ClientErrorBoundary>
      <GlobalNavbar />
      <main className='relative flex-1 pt-16 md:pt-24 z-10 w-full'>
        <ClientErrorBoundary>
          {children}
        </ClientErrorBoundary>
      </main>
    </div>
  );
}