'use client';

/**
 * The pickers the create screen opens from its tiles: LENGTH (presets + a slider over the real grid, with the live price) and
 * FORMAT (the four ratios). The MODEL is chosen in the studio's one ModelPicker (components/studio/ui/ModelPicker — the
 * catalogue's video rows, no prices); `VideoModeChoice` rides at the top of that sheet. `VideoModelList` is the desktop
 * "Models & prices" table (VideoStage).
 *
 * ⚠️ THE SLIDER CANNOT LAND BETWEEN STOPS: it is an integer range over the INDEX of VIDEO_DURATION_STOPS (4, 6, 8, then
 * every 8 s), so every value it produces is a length the server accepts. Lengths that need the long-form pipeline stay
 * beyond the slider's end, shown locked, unless the server says that pipeline is open (lib/video/createPanel).
 */
import { Check, Film, Lock, Music2, Sparkle } from 'lucide-react';
import { creditsLabel } from '@/lib/credits/quote';
import type { VideoMode, VideoQuality } from '@/lib/credits/videoPricing';
import {
  PRICE_TABLE_LENGTHS,
  MUSIC_VIDEO_SURCHARGE_PCT,
  VIDEO_TIERS,
  isLengthLocked,
  lastOpenStopIndex,
  videoQuote,
  videoResolution,
  type VideoCapabilities,
} from '@/lib/video/createPanel';
import {
  VIDEO_DURATION_PRESETS,
  VIDEO_DURATION_STOPS,
  durationStopIndex,
  formatVideoClock,
  formatVideoDuration,
  sceneCountForSeconds,
  spokenVideoDuration,
  videoRoute,
} from '@/lib/video/duration';
import type { OutputFormat } from '@/lib/veo/types';
import { BottomSheet } from '@/components/studio/ui/BottomSheet';
import { VIDEO_COPY, vc, type L3 } from './videoCreateCopy';
import { VideoTierBars, modeName, modelRowName, tierName } from './videoCreateParts';

const cx = (...p: Array<string | false | null | undefined>) => p.filter(Boolean).join(' ');
const DONE_BTN = 'flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-app-accent px-5 text-[16px] font-bold text-app-bg transition-opacity hover:opacity-95 active:scale-[0.99]';

// ── Length ────────────────────────────────────────────────────────────────────────────────────────────────

