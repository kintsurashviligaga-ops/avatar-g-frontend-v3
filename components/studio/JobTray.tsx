'use client';

/**
 * JobTray — the live background-render panel.
 * ===========================================
 *
 * Renders the capped-parallel queue: up to 3 jobs show a real-time bar ("Rendering
 * 45%") and any overflow shows its live position ("In Queue: #1"). Each job has its
 * own cancel control (per-job AbortController in the engine). Terminal jobs linger
 * briefly so the user sees the ✓/✕, then can be cleared.
 *
 * Purely presentational over `useJobQueue` — no fetch, no business logic here.
 */

import { useJobQueue } from '@/store/useJobQueue';
import type { Job, JobKind, JobStatus } from '@/lib/jobs/jobQueue';
import { Loader2, Check, X, AlertTriangle, Clock, Film, Music2, Image as ImageIcon, User, Wand2, type LucideIcon } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';

const KIND_ICON: Record<JobKind, LucideIcon> = {
  video: Film,
  music: Music2,
  avatar: User,
  image: ImageIcon,
  product: Film,
  remix: Wand2,
  lipsync: User,
};

function tr(locale: Lang) {
  const en = {
    title: 'Renders',
    queuePos: (n: number) => `In Queue: #${n}`,
    rendering: 'Rendering',
    done: 'Done',
    failed: 'Failed',
    canceled: 'Canceled',
    cancel: 'Cancel',
    clear: 'Clear finished',
    waiting: 'Waiting for a free slot…',
  };
  if (locale === 'ru') {
    return {
      ...en,
      title: 'Рендеры',
      queuePos: (n: number) => `В очереди: #${n}`,
      rendering: 'Рендеринг',
      done: 'Готово',
      failed: 'Ошибка',
      canceled: 'Отменено',
      cancel: 'Отмена',
      clear: 'Очистить',
      waiting: 'Ожидание свободного слота…',
    };
  }
  if (locale === 'ka') {
    return {
      ...en,
      title: 'რენდერები',
      queuePos: (n: number) => `რიგში: #${n}`,
      rendering: 'რენდერი',
      done: 'მზადაა',
      failed: 'შეცდომა',
      canceled: 'გაუქმდა',
      cancel: 'გაუქმება',
      clear: 'გასუფთავება',
      waiting: 'ცდის თავისუფალ სლოტს…',
    };
  }
  return en;
}

const STATUS_TONE: Record<JobStatus, string> = {
  queued: 'text-app-muted',
  rendering: 'text-app-accent',
  done: 'text-emerald-500 dark:text-emerald-400',
  failed: 'text-red-500 dark:text-red-400',
  canceled: 'text-app-muted',
};

function JobRow({ job, locale, onCancel }: { job: Job; locale: Lang; onCancel: (id: string) => void }) {
  const t = tr(locale);
  const Icon = KIND_ICON[job.kind] ?? Film;
  const active = job.status === 'rendering';
  const queued = job.status === 'queued';

  const statusLine =
    queued ? t.queuePos(job.position ?? 1)
    : active ? (job.stage || `${t.rendering}${job.pct ? ` ${job.pct}%` : ''}`)
    : job.status === 'done' ? t.done
    : job.status === 'failed' ? (job.error ? job.error.slice(0, 60) : t.failed)
    : t.canceled;

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-app-border/12 bg-app-bg/40 px-2.5 py-2">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-app-elevated ${STATUS_TONE[job.status]}`}>
        {active ? <Loader2 size={14} className="animate-spin" />
          : queued ? <Clock size={14} />
          : job.status === 'done' ? <Check size={14} />
          : job.status === 'failed' ? <AlertTriangle size={14} />
          : <X size={14} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Icon size={12} className="shrink-0 text-app-muted" />
          <p className="truncate text-[12px] font-semibold text-app-text">{job.label}</p>
        </div>
        {/* Progress bar (rendering) or a thin idle rail (queued). */}
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-app-elevated">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${active ? 'bg-app-accent' : job.status === 'done' ? 'bg-emerald-500' : job.status === 'failed' ? 'bg-red-500' : 'bg-app-border/40'}`}
            style={{ width: `${active ? Math.max(3, job.pct) : queued ? 8 : 100}%` }}
          />
        </div>
        <p className={`mt-0.5 truncate text-[10.5px] ${STATUS_TONE[job.status]}`}>{statusLine}</p>
      </div>

      {(active || queued) && (
        <button
          type="button"
          onClick={() => onCancel(job.id)}
          aria-label={t.cancel}
          title={t.cancel}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function JobTray({ locale = 'ka' }: { locale?: Lang }) {
  const jobs = useJobQueue((s) => s.jobs);
  const cancel = useJobQueue((s) => s.cancel);
  const clearFinished = useJobQueue((s) => s.clearFinished);
  const t = tr(locale);

  if (!jobs.length) return null;

  const anyFinished = jobs.some((j) => j.status === 'done' || j.status === 'failed' || j.status === 'canceled');
  const activeCount = jobs.filter((j) => j.status === 'rendering').length;
  const queuedCount = jobs.filter((j) => j.status === 'queued').length;

  return (
    <div className="pointer-events-auto fixed bottom-3 right-3 z-[60] w-[300px] max-w-[calc(100vw-24px)] rounded-2xl border border-app-border/15 bg-app-surface/95 p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between px-0.5">
        <p className="text-[12px] font-bold text-app-text">
          {t.title}
          <span className="ml-1.5 font-medium text-app-muted tabular-nums">
            {activeCount + queuedCount > 0 ? `${activeCount} active${queuedCount ? ` · ${queuedCount} queued` : ''}` : ''}
          </span>
        </p>
        {anyFinished && (
          <button type="button" onClick={clearFinished} className="text-[10.5px] font-medium text-app-muted transition-colors hover:text-app-accent">
            {t.clear}
          </button>
        )}
      </div>
      <div className="flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto overscroll-contain">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} locale={locale} onCancel={cancel} />
        ))}
      </div>
    </div>
  );
}

export default JobTray;
