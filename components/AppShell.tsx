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
        <div
          className='pointer-events-none absolute inset-0 bg-cover bg-center opacity-22'
          style={{ backgroundImage: "url('/brand/background-main.svg')" }}
        />
        <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(34,211,238,0.12),transparent_50%),radial-gradient(circle_at_82%_82%,rgba(139,92,246,0.12),transparent_52%)]' />
        <ClientErrorBoundary>
          <div className='relative z-10'>
            {children}
          </div>
        </ClientErrorBoundary>
      </main>
    </div>
  );
}