'use client';
import ErrorBoundary from '@/components/landing/ErrorBoundary';
import type { ReactNode } from 'react';

export function ClientErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className='flex min-h-screen items-center justify-center bg-[#050510] text-[#E5E7EB]'>
          <div className='text-center space-y-4 max-w-md mx-auto p-6 bg-white/5 rounded-xl border border-white/10'>
            <div className='w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto'>
              <svg className='w-6 h-6 text-red-400' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
              </svg>
            </div>
            <div className='space-y-2'>
              <h2 className='text-xl font-medium'>System Interruption</h2>
              <p className='text-sm text-gray-400'>We encountered a problem loading this module. Please try again or contact support if the issue persists.</p>
            </div>
            <button
              className='px-6 py-2.5 bg-white/10 hover:bg-white/15 text-sm font-medium rounded-lg transition-colors border border-white/5'
              onClick={() => window.location.reload()}
            >
              Retry System Process
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}