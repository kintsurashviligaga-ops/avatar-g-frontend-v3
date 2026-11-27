'use client';

import { useEffect } from 'react';
import { Toaster } from 'sonner';
import CursorGlow from '@/components/ui/CursorGlow';

// Screen readers announce the toast area by this name; sonner's default is the English „Notifications".
const TOASTS_LABEL: Record<string, string> = { ka: 'შეტყობინებები', en: 'Notifications', ru: 'Уведомления' };

export function AppProviders({ children, locale = 'ka' }: { children: React.ReactNode; locale?: string }) {
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
        containerAriaLabel={TOASTS_LABEL[locale] ?? TOASTS_LABEL.ka}
        duration={4000}
        // Phase 8.24: on a phone sonner pins toasts 16 px above the bottom edge, which is exactly where the studio
        // composer's Send / Generate button and an Approve card's buttons sit. Lift them above the composer row.
        mobileOffset={{ bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}
        toastOptions={{
          // Phase 8.24: the app's theme tokens (light theme too) and the brand faces. `--font-body` is not defined
          // anywhere and DM Sans is never loaded, so toasts fell back to the OS sans and Georgian to the OS face.
          className: 'ag-toast',
          style: {
            background: 'rgb(var(--app-elevated) / 0.96)',
            border: '1px solid rgb(var(--app-border) / 0.12)',
            color: 'rgb(var(--app-text))',
            fontFamily: "var(--font-ui), var(--font-georgian), 'Noto Sans Georgian', -apple-system, sans-serif",
            backdropFilter: 'blur(12px)',
            borderRadius: 16,
            boxShadow: '0 12px 32px -12px rgb(0 0 0 / 0.45)',
          },
        }}
      />
    </>
  );
}
