'use client';

import { cn } from '@/lib/utils';
import type { ServiceDefinition } from '@/types/dashboard';

interface BottomBarProps {
  activeJobCount?: number;
  averageProgress?: number;
  recentServices?: ServiceDefinition[];
  globalStatusRunning?: string;
  globalStatusReady?: string;
  formatStatusMessage?: (activeJobCount: number, averageProgress: number) => string;
}

export function BottomBar({
  activeJobCount = 0,
  averageProgress = 0,
  recentServices = [],
  globalStatusRunning = 'jobs running',
  globalStatusReady = 'Workspace ready',
  formatStatusMessage,
}: BottomBarProps) {
  const statusMessage = formatStatusMessage
    ? formatStatusMessage(activeJobCount, averageProgress)
    : activeJobCount > 0
      ? `${activeJobCount} ${globalStatusRunning}`
      : globalStatusReady;

  return (
    <footer className="rounded-[28px] border border-white/10 bg-black/25 px-5 py-4 backdrop-blur-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('h-2.5 w-2.5 rounded-full', activeJobCount > 0 ? 'bg-cyan-300 animate-pulse' : 'bg-emerald-400')} />
          <p className="text-sm text-slate-300">{statusMessage}</p>
        </div>
        <div className="flex flex-1 items-center gap-3 lg:max-w-xl">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 transition-all duration-300"
              style={{ width: `${Math.max(activeJobCount > 0 ? 6 : 0, Math.min(100, Math.round(averageProgress)))}%` }}
            />
          </div>
          <span className="min-w-[48px] text-right text-xs font-mono text-slate-400">{Math.round(averageProgress)}%</span>
        </div>
        <div className="flex items-center gap-2">
          {recentServices.slice(0, 3).map((service, index) => {
            const ServiceIcon = service.icon;
            return (
              <div key={`${service.id}-${index}`} className={cn('flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg', service.accent)}>
                <ServiceIcon className="h-4 w-4" />
              </div>
            );
          })}
        </div>
      </div>
    </footer>
  );
}