'use client';

import { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { normalizeOmniLocale } from './i18n';
import { useOmniDashboardStore } from './store';
import { formatClock } from './utils';

const LEVEL_STYLES = {
  api: 'text-cyan-200',
  agent: 'text-emerald-300',
  worker: 'text-amber-300',
  system: 'text-slate-200',
} as const;

interface ActivityLogPanelProps {
  embedded?: boolean;
}

const PANEL_COPY = {
  ka: { title: 'აქტივობის ჟურნალი', clear: 'გასუფთავება' },
  en: { title: 'Activity Log', clear: 'Clear' },
  ru: { title: 'Журнал активности', clear: 'Очистить' },
} as const;

const LEVEL_LABELS = {
  ka: { api: 'API', agent: 'აგენტი', worker: 'ვორკერი', system: 'სისტემა' },
  en: { api: 'API', agent: 'Agent', worker: 'Worker', system: 'System' },
  ru: { api: 'API', agent: 'Агент', worker: 'Воркер', system: 'Система' },
} as const;

export function ActivityLogPanel({ embedded = false }: ActivityLogPanelProps) {
  const activityLog = useOmniDashboardStore((state) => state.activityLog);
  const clearActivity = useOmniDashboardStore((state) => state.clearActivity);
  const locale = useOmniDashboardStore((state) => state.locale);
  const logRef = useRef<HTMLDivElement>(null);

  const localeCode = normalizeOmniLocale(locale);
  const copy = PANEL_COPY[localeCode];
  const levelLabels = LEVEL_LABELS[localeCode];

  useEffect(() => {
    const node = logRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [activityLog]);

  return (
    <section
      className={
        embedded
          ? 'omni-terminal rounded-xl border border-white/10 bg-black/20 px-3 py-2.5'
          : 'omni-terminal border-t border-white/10 px-3 py-2.5 sm:px-4'
      }
    >
      <header className="mb-2 flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-cyan-100/70">{copy.title}</p>
        <button
          type="button"
          onClick={clearActivity}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/70 transition-colors hover:bg-white/[0.08]"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {copy.clear}
        </button>
      </header>
      <div
        ref={logRef}
        className={`overflow-y-auto rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-xs ${
          embedded ? 'h-28' : 'h-32'
        }`}
      >
        {activityLog.map((line) => (
          <p key={line.id} className="mb-1.5 leading-relaxed text-white/80">
            <span className="mr-2 text-white/45">{formatClock(line.ts)}</span>
            <span className={`mr-2 uppercase ${LEVEL_STYLES[line.level]}`}>[{levelLabels[line.level]}]</span>
            <span>{line.message}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
