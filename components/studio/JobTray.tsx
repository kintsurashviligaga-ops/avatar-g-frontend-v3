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

import { useEffect, useRef, useState } from 'react';
import { useJobQueue } from '@/store/useJobQueue';
import type { Job } from '@/lib/jobs/jobQueue';
import { mergeTrayJobs } from '@/lib/jobs/durableJobs';
import { GenerationProgress, type ProgressKind, type ProgressState } from './ui/GenerationProgress';

type Lang = 'ka' | 'en' | 'ru';


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
    counts: (a: number, q: number) => `${a} active${q ? ` · ${q} queued` : ''}`,
  };
  if (locale === 'ru') {
    return {
      ...en,
      counts: (a: number, q: number) => `${a} активно${q ? ` · ${q} в очереди` : ''}`,
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
      counts: (a: number, q: number) => `${a} აქტიური${q ? ` · ${q} რიგში` : ''}`,
    };
  }
  return en;
}


/**
 * ⚠️ THIS ROW USED TO BE A SECOND, SMALLER IMPLEMENTATION OF THE PROGRESS CARD, and which one a user saw
 * depended on WHICH DEVICE THEY WERE HOLDING. The device that submitted a render owns a chat bubble and
 * gets the full GenerationProgress card; every other device — and this one after a reload — fell here, to
 * a 7px icon, a 1.5px rail and a 10.5px caption. Nothing about that was responsive design: there is not
 * one breakpoint class in either file. It was two implementations of one idea that were never meant to be
 * compared side by side, and then the user put a phone and a desktop next to each other.
 *
 * It now renders the SAME card in `compact` form. Everything the old row showed is preserved — the job
 * label, the queue position, the stage line, the failure reason, the cancel button — because dropping any
 * of them to unify the look would trade one complaint for another.
 */
function JobRow({ job, locale, onCancel }: { job: Job; locale: Lang; onCancel: (id: string) => void }) {
  // `product` is the only queue kind with no card equivalent; it is a video deliverable, so it reads as one.
  const kind: ProgressKind = job.kind === 'product' ? 'video' : job.kind === 'avatar' ? 'lipsync' : job.kind;
  const state: ProgressState =
    job.status === 'rendering' ? 'running'
    : job.status === 'queued' ? 'queued'
    : job.status;
  // Seconds this JOB has been running — not the shared component clock the inline card used to use.
  const startedAt = job.startedAt ?? job.createdAt ?? Date.now();
  const elapsed = Math.max(0, Math.round((Date.now() - startedAt) / 1000));

  return (
    <GenerationProgress
      kind={kind}
      locale={locale}
      compact
      elapsed={elapsed}
      title={job.label}
      state={state}
      {...(job.pct ? { pct: job.pct } : {})}
      {...(job.stage ? { status: job.stage } : {})}
      {...(job.position ? { queuePosition: job.position } : {})}
      {...(job.error ? { error: job.error } : {})}
      {...((job.status === 'rendering' || job.status === 'queued') && !job.observed
        ? { onCancel: () => onCancel(job.id) }
        : {})}
    />
  );
}

