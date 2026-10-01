'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChatChrome } from './ChatChrome';

/**
 * A page that lives INSIDE the studio's own shell (sidebar · header · scrolling body) — pricing, settings, support,
 * the services hub, the account pages, memory and voice-lab, the way /library already does it.
 *
 * ⚠️ THESE PAGES USED TO SIT IN THE OLD MARKETING SHELL (☰ · the rocket tile · „დაწყება" on top, ჩატი · ბიბლიოთეკა ·
 * პარამეტრები · მხარდაჭერა at the bottom). That shell was deleted on 2026-10-01 (docs/DESIGN.md §13); AppShell now
 * gives these routes the full-height studio <main>, which does not scroll — so a page that is NOT wrapped here would
 * be clipped at the screen edge. `scrollBody` makes the shell's body the scroller.
 *
 * ⚠️ NEVER A SHELL INSIDE A SHEET. The film studio opens /{lang}/support?embed=1 in an iframe sheet. Wrapped, that
 * sheet showed a second header and a hamburger whose sidebar navigated the studio INSIDE its own sheet. Embedded
 * (the ?embed=1 flag, or simply being framed — the same test AppShell uses) the page renders bare.
 */
export function StudioPageShell({ locale, children }: { locale: string; children: ReactNode }) {
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    try {
      const flag = new URLSearchParams(window.location.search).get('embed') === '1';
      setEmbedded(flag || window.self !== window.top);
    } catch {
      setEmbedded(true); // a cross-origin parent throws on window.top access — that is framed by definition
    }
  }, []);

  // AppShell's studio <main> clips (overflow hidden), so the bare page brings its own viewport-bound scroller — the
  // same `fixed inset-0` box ChatChrome itself uses.
  if (embedded) return <div className="fixed inset-0 overflow-y-auto overscroll-contain bg-app-bg">{children}</div>;
  return (
    <ChatChrome locale={locale} scrollBody>
      {children}
    </ChatChrome>
  );
}

export default StudioPageShell;