export function VideoDurationSheet({ open, onClose, locale, seconds, onChange, caps, tier, mode }: {
  open: boolean;
  onClose: () => void;
  locale: string;
  seconds: number;
  onChange: (seconds: number) => void;
  caps: VideoCapabilities;
  tier: VideoQuality;
  mode: VideoMode;
}) {
  const lastOpen = lastOpenStopIndex(caps);
  const index = Math.min(Math.max(0, durationStopIndex(seconds)), lastOpen);
  const firstLocked = VIDEO_DURATION_STOPS[lastOpen + 1];
  const scenes = sceneCountForSeconds(seconds);
  const route = videoRoute(seconds);
  const price = videoQuote({ seconds, tier, mode });
  const shape = route === 'single'
    ? `${vc(VIDEO_COPY.oneClip, locale)} · ${videoResolution(seconds)}`
    : `${vc(VIDEO_COPY.scenes(scenes), locale)} · ${videoResolution(seconds)}`;
  return (
    <BottomSheet open={open} onClose={onClose} title={vc(VIDEO_COPY.lengthTitle, locale)} closeLabel={vc(VIDEO_COPY.close, locale)} testId="video-duration-sheet">
      <div className="space-y-5 px-2 pb-3 pt-1">
        <div className="text-center">
          <div data-testid="video-duration-readout" aria-live="polite" className="font-display text-[48px] font-extrabold tabular-nums leading-none text-app-text">{formatVideoClock(seconds)}</div>
          <p className="mt-1.5 text-[13px] text-app-muted">{shape}</p>
          <p data-testid="video-duration-price" data-price={price} className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-app-accent/15 px-3.5 py-1.5 text-[15px] font-bold tabular-nums text-app-accent">
            <Sparkle size={14} fill="currentColor" strokeWidth={0} aria-hidden="true" />
            <span aria-label={`${vc(VIDEO_COPY.price, locale)}: ${creditsLabel(price, locale)}`}>{price}</span>
          </p>
        </div>

        <div role="group" aria-label={vc(VIDEO_COPY.presets, locale)} className="flex flex-wrap justify-center gap-2" data-testid="video-duration-presets">
          {VIDEO_DURATION_PRESETS.map((p) => {
            const locked = isLengthLocked(p, caps);
            const on = p === seconds;
            return (
              <button key={p} type="button" disabled={locked} aria-pressed={on} onClick={() => onChange(p)} data-testid={`video-preset-${p}`}
                aria-label={locked ? `${formatVideoDuration(p, locale)} — ${vc(VIDEO_COPY.openingSoon, locale)}` : spokenVideoDuration(p, locale)}
                title={locked ? vc(VIDEO_COPY.openingSoon, locale) : undefined}
                className={cx('inline-flex min-h-[44px] min-w-[64px] items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-semibold tabular-nums transition-colors disabled:cursor-not-allowed',
                  on ? 'bg-app-accent/15 text-app-accent ring-1 ring-app-accent/50' : locked ? 'bg-app-elevated/60 text-app-muted/60 ring-1 ring-app-border/10' : 'bg-app-elevated text-app-text ring-1 ring-app-border/15 hover:ring-app-accent/40')}>
                {locked && <Lock size={12} aria-hidden="true" />}
                {formatVideoDuration(p, locale)}
              </button>
            );
          })}
        </div>

        <div>
          <input
            type="range" min={0} max={lastOpen} step={1} value={index} data-testid="video-duration-slider"
            aria-label={vc(VIDEO_COPY.lengthTitle, locale)}
            aria-valuetext={spokenVideoDuration(seconds, locale)}
            onChange={(e) => { const s = VIDEO_DURATION_STOPS[Number(e.target.value)]; if (s !== undefined) onChange(s); }}
            className="block h-11 w-full cursor-pointer accent-app-accent"
          />
          <div className="mt-0.5 flex items-center justify-between text-[11.5px] tabular-nums text-app-muted" aria-hidden="true">
            <span>{formatVideoClock(VIDEO_DURATION_STOPS[0] ?? 4)}</span>
            <span>{formatVideoClock(VIDEO_DURATION_STOPS[lastOpen] ?? 96)}</span>
          </div>
        </div>

        {firstLocked !== undefined && (
          <p data-testid="video-duration-locked" className="flex items-start gap-2 rounded-2xl bg-app-elevated/70 px-3.5 py-3 text-[12.5px] leading-snug text-app-muted">
            <Lock size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold tabular-nums text-app-text">{formatVideoClock(firstLocked)} – {formatVideoClock(VIDEO_DURATION_STOPS[VIDEO_DURATION_STOPS.length - 1] ?? 240)}</span>
              {' · '}{vc(VIDEO_COPY.openingSoon, locale)}. {vc(VIDEO_COPY.longformNote, locale)}
            </span>
          </p>
        )}

        <button type="button" onClick={onClose} className={DONE_BTN}>{vc(VIDEO_COPY.done, locale)}</button>
      </div>
    </BottomSheet>
  );
}

// ── Format ────────────────────────────────────────────────────────────────────────────────────────────────

const FORMATS: ReadonlyArray<{ id: OutputFormat; name: L3; use: L3 }> = [
  { id: '9:16', name: VIDEO_COPY.vertical, use: VIDEO_COPY.verticalUse },
  { id: '1:1', name: VIDEO_COPY.square, use: VIDEO_COPY.squareUse },
  { id: '16:9', name: VIDEO_COPY.landscape, use: VIDEO_COPY.landscapeUse },
  { id: '4:5', name: VIDEO_COPY.portrait, use: VIDEO_COPY.portraitUse },
];

function RatioBox({ ratio, on }: { ratio: OutputFormat; on: boolean }) {
  const [w, h] = ratio.split(':').map(Number) as [number, number];
  const max = 26;
  const bw = w >= h ? max : Math.round((max * w) / h);
  const bh = h >= w ? max : Math.round((max * h) / w);
  return (
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center">
      <span className={cx('block rounded-[3px] border-2 transition-colors', on ? 'border-app-accent bg-app-accent/25' : 'border-app-border/40')} style={{ width: bw, height: bh }} />
    </span>
  );
}

