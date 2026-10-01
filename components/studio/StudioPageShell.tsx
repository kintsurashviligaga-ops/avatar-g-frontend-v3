import type { ReactNode } from 'react';
import { ChatChrome } from './ChatChrome';

/**
 * A page that lives INSIDE the studio's own shell (sidebar · header · scrolling body) — pricing, settings, support,
 * the services hub and the account pages, the way /library already does it.
 *
 * ⚠️ THESE PAGES USED TO SIT IN THE OLD MARKETING SHELL (☰ · the rocket tile · „დაწყება" on top, ჩატი · ბიბლიოთეკა ·
 * პარამეტრები · მხარდაჭერა at the bottom). That shell was deleted on 2026-10-01 (docs/DESIGN.md §13); AppShell now
 * gives these routes the full-height studio <main>, which does not scroll — so a page that is NOT wrapped here would
 * be clipped at the screen edge. `scrollBody` makes the shell's body the scroller.
 */
export function StudioPageShell({ locale, children }: { locale: string; children: ReactNode }) {
  return (
    <ChatChrome locale={locale} scrollBody>
      {children}
    </ChatChrome>
  );
}

export default StudioPageShell;
