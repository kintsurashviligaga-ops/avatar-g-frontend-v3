"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ClientErrorBoundary } from './ClientErrorBoundary';
import { PageEnvironment } from './ui/PageEnvironment';
import CookieConsent from './CookieConsent';
import PresenceHeartbeat from './presence/PresenceHeartbeat';

export function AppShell({ children, studioV2 = false }: { children: React.ReactNode; /** STUDIO_V2 on this deployment (root layout). */ studioV2?: boolean }) {
  const pathname = usePathname();
  // Embedded mode: when a page is opened inside the studio's in-window slide-over
  // (an iframe with ?embed=1), strip ALL app-shell chrome — navbar, sidebar,
  // bottom nav, floating chat, cookie banner — so the legal/help content renders
  // bare inside the sheet, never a page-in-a-page. Detected client-side (the embed
  // only ever happens in the browser): the ?embed=1 flag OR simply being framed.
  const [isEmbed, setIsEmbed] = useState(false);
  useEffect(() => {
    try {
      const embedParam = new URLSearchParams(window.location.search).get('embed') === '1';
      const framed = window.self !== window.top;
      setIsEmbed(embedParam || framed);
    } catch {
      // Cross-origin top access throws → we are definitely inside a frame.
      setIsEmbed(true);
    }
  }, []);

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

  // ⚠️ THERE IS NO MARKETING SHELL ANY MORE (2026-10-01, the owner's call — docs/DESIGN.md §13). The old top bar
  // (☰ · the opaque rocket tile · „დაწყება"), the bottom navigation (ჩატი · ბიბლიოთეკა · პარამეტრები · მხარდაჭერა) and
  // the floating support bubble were the frame of pages nobody used; those pages were deleted (next.config.js redirects
  // their URLs) and the ones that matter — pricing, settings, support, the services hub, the account pages — render in
  // the studio's own shell (ChatChrome), like /library. What remains here is only WHICH kind of <main> a route gets.
  //
  // Studio surfaces — the studio itself and every page wrapped in ChatChrome: full-height, no page scroll (the shell
  // scrolls its own body).
  const isImmersiveWorkspace = !!pathname && (
    /^\/(ka|en|ru)\/?$/.test(pathname) ||          // the home page IS the studio (opens on the chat)
    /\/services(\/[a-z0-9-]+)?\/?$/.test(pathname) || // the services hub and each service page
    /\/(dashboard|hub|workspace|library|calendar-lab|pricing|settings|support)\/?$/.test(pathname) ||
    /\/account\/(billing|invoices|payments|delete)\/?$/.test(pathname)
  );

  // Landing, auth, legal, admin and the share page own their own header; they get the plain <main> below.

  // Admin console owns its FULL layout (its own MyAvatar header).
  const isAdmin = !!pathname && /\/admin(\/|$)/.test(pathname);

  // The phone-handoff avatar enrollment (/{locale}/avatar/enroll) is a focused full-screen capture flow.
  const isAvatarEnroll = !!pathname && /\/avatar\/enroll\/?$/.test(pathname);

  // ⚠️ A LEGAL DOCUMENT IS SOMETHING YOU OPEN, READ AND CLOSE — NOT A PLACE IN THE NAVIGATION. LegalDocChrome's ✕ is
  // the single, obvious way out (the old marketing bars used to collide with the last paragraph).
  const isLegalDoc = !!pathname && /\/(terms|privacy|refund|refund-policy|cookies|licenses)\/?$/.test(pathname);

  // /{locale}/studio is the new studio — wrapped in the ChatChrome shell like /library — where STUDIO_V2 is on
  // (elsewhere the route sends you home).
  const isStudioV2 = studioV2 && !!pathname && /^(\/(ka|en|ru))?\/studio\/?$/.test(pathname);

  // The marketing landing (/{lang}/landing) paints its own opaque, cinematic page — the animated environment behind
  // it would cost frames nobody sees (docs/DESIGN.md: low motion).
  const isMarketingLanding = !!pathname && /^\/(ka|en|ru)\/landing\/?$/.test(pathname);

  return (
    <div
      className='app-native-shell ag-fixed-shell relative flex min-h-[var(--app-screen-height)] w-full flex-col overflow-x-hidden'
      style={{ color: 'var(--color-text)', isolation: 'isolate' }}
    >
      {/* Page-aware 4D AI environment — adapts mood per route */}
      <PageEnvironment reduced={isImmersiveWorkspace || isStudioV2 || isAdmin || isMarketingLanding} />
      {/* Skip to content — accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[999] focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold"
        style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
      >
        Skip to content
      </a>
      <main
        id="main-content"
        className="relative flex-1 w-full"
        style={
          isImmersiveWorkspace || isStudioV2
            ? { zIndex: 2, height: 'var(--app-screen-height)', minHeight: 'var(--app-screen-height)', overflow: 'hidden' }
            // Everything else (landing, auth, legal, admin, the share page, not-found) owns its own header and scrolls
            // normally — nothing is reserved for bars that no longer exist.
            : { zIndex: 2 }
        }
      >
        <ClientErrorBoundary>
          {children}
        </ClientErrorBoundary>
      </main>
      {/* PHASE 37.1 — removed the global floating Agent-G buttons (a RED phone/call button bottom-left + a
          cyan chat button bottom-right). They floated at z-[9999] over the production dashboard; the red one
          was the reported "red phone button". No external redirect existed (it opened an in-app CallScreen);
          Agent G is still reachable at /services/agent-g. */}
      {/* Live presence for the admin panel. Mounted for EVERY visitor including anonymous ones —
          "how many people are on the site" is mostly people who have not signed in. Renders nothing;
          it only pings while the tab is visible. */}
      {!isEmbed && <PresenceHeartbeat />}
      {!isEmbed && !isAdmin && !isAvatarEnroll && !isLegalDoc && <CookieConsent />}
    </div>
  );
}
