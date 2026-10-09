'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, Film, Image as ImageIcon, ImagePlus, Maximize2, Music2, RotateCcw, ScanFace, X } from 'lucide-react';
import { LoadingLoop } from './LoadingLoop';

/**
 * ResultCard — one tile for a generation from the moment it is asked for to the moment it is on screen:
 * queued → rendering → finalizing → ready (or error). The tile has the RESULT's shape from the start (a 9:16
 * video is a 9:16 tile while it renders), so the feed does not jump when the media arrives, and what the user
 * watches while waiting is the loading loop (./LoadingLoop: the avatar forming out of light, the owner's clip,
 * 2026-10-09) under a thin accent bar — not a spinner (docs/DESIGN.md §5, §8).
 *
 * Honest progress, same rules as GenerationProgress: a server-reported percent wins; otherwise elapsed / cap,
 * held at 92 % until the job is actually ready. The bar never claims "done" on a guess.
 *
 * Presentation only: it owns no job and polls nothing. The caller passes the state it already has (the
 * message, the batch tile) and the handlers that already exist (stop, retry, lightbox, the video bridge).
 */
export type ResultState = 'queued' | 'rendering' | 'finalizing' | 'ready' | 'error';
export type ResultKind = 'video' | 'image' | 'music' | 'avatar';
type Lang = 'ka' | 'en' | 'ru';

const KIND: Record<Lang, Record<ResultKind, string>> = {
  ka: { video: 'ვიდეო', image: 'სურათი', music: 'მუსიკა', avatar: 'ავატარი' },
  en: { video: 'Video', image: 'Image', music: 'Music', avatar: 'Avatar' },
  ru: { video: 'Видео', image: 'Изображение', music: 'Музыка', avatar: 'Аватар' },
};

const COPY: Record<Lang, { queued: string; rendering: string; finalizing: string; ready: string; failed: string; cancel: string; retry: string; dismiss: string; open: string; download: string; useAsRef: string; details: string }> = {
  ka: { queued: 'რიგში', rendering: 'მზადდება', finalizing: 'სრულდება…', ready: 'მზადაა', failed: 'ვერ მოხერხდა', cancel: 'გაუქმება', retry: 'თავიდან ცდა', dismiss: 'დამალვა', open: 'გახსნა', download: 'ჩამოტვირთვა', useAsRef: 'რეფერენსად გამოყენება', details: 'დეტალები' },
  en: { queued: 'Queued', rendering: 'Rendering', finalizing: 'Finishing…', ready: 'Ready', failed: 'Failed', cancel: 'Cancel', retry: 'Try again', dismiss: 'Dismiss', open: 'Open', download: 'Download', useAsRef: 'Use as reference', details: 'Details' },
  ru: { queued: 'В очереди', rendering: 'Готовится', finalizing: 'Завершаю…', ready: 'Готово', failed: 'Не удалось', cancel: 'Отмена', retry: 'Повторить', dismiss: 'Скрыть', open: 'Открыть', download: 'Скачать', useAsRef: 'Как референс', details: 'Подробности' },
};

/** The ceiling a time-based estimate may reach; only the real result takes the bar past it. */
export const RESULT_HOLD_PCT = 92;

/**
 * The percentage the card shows. Exported so the rule is tested on its own:
 * ready → 100 · queued → 0 · a real server percent (1–99) → itself · otherwise elapsed / cap, held at 92.
 */
export function resultPct({ state, pct, elapsedSec, capSec }: { state: ResultState; pct?: number | null; elapsedSec?: number; capSec?: number }): number {
  if (state === 'ready') return 100;
  if (state === 'queued') return 0;
  if (typeof pct === 'number' && Number.isFinite(pct) && pct > 0) return Math.min(99, Math.round(pct));
  const cap = Math.max(1, capSec ?? 60);
  const byTime = Math.round((Math.max(0, elapsedSec ?? 0) / cap) * 100);
  return state === 'finalizing' ? RESULT_HOLD_PCT : Math.min(RESULT_HOLD_PCT, byTime);
}