export function JobTray({ locale = 'ka' }: { locale?: Lang }) {
  const localJobs = useJobQueue((s) => s.jobs);
  const durableJobs = useJobQueue((s) => s.durableJobs);
  const inlineJobIds = useJobQueue((s) => s.inlineJobIds);
  const cancel = useJobQueue((s) => s.cancel);
  const clearFinished = useJobQueue((s) => s.clearFinished);
  const t = tr(locale);

  // ONE OWNER PER JOB — this tray shows ONLY what nothing else is already showing.
  //
  // Every job submitted through the composer's queue pushes its own chat bubble in the same breath
  // (runImageJob · runImageBatch · runMusicJob · submitFilmJob · generateProductAd · runVideoSwap all do),
  // and that bubble renders GenerationProgress / FilmDirectorConsole / RemixStudioConsole INLINE in the
  // conversation. So a LOCAL job is by construction already on screen, and repeating it in a floating
  // corner card is not a second opinion — it is the fragmentation the user sees as "Renders · 2 active"
  // hovering over "94% Drawing the slides…". Same for a durable row a mounted panel is narrating itself:
  // ServiceParamsPanel claims its job id for as long as its card is up.
  //
  // What is LEFT is exactly what a tray is for: a server-side render with no card ANYWHERE — another tab,
  // another device, a reload before the bubble came back, or a panel the user closed mid-render.
  const owned = new Set<string>([...localJobs.map((j) => j.id), ...inlineJobIds]);
  const jobs = mergeTrayJobs(localJobs, durableJobs).filter((j) => !owned.has(j.id));

  // VECTOR 2 — auto-dismiss a SUCCESSFUL render 4s after it lands, so the green "მზადაა" row never
  // lingers forever. Only HIDES it from the tray (the durable data log is untouched); failed /
  // canceled rows stay visible so the user can see + retry them.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const doneKey = jobs.filter((j) => j.status === 'done').map((j) => j.id).sort().join(',');
  useEffect(() => {
    for (const id of (doneKey ? doneKey.split(',') : [])) {
      if (timersRef.current.has(id)) continue;
      const tmr = setTimeout(() => {
        timersRef.current.delete(id);
        setDismissed((prev) => { if (prev.has(id)) return prev; const n = new Set(prev); n.add(id); return n; });
      }, 4000);
      timersRef.current.set(id, tmr);
    }
  }, [doneKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only teardown of pending timers
  useEffect(() => () => { for (const tmr of timersRef.current.values()) clearTimeout(tmr); timersRef.current.clear(); }, []);

  const visible = jobs.filter((j) => !dismissed.has(j.id));
  // ⚠️ THE COUNT WAS THE WRONG LEVER. This used to hide the tray whenever ≤1 render was active, on the
  // theory that the single-generation case is covered inline. It bought silence for exactly one job and
  // then failed in both directions: a SECOND render made the tray reappear listing jobs that ALREADY had
  // inline cards (two live percentages for the same work, in two places, disagreeing), while a lone render
  // with no card anywhere — a closed panel, another tab, a reload — stayed hidden precisely when this tray
  // was the only thing that could have shown it. Ownership, not arithmetic: `jobs` above is already only
  // the unowned work, so the tray shows whatever is left and disappears when nothing is.
  if (visible.length === 0) return null;

  const anyFinished = visible.some((j) => j.status === 'done' || j.status === 'failed' || j.status === 'canceled');
  const activeCount = visible.filter((j) => j.status === 'rendering').length;
  const queuedCount = visible.filter((j) => j.status === 'queued').length;

  return (
    <div
      className="pointer-events-auto fixed right-3 z-[60] w-[300px] max-w-[calc(100vw-24px)] rounded-2xl border border-app-border/15 bg-app-surface/95 p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md"
      // ⚠️ ABOVE THE COMPOSER, NOT ON IT. This used to be `bottom-3`, which is precisely where the
      // composer sits — so an active render covered "Describe…" and the Options row and made the input
      // unreachable, while duplicating progress the chat already showed inline. --composer-h is
      // published by OmniStudio from a ResizeObserver, because the composer grows as the text wraps and
      // any fixed offset would be wrong at some height. The fallback keeps this correct on surfaces
      // that mount the tray without a composer.
      // --kb-inset is added for the same reason --composer-h is: this tray is `position: fixed`, so it
      // resolves against the LAYOUT viewport, which does not shrink when the keyboard opens. Without it
      // the tray sits behind the keyboard exactly when the user is typing. 0 when the keyboard is shut.
      style={{ bottom: 'calc(var(--composer-h, 0px) + var(--kb-inset, 0px) + 1.25rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="mb-2 flex items-center justify-between px-0.5">
        <p className="text-[12px] font-bold text-app-text">
          {t.title}
          <span className="ml-1.5 font-medium text-app-muted tabular-nums">
            {activeCount + queuedCount > 0 ? t.counts(activeCount, queuedCount) : ''}
          </span>
        </p>
        {anyFinished && (
          <button type="button" onClick={clearFinished} className="tap-44 relative text-[10.5px] font-medium text-app-muted transition-colors hover:text-app-accent">
            {t.clear}
          </button>
        )}
      </div>
      <div className="flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto overscroll-contain">
        {visible.map((job) => (
          <JobRow key={job.id} job={job} locale={locale} onCancel={cancel} />
        ))}
      </div>
    </div>
  );
}

export default JobTray;
