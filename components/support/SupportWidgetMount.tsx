'use client';

import { usePathname } from 'next/navigation';
import { SupportWidget } from './SupportWidget';

/**
 * Decides WHETHER the support widget renders on this route, and how far off the bottom it sits.
 *
 * ⚠️ NOT ON THE STUDIO. /dashboard, /library, /hub, /workspace and /services/{slug} are the immersive
 * surfaces: their composer dock is bottom-right-anchored and their own chrome owns that corner. A floating
 * button there would sit on top of the send button — and those users are already in a chat. The widget
 * belongs on the pages where someone is READING and gets stuck: pricing, billing, legal, settings, support,
 * marketing. That is also exactly where the bottom nav lives, which is why the offset below exists.
 *
 * ⚠️ THE OFFSET IS NOT DECORATION. The mobile bottom nav is `fixed bottom-0` at 60px + safe-area and is
 * `md:hidden`. Sitting the launcher at bottom-4 would bury it under that bar on every phone. 76px clears
 * it with a margin; from md upward the bar is gone and 24px is enough.
 */
export function SupportWidgetMount() {
  const pathname = usePathname() || '';
  // Locale comes from the path rather than a prop — AppShell has no locale in scope and threading one
  // through only for this would add a parameter to a component that already takes none.
  const locale = /^\/(en|ru)(\/|$)/.test(pathname) ? pathname.slice(1, 3) : 'ka';

  const immersive =
    /\/services\/[a-z0-9-]+\/?$/.test(pathname) || /\/(dashboard|hub|workspace|library)\/?$/.test(pathname);
  const authOrLanding = /\/(login|signup|reset|auth)(\/|$)/.test(pathname) || /^\/[a-z]{2}\/?$/.test(pathname);
  const admin = pathname.includes('/admin');

  if (immersive || authOrLanding || admin) return null;

  return (
    <>
      <div className="md:hidden"><SupportWidget locale={locale} bottomOffset={76} /></div>
      <div className="hidden md:block"><SupportWidget locale={locale} bottomOffset={24} /></div>
    </>
  );
}

export default SupportWidgetMount;
