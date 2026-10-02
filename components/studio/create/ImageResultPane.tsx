'use client';

/**
 * ImageResultPane — the desktop Result pane of the Image tool (ref6's "Result"): the latest picture (or pictures) this tool
 * made in the conversation, with the studio's own result actions, and a strip of the earlier ones.
 *
 * A VIEW over lib/studio/imageResults `deriveImageResults`: it starts, cancels and bills nothing — every button calls a handler
 * the studio already has (download, share, upscale, re-roll, edit, save, open in editor, send to video, cancel), keyed by the
 * message's index in the thread, so the pane and the conversation can never disagree about what a button does.
 *
 *   empty      a dashed frame in the SELECTED ratio — what is about to be made
 *   rendering  the studio's ResultCard (the same progress tile the thread draws), with Stop
 *   ready      the picture, large; the action row under it
 *   batch      the ×2 / ×4 tiles, each a ResultCard (retry that tile only), and one re-roll for all
 *   failed     the reason in a ResultCard, "Try again" when the job has a spec, "Top up" when the refusal was for credits
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Clapperboard, Download, Image as ImageIcon, Loader2, Pencil, Plus, RotateCcw, Share2, Sparkles } from 'lucide-react';
import { ResultCard } from '@/components/studio/ui/ResultCard';
import { tierFor, imageLang } from '@/lib/studio/imageCreate';
import type { ImageResultView } from '@/lib/studio/imageResults';
import { imageCreateCopy } from './imageCreateCopy';

export interface ImageResultActions {
  /** Full-screen view. */
  open: (url: string) => void;
  download: (url: string) => void;
  share: (url: string) => void;
  upscale: (url: string) => void;
  /** Re-run the job at thread index `index` with its own spec (a fresh variation). */
  reroll: (index: number) => void;
  /** Load the picture as the next prompt's source picture. */
  edit: (url: string) => void;
  toVideo: (url: string) => void;
  /** The studio's own save-to-library and open-in-editor buttons, drawn by it. */
  renderSave: (url: string, prompt: string) => ReactNode;
  renderEditor: (url: string) => ReactNode;
  /** Stop the job behind the bubble at `index`. */
  cancel: (index: number) => void;
  /** Stop one queued tile of a batch. */
  cancelJob: (jobId: string) => void;
  /** Re-run ONE tile of the batch at `index` (the good variations are not billed again). */
  retryTile: (index: number) => void;
  /** Re-run the whole batch at `index`. */
  rerollBatch: (index: number) => void;
  /** Take a failed bubble (index) or one failed tile (index, tile) out of the thread. */
  dismiss: (index: number, tile?: number) => void;
  topUp: () => void;
}

/**
 * The width a result of this ratio gets: 360 px tall at most (so the Models & prices table below it is on the first screen of a
 * 1280 × 800 desktop), never wider than 520 px or the column. The empty frame and the rendering tile share it, so nothing jumps.
 */
function frameWidth(aspect: string): string {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspect.trim());
  const r = m ? Number(m[1]) / Number(m[2]) : 1;
  return `min(100%, ${Math.round(Math.min(520, 360 * r))}px)`;
}

const ICON_BTN = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-elevated text-app-text ring-1 ring-app-border/15 transition hover:text-app-accent active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:opacity-40';