/** CSS aspect-ratio for "9:16"-style labels; anything unparseable falls back to square. */
function ratio(aspect: string): string {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspect.trim());
  return m ? `${m[1]} / ${m[2]}` : '1 / 1';
}

/** A standalone card's width follows its shape, so a 9:16 tile is not stretched to the width of the feed. */
function feedWidth(aspect: string): string {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspect.trim());
  const r = m ? Number(m[1]) / Number(m[2]) : 1;
  if (r < 0.7) return 'w-[min(62vw,280px)]';   // 9:16, 2:3
  if (r < 0.95) return 'w-[min(70vw,320px)]';  // 4:5, 3:4
  if (r < 1.2) return 'w-[min(74vw,340px)]';   // 1:1
  return 'w-[min(86vw,460px)]';                // 16:9, 3:2
}

const KIND_ICON: Record<ResultKind, typeof Film> = { video: Film, image: ImageIcon, music: Music2, avatar: ScanFace };

export interface ResultCardProps {
  kind: ResultKind;
  /** "9:16", "16:9", "1:1", "4:5" — the tile keeps the result's shape in every state. */
  aspect: string;
  state: ResultState;
  locale: Lang;
  /** A real, server-reported percent. Wins over the time estimate. */
  pct?: number | null;
  elapsedSec?: number;
  /** Seconds the time estimate is paced against. */
  capSec?: number;
  /** A stage the pipeline reported — the second line under the caption. */
  stage?: string;
  /** A frame to show faintly behind a failed job (e.g. the first storyboard frame); a working tile shows the loop. */
  poster?: string | null;
  media?: { type: 'video' | 'image'; url: string; poster?: string | null };
  error?: string;
  onCancel?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
  onOpen?: () => void;
  onUseAsRef?: () => void;
  /** 'feed' = a card in the conversation (width follows the shape); 'tile' = fills a grid cell. */
  size?: 'feed' | 'tile';
  /** A service's own detail (the film crew console), tucked under the tile. */
  children?: React.ReactNode;
}

