'use client';

/**
 * Variation grid card (Phase 8.4): the Live Workspace look (rounded elevated card), a 2×2 grid (1 and 2 adapt). Each
 * tile: Upscale (Re-render) with GG's tooltip, Edit, Vary, Use as base, Download PNG/JPG. A failed tile says it was
 * not charged (or refunded) and offers Retry.
 */
import { Download, Pencil, Shuffle, Sparkles, Layers, RotateCcw } from 'lucide-react';
import { artLabel, type Lang } from '@/lib/image/artDirector/labels';
import type { ArtSize } from '@/lib/image/artDirector/spec';

export interface GridTile { index: number; status: 'working' | 'done' | 'failed'; url?: string; id?: string; charged?: number; refunded?: number }

export type TileAction = 'upscale2K' | 'upscale4K' | 'edit' | 'vary' | 'base' | 'png' | 'jpg' | 'retry';

const NOT_CHARGED = { ka: 'არ ჩამოიჭრა', en: 'not charged', ru: 'не списано' } as const;
const RETRY = { ka: 'თავიდან', en: 'Retry', ru: 'Повторить' } as const;
const WORKING = { ka: 'იხატება…', en: 'Drawing…', ru: 'Рисуется…' } as const;

const act = 'inline-flex min-h-[32px] items-center gap-1 rounded-full bg-app-bg/85 px-2.5 text-[12px] text-app-text backdrop-blur hover:bg-app-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60';

export function VariationGrid({ tiles, lang, prices, onAction, ratio = 1 }: {
  tiles: GridTile[];
  lang: Lang;
  prices: Partial<Record<ArtSize, number | null>>;
  onAction: (index: number, action: TileAction) => void;
  ratio?: number;
}) {
  const cols = tiles.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
  return (
    <div data-testid="art-variation-grid" className="mt-3 w-full max-w-[34rem] overflow-hidden rounded-2xl border border-app-border/15 bg-app-elevated/45 p-2">
      <div className={`grid ${cols} gap-2`}>
        {tiles.map((t) => (
          <div key={t.index} data-testid={`art-tile-${t.index}`} data-status={t.status} className="group relative overflow-hidden rounded-xl bg-app-border/10" style={{ aspectRatio: String(ratio) }}>
            {t.status === 'done' && t.url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed private result */}
                <img src={t.url} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-x-1 bottom-1 flex flex-wrap gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  {prices['2K'] != null ? (
                    <button type="button" className={act} title={artLabel('upscaleTip', lang)} data-testid={`art-upscale-2K-${t.index}`} onClick={() => onAction(t.index, 'upscale2K')}>
                      <Sparkles size={12} /> {artLabel('upscale', lang)} 2K ✦{prices['2K']}
                    </button>
                  ) : null}
                  {prices['4K'] != null ? (
                    <button type="button" className={act} title={artLabel('upscaleTip', lang)} data-testid={`art-upscale-4K-${t.index}`} onClick={() => onAction(t.index, 'upscale4K')}>4K ✦{prices['4K']}</button>
                  ) : null}
                  <button type="button" className={act} data-testid={`art-edit-${t.index}`} onClick={() => onAction(t.index, 'edit')}><Pencil size={12} /> {artLabel('edit', lang)}</button>
                  <button type="button" className={act} onClick={() => onAction(t.index, 'vary')}><Shuffle size={12} /> {artLabel('vary', lang)}</button>
                  <button type="button" className={act} onClick={() => onAction(t.index, 'base')}><Layers size={12} /> {artLabel('useAsBase', lang)}</button>
                  <button type="button" className={act} data-testid={`art-png-${t.index}`} onClick={() => onAction(t.index, 'png')}><Download size={12} /> PNG</button>
                  <button type="button" className={act} onClick={() => onAction(t.index, 'jpg')}>JPG</button>
                </div>
              </>
            ) : t.status === 'failed' ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-2 text-center text-[12px] text-app-muted">
                <span data-testid={`art-failed-${t.index}`}>{t.refunded ? `${artLabel('refunded', lang)} ✦${t.refunded}` : NOT_CHARGED[lang]}</span>
                <button type="button" className={act} data-testid={`art-retry-${t.index}`} onClick={() => onAction(t.index, 'retry')}><RotateCcw size={12} /> {RETRY[lang]}</button>
              </div>
            ) : (
              // Phase 8.24: the tile shimmers at its final size (was pulsing text on a flat block).
              <div role="status" data-testid={`art-working-${t.index}`} className="ag-shimmer flex h-full items-end justify-center pb-3 text-[12px] text-app-muted">
                <span className="relative">{WORKING[lang]}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
