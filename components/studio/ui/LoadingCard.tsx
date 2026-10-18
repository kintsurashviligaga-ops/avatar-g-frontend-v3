'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { LoadingLoop } from './LoadingLoop';

/**
 * THE loading card: the one thing every service shows while a generation waits or runs (the owner's PRD, 2026-10-18:
 * "Loading ბარათებს აღარ უნდა მიყვებოდეს ჩატვირთვის ზოლი … მხოლოდ პროცენტული მაჩვენებელი დახვეწილ, მინიმალისტურ
 * სტილში"). The picture is the blue-wave loop (./LoadingLoop); on it sits one quiet percentage. No progress bar, no
 * stage checklist, no remaining-time guess, no spinner.
 *
 * Three shapes of the same card, so a chat bubble, a result tile and a tray row read as one product:
 *   · 'card' (default) a card of its own, the loop as its head;
 *   · 'fill' fills a positioned parent (a result tile already in the result's shape);
 *   · 'row'  one compact line with the loop as a small thumbnail (the job tray, a panel footer).
 *
 * The number is honest (loadingPct): a percent the server measured wins; otherwise the elapsed time eases toward a
 * ceiling it never reaches, so the card never says "done" on a guess. A measured-only caller shows no number at all
 * until the server reports one.
 *
 * Presentation only: it owns no job and polls nothing.
 */
type Lang = 'ka' | 'en' | 'ru';
export type LoadingState = 'queued' | 'running' | 'finalizing';

const COPY: Record<Lang, { queued: string; queuedAt: (n: number) => string; running: string; finalizing: string; cancel: string }> = {
  ka: { queued: 'რიგში', queuedAt: (n) => `რიგში · #${n}`, running: 'მზადდება', finalizing: 'სრულდება…', cancel: 'გაუქმება' },
  en: { queued: 'Queued', queuedAt: (n) => `Queued · #${n}`, running: 'In progress', finalizing: 'Finishing…', cancel: 'Cancel' },
  ru: { queued: 'В очереди', queuedAt: (n) => `В очереди · #${n}`, running: 'Готовится', finalizing: 'Завершаю…', cancel: 'Отмена' },
};

/** The ceiling a time-based estimate may reach; only the real result takes the card past it. */
export const LOADING_HOLD_PCT = 95;

/**
 * The eased estimate: fast at first, asymptotic toward 95, never arriving. A number that reaches its ceiling and stops
 * looks identical to a crashed render, and the user's next move is to reload and lose the work.
 */
export function easedPct(elapsedSec: number, targetSec: number): number {
  const t = Math.max(1, targetSec);
  return Math.min(LOADING_HOLD_PCT, Math.round((1 - Math.exp(-Math.max(0, elapsedSec) / (t / 2.4))) * 100));
}

/**
 * The number the card prints, or null for none. Exported so the rule is tested on its own:
 * queued → none · a measured percent (> 0) → itself, at most 99 · measured-only without one → none ·
 * finalizing → the ceiling · otherwise the eased estimate, held below the ceiling.
 */
export function loadingPct({ state = 'running', pct, elapsedSec = 0, targetSec = 60, measuredOnly = false, holdPct = LOADING_HOLD_PCT }: {
  state?: LoadingState;
  pct?: number | null;
  elapsedSec?: number;
  targetSec?: number;
  measuredOnly?: boolean;
  holdPct?: number;
}): number | null {
  if (state === 'queued') return null;
  if (typeof pct === 'number' && Number.isFinite(pct) && pct > 0) return Math.min(99, Math.round(pct));
  if (measuredOnly) return null;
  if (state === 'finalizing') return holdPct;
  return Math.min(holdPct, easedPct(elapsedSec, targetSec));
}

/** CSS aspect-ratio for "9:16"-style labels; null when there is none to keep. */
function ratio(aspect?: string): string | null {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec((aspect ?? '').trim());
  return m ? `${m[1]} / ${m[2]}` : null;
}

export interface LoadingCardProps {
  locale: string;
  /** What is being made, one or two words ("ვიდეო", "მუსიკა"). */
  label?: string;
  /** A stage the pipeline reported: a quiet second line, because it is real. */
  stage?: string;
  state?: LoadingState;
  /** Position in the queue, for `state === 'queued'`. */
  queuePosition?: number;
  /** A percent the server measured. Wins over the estimate. */
  pct?: number | null;
  /** Seconds since the job started, paced against `targetSec` for the estimate. */
  elapsedSec?: number;
  targetSec?: number;
  /** Print only a measured percent (a job the server runs and this tab only watches). */
  measuredOnly?: boolean;
  /** The estimate's ceiling (default 95). */
  holdPct?: number;
  onCancel?: () => void;
  cancelLabel?: string;
  variant?: 'card' | 'fill' | 'row';
  /** 'card' only: keep the result's shape ("9:16"); without it the head is a fixed band. */
  aspect?: string;
  /** Leave the loop out where one is already on screen right above (one wait never shows two loops). */
  picture?: boolean;
  /** Off where the caller already announces the job's states (ResultCard), so a screen reader hears them once. */
  announce?: boolean;
  className?: string;
}

