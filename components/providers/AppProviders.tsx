'use client';

import { useEffect } from 'react';
import { Toaster } from 'sonner';
import CursorGlow from '@/components/ui/CursorGlow';

export function AppProviders({ children }: { children: React.ReactNode }) {
  // Global ⌘K shortcut — dispatches a custom event that CommandBar listens to
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('avatar:focusCommandBar'));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <CursorGlow />
      {children}
      <Toaster
        position="bottom-right"
        duration={4000}
        toastOptions={{
          style: {
            background: 'rgba(15,15,26,0.95)',
            border: '1px solid rgba(0,212,255,0.20)',
            color: '#f1f5f9',
            fontFamily: 'var(--font-body, DM Sans, sans-serif)',
            backdropFilter: 'blur(12px)',
          },
        }}
      />
    </>
  );
}