export function ImageResultPane({
  locale, results, notice, aspect, elapsedSec, capSecFor, actions, busy, upscaling,
}: {
  locale: string;
  results: readonly ImageResultView[];
  /** A refusal line that is not an image bubble (a failed upscale / re-roll). */
  notice: { text: string; topUp: boolean } | null;
  /** The ratio currently selected — the empty frame takes its shape. */
  aspect: string;
  elapsedSec: number;
  /** Seconds a render of a size is paced against (the studio's `imgTargetFor`). */
  capSecFor: (quality: string) => number;
  actions: ImageResultActions;
  busy: boolean;
  upscaling: boolean;
}) {
  const c = imageCreateCopy(locale);
  const lang = imageLang(locale);
  const latest = results[results.length - 1];
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  // A NEW result takes the pane back from an earlier one the user had looked at.
  useEffect(() => { setPickedKey(null); }, [latest?.key]);
  const shown = (pickedKey ? results.find((r) => r.key === pickedKey) : undefined) ?? latest;
  const earlier = results.filter((r) => r !== shown && (r.state === 'ready' || r.state === 'batch')).slice(-8).reverse();
  const thumbOf = (r: ImageResultView): string | null => (r.state === 'ready' ? r.url : r.state === 'batch' ? r.tiles.find((t) => t.status === 'done' && t.url)?.url ?? null : null);

  const topUpButton = (
    <button type="button" onClick={actions.topUp}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-app-accent px-4 text-[13px] font-semibold text-app-bg transition-opacity hover:opacity-90">
      <Plus size={14} aria-hidden="true" /> {c.topUp}
    </button>
  );

  let body: ReactNode;
  if (!shown) {
    body = (
      <div data-testid="result-empty" className="mx-auto" style={{ width: frameWidth(aspect) }}>
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-app-border/25 bg-app-elevated/20 px-6 text-center" style={{ aspectRatio: aspect.replace(':', ' / '), minHeight: 180 }}>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-app-elevated text-app-muted ring-1 ring-app-border/10"><ImageIcon size={20} aria-hidden="true" /></span>
          <span className="text-[15px] font-medium text-app-text/90">{c.resultEmpty}</span>
          <span className="max-w-[26ch] text-[13px] leading-snug text-app-muted">{c.resultEmptyHint}</span>
        </div>
      </div>
    );
  } else if (shown.state === 'rendering') {
    body = (
      <div className="mx-auto" style={{ width: frameWidth(shown.aspect) }}>
        <ResultCard kind="image" size="tile" aspect={shown.aspect} state="rendering" locale={lang} elapsedSec={elapsedSec} capSec={capSecFor(shown.quality)} stage={shown.stage}
          onCancel={() => actions.cancel(shown.index)} />
      </div>
    );
  } else if (shown.state === 'batch') {
    const tiles = shown.tiles;
    body = (
      <div className="mx-auto space-y-2" style={{ width: 'min(100%, 520px)' }}>
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((tile, k) => (
            <ResultCard
              key={k}
              size="tile"
              kind="image"
              aspect={shown.aspect}
              locale={lang}
              state={tile.status === 'done' && tile.url ? 'ready' : tile.status === 'failed' ? 'error' : 'rendering'}
              elapsedSec={elapsedSec}
              capSec={capSecFor(shown.quality)}
              {...(tile.status === 'done' && tile.url ? { media: { type: 'image' as const, url: tile.url } } : {})}
              {...(tile.error ? { error: tile.error } : {})}
              {...(tile.url ? { onOpen: () => actions.open(tile.url!), onUseAsRef: () => actions.toVideo(tile.url!) } : {})}
              {...(tile.status === 'pending' && tile.jobId ? { onCancel: () => actions.cancelJob(tile.jobId!) } : {})}
              {...(!busy ? { onRetry: () => actions.retryTile(shown.index) } : {})}
              {...(tile.status === 'failed' ? { onDismiss: () => actions.dismiss(shown.index, k) } : {})}
            />
          ))}
        </div>
        {!shown.pending && (
          <button type="button" onClick={() => actions.rerollBatch(shown.index)} disabled={busy} title={c.actReroll} aria-label={c.actReroll} className={ICON_BTN}>
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  } else if (shown.state === 'failed') {
    body = (
      <div className="mx-auto space-y-2" style={{ width: frameWidth(shown.aspect) }}>
        <ResultCard kind="image" size="tile" aspect={shown.aspect} state="error" locale={lang} error={shown.message}
          {...(shown.canReroll && !busy ? { onRetry: () => actions.reroll(shown.index) } : {})}
          onDismiss={() => actions.dismiss(shown.index)} />
        {shown.topUp && <div className="flex justify-center">{topUpButton}</div>}
      </div>
    );
  } else {
    const url = shown.url;
    body = (
      <div className="space-y-2.5">
        <div className="mx-auto w-fit max-w-full">
          <button type="button" onClick={() => actions.open(url)} aria-label={c.actOpen} className="block cursor-zoom-in">
            {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL the studio already shows this way */}
            <img src={url} alt={shown.prompt || c.result} decoding="async" data-testid="result-image"
              className="block h-auto max-h-[min(46vh,400px)] w-auto max-w-full rounded-2xl ring-1 ring-app-border/10 transition-opacity hover:opacity-95" />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5" role="toolbar" aria-label={c.result}>
          <button type="button" onClick={() => actions.download(url)} title={c.actDownload} aria-label={c.actDownload}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-accent text-app-bg shadow-sm transition hover:opacity-90 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
            <Download size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => actions.share(url)} title={c.actShare} aria-label={c.actShare} className={ICON_BTN}><Share2 size={16} aria-hidden="true" /></button>
          <button type="button" onClick={() => actions.upscale(url)} disabled={upscaling} title={c.actUpscale} aria-label={c.actUpscale} className={ICON_BTN}>
            {upscaling ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
          </button>
          {shown.canReroll && (
            <button type="button" onClick={() => actions.reroll(shown.index)} disabled={busy} title={c.actReroll} aria-label={c.actReroll} className={ICON_BTN}><RotateCcw size={16} aria-hidden="true" /></button>
          )}
          <button type="button" onClick={() => actions.edit(url)} disabled={busy} title={c.actEdit} aria-label={c.actEdit} className={ICON_BTN}><Pencil size={16} aria-hidden="true" /></button>
          {actions.renderSave(url, shown.prompt)}
          {actions.renderEditor(url)}
          <button type="button" onClick={() => actions.toVideo(url)} title={c.actToVideo} aria-label={c.actToVideo} className={ICON_BTN}><Clapperboard size={16} aria-hidden="true" /></button>
        </div>
      </div>
    );
  }

  const tier = shown ? tierFor(shown.quality) : null;
  return (
    <section data-testid="image-result-pane" aria-labelledby="image-result-heading" className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="image-result-heading" className="text-[15px] font-semibold text-app-text">{c.result}</h2>
        {shown && tier && <span className="text-[12.5px] tabular-nums text-app-muted">{shown.aspect} · {tier.res}</span>}
      </div>
      {shown && shown.prompt && <p className="line-clamp-2 text-[13px] leading-snug text-app-muted">{shown.prompt}</p>}
      {notice && (
        <div role="alert" data-testid="result-notice" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-app-warning/10 px-4 py-2.5 text-[13px] text-app-text ring-1 ring-app-warning/25">
          <span className="min-w-0 flex-1">{notice.text}</span>
          {notice.topUp && topUpButton}
        </div>
      )}
      {body}
      {earlier.length > 0 && (
        <div data-testid="result-earlier" className="space-y-1.5 pt-1">
          <p className="text-[12.5px] font-medium text-app-muted">{c.earlier}</p>
          <ul className="flex flex-wrap gap-2">
            {earlier.map((r) => {
              const thumb = thumbOf(r);
              return (
                <li key={r.key}>
                  <button type="button" onClick={() => setPickedKey(r.key)} aria-label={`${c.earlierOpen}: ${r.prompt || r.aspect}`} title={r.prompt || r.aspect}
                    className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-app-elevated ring-1 ring-app-border/15 transition hover:ring-app-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
                    {thumb
                      // eslint-disable-next-line @next/next/no-img-element -- a small preview of a picture already on screen
                      ? <img src={thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      : <ImageIcon size={16} className="text-app-muted" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
