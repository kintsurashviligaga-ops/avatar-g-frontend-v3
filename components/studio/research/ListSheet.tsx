'use client';

/**
 * ListSheet — every research the user has, newest first (the sidebar's „Deep Research" row opens it): the way back to a
 * finished report after its toast is gone, and the place to start another one or open the Connectors.
 */
import { AlertCircle, FileSearch, Loader2, Plug, Plus } from 'lucide-react';
import { isActiveResearchStatus } from '@/lib/research/types';
import { BottomSheet } from '@/components/studio/ui/BottomSheet';
import { jobLabel, researchCopy } from './copy';
import { researchActions, useResearchState } from './store';
import { sortJobs } from './watcher';

export function ListSheet({ locale }: { locale: string }) {
  const c = researchCopy(locale);
  const { jobs, listLoaded, caps } = useResearchState();
  const items = sortJobs(Object.values(jobs));
  const date = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale === 'ru' ? 'ru-RU' : 'ka-GE', { day: 'numeric', month: 'short' }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  };
  return (
    <BottomSheet open onClose={researchActions.closeList} title={c.listTitle} closeLabel={c.close} testId="research-list-sheet">
      <div className="space-y-3 px-1 pb-2 pt-1">
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13.5px] text-app-muted">{listLoaded ? c.listEmpty : c.cardLoading}</p>
        ) : (
          <ul className="space-y-0.5" aria-label={c.listTitle}>
            {items.map((j) => {
              const active = isActiveResearchStatus(j.status);
              const ready = j.status === 'completed' && j.hasReport;
              const status = active ? c.statusRunning : ready ? c.statusReady : j.status === 'canceled' ? c.statusCanceled : c.statusFailed;
              const Icon = active ? Loader2 : ready ? FileSearch : AlertCircle;
              return (
                <li key={j.id}>
                  <button type="button" data-testid="research-list-row" onClick={() => researchActions.openViewer(j.id)}
                    className="flex min-h-[56px] w-full items-center gap-3.5 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-app-elevated/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent">
                    <Icon size={18} aria-hidden="true" className={`shrink-0 ${active ? 'text-app-accent motion-safe:animate-spin' : ready ? 'text-app-accent' : 'text-app-muted'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-[14px] font-medium leading-snug text-app-text">{jobLabel(j, 120)}</span>
                      <span className="mt-0.5 block text-[12px] text-app-muted">{status} · {date(j.createdAt)}{ready ? ` · ${c.sourcesCount(j.sourcesCount)}` : ''}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {caps?.available && (
            <button type="button" onClick={() => researchActions.openStart('')}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-app-accent px-4 text-[14px] font-semibold text-app-bg hover:opacity-90">
              <Plus size={16} aria-hidden="true" />{c.listNew}
            </button>
          )}
          <button type="button" onClick={researchActions.openConnectors}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl border border-app-border/20 px-4 text-[14px] font-medium text-app-text hover:bg-app-elevated">
            <Plug size={16} aria-hidden="true" />{c.connectorsTitle}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