export function ResultCard({
  kind, aspect, state, locale, pct, elapsedSec, capSec, stage, poster, media, error,
  onCancel, onRetry, onDismiss, onOpen, onUseAsRef, size = 'feed', children,
}: ResultCardProps) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const c = COPY[lang];
  const shown = resultPct({ state, pct, elapsedSec, capSec });
  const working = state === 'queued' || state === 'rendering' || state === 'finalizing';
  const kindLabel = KIND[lang][kind];
  // «ვიდეო · 9:16 · 12%» — music has no frame, so no ratio in its caption.
  const parts = [kindLabel, kind === 'music' ? null : aspect, state === 'queued' ? c.queued : working ? `${shown}%` : null].filter(Boolean);
  const caption = parts.join(' · ');
  const secondLine = state === 'finalizing' ? c.finalizing : stage?.replace(/^⚠️\s*/, '').trim();
  const oneLineError = (error ?? '').replace(/^⚠️\s*/, '').split('\n')[0]?.trim() || c.failed;
  const Icon = KIND_ICON[kind];

  // Announce STATE changes, not every percent tick — a screen reader reading "12%, 13%, 14%" is noise.
  const announce = state === 'error' ? `${kindLabel}: ${c.failed}. ${oneLineError}` : `${kindLabel}: ${c[state === 'queued' ? 'queued' : state === 'ready' ? 'ready' : state === 'finalizing' ? 'finalizing' : 'rendering']}`;
  const [liveText, setLiveText] = useState('');
  const lastState = useRef<ResultState | null>(null);
  useEffect(() => {
    if (lastState.current !== state) { lastState.current = state; setLiveText(announce); }
  }, [state, announce]);

  const btn = 'flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm ring-1 ring-white/15 transition-colors hover:bg-black/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent';

  return (
    <div className={size === 'tile' ? 'w-full' : feedWidth(aspect)} data-testid="result-card" data-state={state}>
      <div
        className="group relative w-full overflow-hidden rounded-2xl bg-app-elevated/40 ring-1 ring-app-border/10"
        style={{ aspectRatio: ratio(kind === 'music' ? '1:1' : aspect) }}
      >
        {state === 'ready' && media ? (
          media.type === 'video' ? (
            <video src={media.url} poster={media.poster ?? undefined} controls playsInline preload="metadata" className="h-full w-full bg-black object-contain" />
          ) : onOpen ? (
            <button type="button" onClick={onOpen} className="block h-full w-full cursor-zoom-in" aria-label={c.open}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </button>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          )
        ) : working ? (
          // Queued, rendering, finalizing: the loading loop fills the tile in the result's own shape.
          <LoadingLoop />
        ) : (
          <>
            {/* The plate: a faint frame when there is one, a quiet shimmer always — never an empty spinner. */}
            {poster && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={poster} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-md" />
            )}
            {state !== 'error' && <div aria-hidden="true" className="result-shimmer absolute inset-0" />}
            <Icon aria-hidden="true" size={size === 'tile' ? 18 : 22} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-app-text/20" />
          </>
        )}

        {/* Ready: open · download · use as reference — on hover/focus with a pointer, always on touch. */}
        {state === 'ready' && media && (onOpen || onUseAsRef || media.url) && (
          <div className="absolute right-2 top-2 z-10 flex gap-1.5 transition-opacity duration-200 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
            {onOpen && media.type === 'video' && (
              <button type="button" onClick={onOpen} aria-label={c.open} title={c.open} className={btn}><Maximize2 size={16} /></button>
            )}
            <a href={media.url} download target="_blank" rel="noopener noreferrer" aria-label={c.download} title={c.download} className={btn}><Download size={16} /></a>
            {onUseAsRef && (
              <button type="button" onClick={onUseAsRef} aria-label={c.useAsRef} title={c.useAsRef} className={btn}><ImagePlus size={16} /></button>
            )}
          </div>
        )}

        {/* Working: cancel (44 px), caption, thin accent bar. */}
        {working && (
          <>
            {onCancel && (
              <button type="button" onClick={onCancel} aria-label={c.cancel} title={c.cancel} className={`absolute right-2 top-2 z-10 ${btn}`}>
                <X size={16} />
              </button>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-3 pt-8">
              <p className="truncate text-[12.5px] font-medium tabular-nums text-white/90">{caption}</p>
              {secondLine && size !== 'tile' && <p className="mt-0.5 truncate text-[11px] text-white/55">{secondLine}</p>}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10" role="progressbar" aria-label={caption} aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown}>
              <div className="h-full bg-app-accent transition-[width] duration-700 ease-out" style={{ width: `${Math.max(state === 'queued' ? 0 : 3, shown)}%` }} />
            </div>
          </>
        )}

        {/* Error: one line, retry, dismiss. */}
        {state === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
            <AlertTriangle aria-hidden="true" size={size === 'tile' ? 16 : 20} className="text-app-warning" />
            <p className={`line-clamp-2 text-app-text/85 ${size === 'tile' ? 'text-[11px]' : 'text-[12.5px]'}`} title={oneLineError}>{oneLineError}</p>
            <div className="flex items-center gap-1.5">
              {onRetry && (
                <button type="button" onClick={onRetry} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-app-text px-3.5 text-[12.5px] font-semibold text-app-bg transition-opacity hover:opacity-90">
                  <RotateCcw size={14} aria-hidden="true" /> {c.retry}
                </button>
              )}
              {onDismiss && (
                <button type="button" onClick={onDismiss} aria-label={c.dismiss} title={c.dismiss} className="flex h-11 w-11 items-center justify-center rounded-full text-app-muted ring-1 ring-app-border/15 transition-colors hover:text-app-text">
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">{liveText}</p>

      {children && working && (
        <details className="mt-2 w-[min(88vw,460px)] max-w-[88vw]">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center text-[12.5px] font-medium text-app-muted transition-colors hover:text-app-text [&::-webkit-details-marker]:hidden">
            {c.details}
          </summary>
          {children}
        </details>
      )}
    </div>
  );
}
