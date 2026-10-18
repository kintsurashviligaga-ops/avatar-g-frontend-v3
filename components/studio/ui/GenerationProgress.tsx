'use client';

import { AlertTriangle, Check, X } from 'lucide-react';
import { LoadingCard, easedPct } from './LoadingCard';

/**
 * Every job state in one place, for the surfaces that track a job (the tray, a panel, the consoles).
 *
 * While the job waits or runs it draws THE loading card (./LoadingCard): the blue-wave loop and one quiet percentage,
 * no progress bar, no stage checklist, no remaining-time guess (the owner's PRD, 2026-10-18). Once it is over it draws
 * one line: ready (100 %), the real failure reason, or stopped.
 *
 * The number is honest (LoadingCard's loadingPct): a measured percent wins; otherwise the elapsed time eases toward 95
 * against a per-service target (PROGRESS_TARGET, measured, not guessed) and never arrives, so the card never says
 * "done" while the user waits. A stage the pipeline reported is printed as the card's second line.
 */

export type ProgressKind =
  | 'image' | 'music' | 'video' | 'lipsync'
  | 'remix' | 'montage' | 'dubbing' | 'presentation' | 'model3d' | 'editor';

type Lang = 'ka' | 'en' | 'ru';

/**
 * Wall-clock target per service, in seconds — what the "remaining" figure is paced against.
 *
 * These are MEASURED, not guessed, and that matters: an estimate that runs out while the job continues
 * is worse than showing none, because it teaches the user that the product's numbers are decoration.
 * The 30s film is the extreme case at roughly seven minutes end to end (clip generation plus the ffmpeg
 * montage), so its bar has to crawl rather than finish early and stall.
 */
export const PROGRESS_TARGET: Record<ProgressKind, number> = {
  image: 65,
  music: 150,
  video: 440,
  // ⚠️ WAS 70. LipsyncStudio's own comment records the measurement — "a live production test showed
  // SadTalker renders take ~6 min (cold start + render)" — and both surfaces poll for TEN minutes. At
  // 70s the bar pegged at 95% after about a minute and a half and the remaining figure hit zero, then
  // the user waited another four minutes staring at a full bar. That is the single most convincing way
  // to make a working render look hung.
  lipsync: 360,
  remix: 120,
  montage: 200,   // conform pass per source + the N-input stitch + the music mux
  dubbing: 280,   // seven legs, one TTS call per line of dialogue
  presentation: 140, // outline + up to 12 sequential image calls + rasterisation
  model3d: 420,   // reconstruction is the slowest thing in the product
  editor: 150,
};

/** The eased curve (./LoadingCard, the one loading card), re-exported for the surfaces that pace a number with it. */
export { easedPct };

/** m:ss — exported because the composer's inline status line formats the same clock. */
export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Terminal wording: the card owns EVERY state a job can be in, not just "running". */
const STATE_COPY: Record<Lang, { done: string; failed: string; canceled: string }> = {
  ka: { done: 'მზადაა', failed: 'ვერ მოხერხდა', canceled: 'შეჩერდა' },
  en: { done: 'Ready', failed: 'Failed', canceled: 'Stopped' },
  ru: { done: 'Готово', failed: 'Не удалось', canceled: 'Остановлено' },
};

/** What each kind is called on the card when the caller gives no title. */
const KIND_LABEL: Record<Lang, Record<ProgressKind, string>> = {
  ka: { image: 'სურათი', music: 'მუსიკა', video: 'ვიდეო', lipsync: 'ავატარი', remix: 'ვიდეოს რედაქტირება', montage: 'მონტაჟი', dubbing: 'დუბლაჟი', presentation: 'პრეზენტაცია', model3d: '3D მოდელი', editor: 'რედაქტორი' },
  en: { image: 'Image', music: 'Music', video: 'Video', lipsync: 'Avatar', remix: 'Video edit', montage: 'Montage', dubbing: 'Dubbing', presentation: 'Presentation', model3d: '3D model', editor: 'Editor' },
  ru: { image: 'Изображение', music: 'Музыка', video: 'Видео', lipsync: 'Аватар', remix: 'Правка видео', montage: 'Монтаж', dubbing: 'Дубляж', presentation: 'Презентация', model3d: '3D-модель', editor: 'Редактор' },
};

/**
 * ⚠️ ONE JOB WAS BEING DRAWN BY THREE DIFFERENT COMPONENTS, and which one you saw depended on WHICH
 * DEVICE YOU USED. The device that submitted a render has a chat bubble for it and got this card — a big
 * live percentage, a stage headline, a checklist, a time estimate. Every other device (and this one after
 * a reload) fell to JobTray's own row: a 7px icon, a 1.5px rail and a 10.5px caption. Nothing responsive
 * about it — there is not one breakpoint class in either file — just two implementations of the same idea
 * that were never meant to be compared, and the user compared them.
 *
 * So this card now owns EVERY state a job can be in, and the tray renders it in `compact` form instead of
 * its own markup. One visual language, whichever device you are holding.
 */