export function LoadingCard({
  locale, label, stage, state = 'running', queuePosition, pct, elapsedSec, targetSec, measuredOnly, holdPct,
  onCancel, cancelLabel, variant = 'card', aspect, picture = true, announce: speak = true, className = '',
}: LoadingCardProps) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const c = COPY[lang];
  const shown = loadingPct({ state, pct, elapsedSec, targetSec, measuredOnly, holdPct });
  const status = state === 'queued' ? (queuePosition ? c.queuedAt(queuePosition) : c.queued)
    : state === 'finalizing' ? c.finalizing
    : stage?.replace(/^⚠️\s*/, '').trim() || (shown === null ? c.running : '');
  const name = label?.trim() || c.running;
  const cancelText = cancelLabel || c.cancel;

  // Announce STATE changes, not percent ticks: "12%, 13%, 14%" read aloud is noise. The region mounts empty (a live
  // region is only heard when it changes, and the first state is on screen already) and says the state alone: the
  // progressbar carries the label as its name, and a second copy would be read, and matched, twice.
  const announce = state === 'queued' ? c.queued : state === 'finalizing' ? c.finalizing : c.running;
  const [liveText, setLiveText] = useState('');
  const last = useRef(announce);
  useEffect(() => {
    if (last.current !== announce) { last.current = announce; setLiveText(announce); }
  }, [announce]);

  const progress = {
    role: 'progressbar' as const,
    'aria-label': name,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    ...(shown === null ? {} : { 'aria-valuenow': shown, 'aria-valuetext': `${shown}%` }),
  };

  const number = shown === null ? null : (
    <span className="inline-flex items-baseline gap-0.5 tabular-nums" data-testid="loading-card-pct">
      <span className="text-[30px] font-light leading-none tracking-tight">{shown}</span>
      <span className="text-[13px] font-normal opacity-60">%</span>
    </span>
  );

  if (variant === 'row') {
    return (
      <div data-testid="loading-card" data-variant="row" data-state={state}
        className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-app-border/15 bg-app-elevated/50 px-3 py-2 ${className}`}>
        {picture && (
          <div aria-hidden="true" className="relative h-[44px] w-[26px] shrink-0 overflow-hidden rounded-lg bg-black">
            <LoadingLoop />
          </div>
        )}
        <div className="min-w-0 flex-1" {...progress}>
          <p className="truncate text-[13px] font-medium text-app-text" title={name}>{name}</p>
          {status && <p className="truncate text-[11.5px] text-app-muted">{status}</p>}
        </div>
        {shown !== null && (
          <span className="shrink-0 tabular-nums text-[15px] font-light text-app-text" data-testid="loading-card-pct">{shown}<span className="text-[11px] opacity-60">%</span></span>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} aria-label={cancelText} title={cancelText}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-accent">
            <X size={16} />
          </button>
        )}
        {speak && <p className="sr-only" aria-live="polite">{liveText}</p>}
      </div>
    );
  }

  const shape = variant === 'card' ? ratio(aspect) : null;
  const overlay = (
    <>
      {onCancel && (
        <button type="button" onClick={onCancel} aria-label={cancelText} title={cancelText}
          className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent">
          <X size={16} />
        </button>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent px-3.5 pb-3 pt-10 text-white" {...progress}>
        <p className="truncate text-[11.5px] font-medium text-white/75" title={name}>{name}</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          {number ?? <span className="text-[13px] text-white/80">{status}</span>}
          {number && status && <span className="min-w-0 truncate pb-0.5 text-right text-[11.5px] text-white/60">{status}</span>}
        </div>
      </div>
      {speak && <p className="sr-only" aria-live="polite">{liveText}</p>}
    </>
  );

  if (variant === 'fill') {
    return (
      <div data-testid="loading-card" data-variant="fill" data-state={state} className={`absolute inset-0 overflow-hidden ${className}`}>
        {picture && <LoadingLoop />}
        {overlay}
      </div>
    );
  }

  return (
    <div data-testid="loading-card" data-variant="card" data-state={state}
      className={`relative w-full max-w-[min(86vw,440px)] overflow-hidden rounded-2xl ring-1 ring-app-border/15 ${picture ? 'bg-black' : 'bg-black/80'} ${shape ? '' : picture ? 'h-[168px]' : 'h-[96px]'} ${className}`}
      style={shape ? { aspectRatio: shape } : undefined}>
      {picture && <LoadingLoop />}
      {overlay}
    </div>
  );
}
