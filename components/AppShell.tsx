"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { TopNavbar, SidebarMenu, BottomNavigation } from './shell/ModernShell';
import { ClientErrorBoundary } from './ClientErrorBoundary';
import { FloatingChatButton } from './chat/FloatingChatButton';
import { PageEnvironment } from './ui/PageEnvironment';
import CookieConsent from './CookieConsent';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const fullscreenQuery = window.matchMedia('(display-mode: fullscreen)');
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');

    const setDisplayModeData = () => {
      const isFullscreen = fullscreenQuery.matches;
      const isStandalone = standaloneQuery.matches || nav.standalone === true;

      document.documentElement.dataset.displayMode = isFullscreen
        ? 'fullscreen'
        : isStandalone
          ? 'standalone'
          : 'browser';
    };

    const setViewportCssVars = () => {
      // Keep viewport variables in sync on mobile browsers with dynamic toolbars.
      document.documentElement.style.setProperty('--app-screen-height', `${window.innerHeight}px`);
      document.documentElement.style.setProperty('--app-screen-width', `${window.innerWidth}px`);
    };

    const bindDisplayModeListener = (query: MediaQueryList) => {
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', setDisplayModeData);
        return () => query.removeEventListener('change', setDisplayModeData);
      }

      query.addListener(setDisplayModeData);
      return () => query.removeListener(setDisplayModeData);
    };

    setDisplayModeData();
    setViewportCssVars();

    const unbindFullscreen = bindDisplayModeListener(fullscreenQuery);
    const unbindStandalone = bindDisplayModeListener(standaloneQuery);

    window.addEventListener('resize', setViewportCssVars, { passive: true });
    window.addEventListener('orientationchange', setViewportCssVars);

    let swUpdateCleanup: (() => void) | null = null;
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      const hadController = !!navigator.serviceWorker.controller;
      let didReload = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Only auto-reload when a NEW worker takes over an existing client.
        // First-time installs (no previous controller) shouldn't reload.
        if (didReload || !hadController) return;
        didReload = true;
        window.location.reload();
      });

      // RELIABLE auto-update. The SW already skipWaiting()+clients.claim()s, but the
      // browser only *discovers* a new worker on its own schedule — a long-lived PWA
      // (especially iOS standalone, which users background/foreground for hours) can
      // otherwise serve a STALE shell indefinitely. That stale client is exactly the
      // recurring "it's broken" that was really an old cached version. We proactively
      // poll for a new worker whenever the app regains focus/visibility, plus a gentle
      // interval, so a fresh deploy is picked up within seconds → controllerchange →
      // the reload above swaps it in. Best-effort: every call is guarded.
      let swReg: ServiceWorkerRegistration | null = null;
      const checkForUpdate = () => { void swReg?.update().catch(() => {}); };
      const onVisible = () => { if (document.visibilityState === 'visible') checkForUpdate(); };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', checkForUpdate);
      const updateTimer = window.setInterval(checkForUpdate, 300_000); // every 5 min while open
      swUpdateCleanup = () => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', checkForUpdate);
        window.clearInterval(updateTimer);
      };

      void navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => { swReg = reg; })
        .catch(() => {
          // Keep shell rendering resilient if SW registration fails.
        });
    }

    return () => {
      unbindFullscreen();
      unbindStandalone();
      window.removeEventListener('resize', setViewportCssVars);
      window.removeEventListener('orientationchange', setViewportCssVars);
      swUpdateCleanup?.();
    };
  }, []);

  // Routes that own their full layout — no app shell chrome
  const isImmersiveWorkspace = !!pathname && (
    /\/services\/[a-z0-9-]+\/?$/.test(pathname) ||
    /\/(dashboard|hub|workspace)\/?$/.test(pathname)
  );

  // Landing & auth pages manage their own navbar — strip the app shell
  const isLandingOrAuth = !!pathname && (
    /^\/(ka|en|ru)\/?$/.test(pathname) ||          // /ka  /en  /ru
    /^\/$/.test(pathname) ||                        // bare /
    /\/(login|signup|auth|register)(\/|$)/.test(pathname)
  );

  const hideShellChrome = isImmersiveWorkspace || isLandingOrAuth;

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
      {!hideShellChrome && <TopNavbar onMenuToggle={() => setSidebarOpen(v => !v)} menuOpen={sidebarOpen} />}
      {!hideShellChrome && <SidebarMenu open={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
      <main
        id="main-content"
        className="relative flex-1 w-full"
        style={
          isImmersiveWorkspace
            ? { zIndex: 2, height: 'var(--app-screen-height)', minHeight: 'var(--app-screen-height)', overflow: 'hidden' }
            : isLandingOrAuth
            ? { zIndex: 2 }
            : {
                paddingTop: 'calc(4rem + env(safe-area-inset-top, 0px))',
                paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
                zIndex: 2,
              }
        }
      >
        <ClientErrorBoundary>
          {children}
        </ClientErrorBoundary>
      </main>
      {!hideShellChrome && <BottomNavigation />}
      {!hideShellChrome && <FloatingChatButton />}
      <CookieConsent />
    </div>
  );
}