export type ProgressState = 'running' | 'queued' | 'done' | 'failed' | 'canceled';

export function GenerationProgress({
  kind, elapsed, status, locale, targetSec, pct: pctOverride, compact, measuredOnly = false,
  title, subtitle, state = 'running', queuePosition, error, onCancel, cancelLabel, children, loop = true,
}: {
  kind: ProgressKind;
  /** Seconds since the run started. */
  elapsed: number;
  /** The job's own label — shown above the percentage when the tray renders a job it does not own. */
  title?: string;
  /** Which state to draw. Anything but 'running' replaces the animated headline with a terminal line. */
  state?: ProgressState;
  /** Position in the local queue, for `state === 'queued'`. */
  queuePosition?: number;
  /** Failure reason, for `state === 'failed'`. */
  error?: string;
  /** Second line under the title — the film/remix consoles name the specific pipeline here. */
  subtitle?: string;
  /** Renders a cancel affordance when supplied. */
  onCancel?: () => void;
  /** Overrides the card's own wording — a caller that already localises "Stop" keeps its label. */
  cancelLabel?: string;
  /**
   * A service-specific body under the card (the remix console's weighted stage list), so unifying the look does not
   * cost what a service knows about itself.
   */
  children?: React.ReactNode;
  /** A stage the PIPELINE reported — the card's second line, because it is real. */
  status?: string;
  locale: Lang;
  /** Override the eased target, e.g. a heavier image tier. */
  targetSec?: number;
  /** A real server-reported percentage. Beats the time-based estimate when present. */
  pct?: number;
  /** The card's one-line row shape — for tight surfaces like the job tray or an in-chat panel. */
  compact?: boolean;
  /**
   * Print only what the server measured. A job the server runs and reports on (the tray's observed rows) has
   * no local clock worth easing: with no server percent the card shows no number, only the server's stage or a
   * plain "in progress". Off by
   * default, so every studio that runs its own work keeps the eased estimate it was designed with.
   */
  measuredOnly?: boolean;
  /**
   * Draw the loading loop while the job waits or runs (default). Off only where the loop is already on screen
   * right above this card (the film console tucked under its ResultCard), so one wait never shows two loops.
   */
  loop?: boolean;
}) {
  const target = targetSec ?? PROGRESS_TARGET[kind];
  const sc = STATE_COPY[locale] ?? STATE_COPY.ka;
  const working = state === 'running' || state === 'queued';
  const label = title?.trim() || KIND_LABEL[locale]?.[kind] || KIND_LABEL.ka[kind];

  if (working) {
    // THE loading card (./LoadingCard): the blue-wave loop and one quiet percentage, no bar (the owner's PRD, 2026-10-18).
    // Only a stage the pipeline reported is printed; a narrated guess is not.
    return (
      <div className={`${compact ? 'w-full' : 'w-full max-w-[min(86vw,440px)]'} space-y-2`}>
        <LoadingCard
          locale={locale}
          label={label}
          stage={[subtitle, status].filter((x) => x && x.trim()).join(' · ') || undefined}
          state={state === 'queued' ? 'queued' : 'running'}
          queuePosition={queuePosition}
          pct={pctOverride}
          elapsedSec={elapsed}
          targetSec={target}
          measuredOnly={measuredOnly}
          onCancel={onCancel}
          cancelLabel={cancelLabel}
          variant={compact ? 'row' : 'card'}
          picture={loop}
        />
        {children}
      </div>
    );
  }

  // Over: one quiet line, no bar. Terminal states show 100 for done (the work IS over).
  const headline = state === 'done' ? sc.done
    : state === 'failed' ? (error?.trim() ? error.trim().slice(0, 90) : sc.failed)
    : sc.canceled;
  const tone = state === 'failed' ? 'text-red-500' : state === 'done' ? 'text-emerald-500' : 'text-app-muted';
  const Icon = state === 'done' ? Check : state === 'failed' ? AlertTriangle : X;
  return (
    <div className={`${compact ? 'w-full' : 'w-full max-w-[min(86vw,440px)]'} flex min-h-[56px] items-center gap-3 rounded-2xl border border-app-border/15 bg-app-elevated/50 px-3.5 py-2`} data-state={state}>
      <div className="min-w-0 flex-1">
        {title && <p className="truncate text-[13px] font-medium text-app-text" title={title}>{title}</p>}
        <span className={`inline-flex min-w-0 max-w-full items-center gap-1.5 text-[12.5px] font-medium ${tone}`}>
          <Icon size={13} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{headline}</span>
        </span>
      </div>
      {state === 'done' && (
        <span className="shrink-0 tabular-nums text-[15px] font-light text-app-text">100<span className="text-[11px] opacity-60">%</span></span>
      )}
    </div>
  );
}
