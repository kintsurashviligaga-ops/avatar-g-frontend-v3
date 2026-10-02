'use client';

/**
 * The doors into the hub from ChatChrome's navigation: one sidebar row („კონექტორები და პლაგინები"), and its icon on the
 * collapsed desktop rail (docs/DESIGN.md §8 — the rail is the sidebar in icons, never nothing). Drawn for everyone: a guest
 * sees what is connected and what Agent G can do, and is asked to sign in only where an account is needed.
 */
import { Puzzle } from 'lucide-react';
import { hubCopy } from './copy';
import { hubActions } from './store';

export function HubSidebarRow({ locale, className, onPicked }: { locale: string; className: string; onPicked?: () => void }) {
  const c = hubCopy(locale);
  return (
    <button type="button" data-testid="sidebar-hub" aria-haspopup="dialog" onClick={() => { onPicked?.(); hubActions.open(); }} className={className}>
      <Puzzle className="h-[17px] w-[17px] text-app-muted" aria-hidden="true" /> <span className="min-w-0 truncate">{c.sidebarRow}</span>
    </button>
  );
}

export function HubRailButton({ locale, className }: { locale: string; className: string }) {
  const c = hubCopy(locale);
  return (
    <button type="button" data-testid="rail-hub" aria-haspopup="dialog" onClick={() => hubActions.open()} aria-label={c.sidebarRow} title={c.sidebarRow} className={className}>
      <Puzzle className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
}
