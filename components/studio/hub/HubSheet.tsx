'use client';

/**
 * HubSheet — Connectors · Plugins · Skills in ONE sheet (the studio's BottomSheet: a sheet from the bottom edge on a phone, a
 * floating panel from `sm` up — the same component everywhere, docs/DESIGN.md §8). Three tabs under the title, the ARIA tabs
 * pattern: one Tab stop on the selected tab, arrows / Home / End move between them, each panel labelled by its tab. The tab
 * row stays pinned while a long tab scrolls under it.
 *
 * Loaded on first open (HubHost imports it lazily), so none of this is in the chat's first bundle.
 */
import { useEffect, useId, useRef } from 'react';
import { BottomSheet } from '@/components/studio/ui/BottomSheet';
import { ConnectorsTab } from './ConnectorsTab';
import { hubCopy } from './copy';
import { PluginsTab } from './PluginsTab';
import { SkillsTab } from './SkillsTab';
import { HUB_TABS, hubActions, useHubSelector, type HubTab } from './store';

export function HubSheet({ locale, authed }: { locale: string; authed: boolean }) {
  const c = hubCopy(locale);
  const tab = useHubSelector((s) => s.tab);
  const uid = useId();
  const tabRefs = useRef<Partial<Record<HubTab, HTMLButtonElement | null>>>({});

  // Telegram's line (Connectors) and the channel rows (Skills) both read this; asked once per page, on first open.
  useEffect(() => { void hubActions.loadChannels(); }, []);

  const go = (t: HubTab) => {
    hubActions.setTab(t);
    tabRefs.current[t]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = HUB_TABS.indexOf(tab);
    const n = HUB_TABS.length;
    const to = e.key === 'ArrowRight' ? HUB_TABS[(i + 1) % n] : e.key === 'ArrowLeft' ? HUB_TABS[(i - 1 + n) % n]
      : e.key === 'Home' ? HUB_TABS[0] : e.key === 'End' ? HUB_TABS[n - 1] : undefined;
    if (!to) return;
    e.preventDefault();
    go(to);
  };

  return (
    <BottomSheet open onClose={hubActions.close} title={c.title} closeLabel={c.close} testId="hub-sheet">
      <div className="sticky top-0 z-10 -mx-3 -mt-1 bg-app-surface px-3 pb-2 pt-1">
        <div role="tablist" aria-label={c.tabsLabel} onKeyDown={onKeyDown} className="flex gap-1 rounded-full bg-app-elevated/60 p-1">
          {HUB_TABS.map((t) => {
            const on = t === tab;
            return (
              <button key={t} ref={(el) => { tabRefs.current[t] = el; }} type="button" role="tab" id={`${uid}-tab-${t}`}
                aria-selected={on} aria-controls={`${uid}-panel`} tabIndex={on ? 0 : -1} data-testid={`hub-tab-${t}`}
                onClick={() => hubActions.setTab(t)}
                className={`min-h-[44px] min-w-0 flex-1 truncate rounded-full px-2 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent ${on ? 'bg-app-surface text-app-text shadow-sm' : 'text-app-muted hover:text-app-text'}`}>
                {c.tabs[t]}
              </button>
            );
          })}
        </div>
      </div>
      {/* Skills holds nothing focusable, so its panel takes the Tab stop itself (the APG tabs rule) — a keyboard user can reach and scroll it. */}
      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${tab}`} data-testid={`hub-panel-${tab}`} tabIndex={tab === 'skills' ? 0 : undefined}
        className="rounded-2xl pt-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-accent">
        {tab === 'connectors' ? <ConnectorsTab locale={locale} authed={authed} />
          : tab === 'plugins' ? <PluginsTab locale={locale} authed={authed} />
            : <SkillsTab locale={locale} authed={authed} />}
      </div>
    </BottomSheet>
  );
}

export default HubSheet;
