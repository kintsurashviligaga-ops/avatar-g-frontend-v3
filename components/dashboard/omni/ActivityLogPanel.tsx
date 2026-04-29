'use client';

import { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { useOmniDashboardStore } from './store';
import { formatClock } from './utils';

const LEVEL_STYLES = {
  api: 'text-cyan-200',
  agent: 'text-emerald-300',
  worker: 'text-amber-300',
  system: 'text-slate-200',
} as const;

export function ActivityLogPanel() {
  const activityLog = useOmniDashboardStore((state) => state.activityLog);
  const clearActivity = useOmniDashboardStore((state) => state.clearActivity);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = logRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [activityLog]);

  return (
    <section className="omni-terminal border-t border-white/10 px-3 py-2.5 sm:px-4">
      <header className="mb-2 flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-cyan-100/70">Activity Log</p>
        <button
          type="button"
          onClick={clearActivity}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/70 transition-colors hover:bg-white/[0.08]"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </header>
      <div ref={logRef} className="h-32 overflow-y-auto rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-xs">
        {activityLog.map((line) => (
          <p key={line.id} className="mb-1.5 leading-relaxed text-white/80">
            <span className="mr-2 text-white/45">{formatClock(line.ts)}</span>
            <span className={`mr-2 uppercase ${LEVEL_STYLES[line.level]}`}>[{line.level}]</span>
            <span>{line.message}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