export function VideoFormatSheet({ open, onClose, locale, format, onChange, musicVideo, notes }: {
  open: boolean;
  onClose: () => void;
  locale: string;
  format: OutputFormat;
  onChange: (f: OutputFormat) => void;
  /** A music video is always 9:16 — the others are shown but cannot be picked. */
  musicVideo: boolean;
  /** Honest notes next to the choice that causes them (a cropped ratio). */
  notes: string[];
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={vc(VIDEO_COPY.formatTitle, locale)} closeLabel={vc(VIDEO_COPY.close, locale)} testId="video-format-sheet">
      <div className="space-y-3 px-2 pb-3 pt-1">
        <div role="radiogroup" aria-label={vc(VIDEO_COPY.formatTitle, locale)} className="grid gap-2">
          {FORMATS.map((f) => {
            const on = f.id === format;
            const off = musicVideo && f.id !== '9:16';
            return (
              <button key={f.id} type="button" role="radio" aria-checked={on} disabled={off} onClick={() => { onChange(f.id); onClose(); }} data-testid={`video-format-${f.id.replace(':', '-')}`}
                className={cx('flex min-h-[60px] items-center gap-3 rounded-2xl border px-3.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  on ? 'border-app-accent/60 bg-app-accent/10' : 'border-app-border/15 bg-app-elevated hover:bg-app-elevated/70')}>
                <RatioBox ratio={f.id} on={on} />
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-[16px] font-semibold tabular-nums', on ? 'text-app-accent' : 'text-app-text')}>{f.id}<span className="ml-2 text-[13px] font-medium text-app-muted">{vc(f.name, locale)}</span></span>
                  <span className="block text-[12.5px] text-app-muted">{vc(f.use, locale)}</span>
                </span>
                {on && <Check size={18} aria-hidden="true" className="shrink-0 text-app-accent" />}
              </button>
            );
          })}
        </div>
        {musicVideo && <p className="rounded-2xl bg-app-elevated/70 px-3.5 py-2.5 text-[12.5px] leading-snug text-app-muted">{vc(VIDEO_COPY.musicVideoLocksFormat, locale)}</p>}
        {notes.map((n) => <p key={n} className="rounded-2xl bg-app-accent/10 px-3.5 py-2.5 text-[12.5px] leading-snug text-app-text/90">{n}</p>)}
      </div>
    </BottomSheet>
  );
}

// ── Model list (phone picker body + desktop table) ───────────────────────────────────────────────────────

const BLURB: Record<VideoQuality, L3> = { lite: VIDEO_COPY.liteBlurb, fast: VIDEO_COPY.fastBlurb, standard: VIDEO_COPY.standardBlurb };

export function VideoModelList({ locale, tier, mode, seconds, onTier, variant }: {
  locale: string;
  tier: VideoQuality;
  mode: VideoMode;
  seconds: number;
  onTier: (t: VideoQuality) => void;
  variant: 'sheet' | 'table';
}) {
  if (variant === 'sheet') {
    return (
      <div role="radiogroup" aria-label={vc(VIDEO_COPY.engineLabel, locale)} className="grid gap-2" data-testid="video-model-list">
        {VIDEO_TIERS.map((t) => {
          const on = t === tier;
          return (
            <button key={t} type="button" role="radio" aria-checked={on} onClick={() => onTier(t)} data-testid={`video-model-${t}`}
              className={cx('flex min-h-[68px] items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors',
                on ? 'border-app-accent/60 bg-app-accent/10' : 'border-app-border/15 bg-app-elevated hover:bg-app-elevated/70')}>
              <VideoTierBars tier={t} />
              <span className="min-w-0 flex-1">
                <span className={cx('flex flex-wrap items-center gap-x-2 text-[16px] font-semibold', on ? 'text-app-accent' : 'text-app-text')}>
                  {modelRowName(t)}
                  <span className="rounded-full bg-app-border/15 px-2 py-0.5 text-[11px] font-medium text-app-muted">{tierName(t, locale)}</span>
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-app-muted">{vc(BLURB[t], locale)}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[15px] font-bold tabular-nums text-app-text">✦ {videoQuote({ seconds, tier: t, mode })}</span>
                <span className="block text-[11px] tabular-nums text-app-muted">{formatVideoDuration(seconds, locale)}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }
  const cols = 'grid-cols-[minmax(0,1.7fr)_repeat(5,minmax(0,1fr))]';
  return (
    <div role="radiogroup" aria-label={vc(VIDEO_COPY.modelsPrices, locale)} data-testid="video-models-table" className="overflow-hidden rounded-2xl border border-app-border/10">
      <div className={cx('grid items-center gap-1 bg-app-elevated/70 px-3 py-2 text-[11.5px] font-medium text-app-muted', cols)}>
        <span>{vc(VIDEO_COPY.model, locale)}</span>
        {PRICE_TABLE_LENGTHS.map((l) => <span key={l} className="text-right tabular-nums">{formatVideoDuration(l, locale)}</span>)}
      </div>
      {VIDEO_TIERS.map((t) => {
        const on = t === tier;
        return (
          <button key={t} type="button" role="radio" aria-checked={on} onClick={() => onTier(t)} data-testid={`video-model-${t}`}
            className={cx('grid w-full items-center gap-1 border-t border-app-border/10 px-3 py-3 text-left transition-colors', cols, on ? 'bg-app-accent/10' : 'hover:bg-app-elevated/50')}>
            <span className="min-w-0">
              <span className={cx('flex min-w-0 items-center gap-2 text-[14px] font-semibold', on ? 'text-app-accent' : 'text-app-text')}>
                <VideoTierBars tier={t} /><span className="truncate">{modelRowName(t)}</span>
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-app-muted">{vc(BLURB[t], locale)}</span>
            </span>
            {PRICE_TABLE_LENGTHS.map((l) => (
              <span key={l} data-price={videoQuote({ seconds: l, tier: t, mode })} className={cx('text-right text-[13px] tabular-nums', l === seconds ? 'font-bold text-app-text' : 'text-app-muted')}>
                {videoQuote({ seconds: l, tier: t, mode })}
              </span>
            ))}
          </button>
        );
      })}
      <p className="border-t border-app-border/10 bg-app-elevated/40 px-3 py-2 text-[11.5px] leading-snug text-app-muted">
        {vc(VIDEO_COPY.creditsPerFilm, locale)} · {modeName(mode, locale)}
        {mode === 'musicvideo' ? ` · ${vc(VIDEO_COPY.musicVideoSurcharge(MUSIC_VIDEO_SURCHARGE_PCT), locale)}` : ''}
      </p>
    </div>
  );
}

/**
 * Film or music video — what the film IS, independent of the model it renders on. ⚠️ VISIBLE AT THE TOP OF THE PANEL:
 * it used to sit inside the model sheet's header and inside the closed „Story & style" disclosure, and the owner could
 * not find music-video making in the Video service at all (2026-10-09 18:25Z). One switch, one place, always on screen.
 */
export function VideoModeChoice({ locale, mode, onMode }: { locale: string; mode: VideoMode; onMode: (m: VideoMode) => void }) {
  const modes: { id: VideoMode; name: string; sub: string; Icon: typeof Film }[] = [
    { id: 'documentary', name: modeName('documentary', locale), sub: vc(VIDEO_COPY.modeDocumentarySub, locale), Icon: Film },
    { id: 'musicvideo', name: modeName('musicvideo', locale), sub: vc(VIDEO_COPY.modeMusicVideoSub, locale), Icon: Music2 },
  ];
  return (
    <div data-testid="video-mode-choice" role="radiogroup" aria-label={vc(VIDEO_COPY.modeLabel, locale)}
      className="grid grid-cols-2 gap-1 rounded-2xl bg-app-elevated/70 p-1 ring-1 ring-app-border/10">
      {modes.map((m) => {
        const on = m.id === mode;
        return (
          <button key={m.id} type="button" role="radio" aria-checked={on} onClick={() => onMode(m.id)} data-testid={`video-mode-${m.id}`}
            className={cx('flex min-h-[52px] min-w-0 flex-col items-start justify-center gap-0.5 rounded-xl px-2.5 py-1.5 text-left transition-colors',
              on ? 'bg-app-surface shadow-sm ring-1 ring-app-accent/40' : 'hover:bg-app-surface/50')}>
            <span className={cx('inline-flex min-w-0 max-w-full items-center gap-1.5 text-[13.5px] font-semibold leading-tight', on ? 'text-app-accent' : 'text-app-text')}>
              <m.Icon size={15} className="shrink-0" aria-hidden="true" /><span className="min-w-0 break-normal">{m.name}</span>
            </span>
            <span className="text-[11px] leading-tight text-app-muted">{m.sub}</span>
          </button>
        );
      })}
    </div>
  );
}
