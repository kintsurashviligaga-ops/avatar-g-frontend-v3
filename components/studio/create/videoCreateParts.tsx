'use client';

/**
 * The small, named pieces of the video create screen (ref4: header → hero → tabs → references → prompt → model → tiles →
 * quality → Generate). Each is a plain, props-only view; VideoCreatePanel composes them and owns the state. They are
 * prefixed `Video…` on purpose: another tool builds its own create pieces in parallel, and the integrator unifies later.
 *
 * Grammar (the owner: "exactly according to these files"): rounded cards on the sheet, a dashed upload card, tiles with a
 * leading icon and a value, the price ON the button. Tokens only; every target is 44 px or more; every row wraps.
 */
import Image from 'next/image';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import {
  AtSign, ChevronDown, ChevronRight, Clock, Film, Gem, ImagePlus, Music2, Pencil, RectangleHorizontal, RectangleVertical, Square,
  Volume2, VolumeX, X,
} from 'lucide-react';
import { formatVideoDuration } from '@/lib/video/duration';
import { VIDEO_TIER_TITLE, referenceToken, tierPriceEffect, videoQuote } from '@/lib/video/createPanel';
import type { VideoMode, VideoQuality } from '@/lib/credits/videoPricing';
import type { OutputFormat } from '@/lib/veo/types';
import { VIDEO_COPY, vc } from './videoCreateCopy';

const cx = (...p: Array<string | false | null | undefined>) => p.filter(Boolean).join(' ');

/** Card surfaces. The sheet is `bg-app-surface`, the desktop column a tint of it: cards are one step lighter than both. */
export const CARD = 'rounded-3xl border border-app-border/10 bg-app-elevated';
const ROW_BTN = 'flex w-full min-h-[56px] items-center gap-3 rounded-2xl border border-app-border/10 bg-app-elevated px-4 py-2.5 text-left transition-colors hover:bg-app-elevated/70 active:scale-[0.995]';

export const modeName = (mode: VideoMode, locale: string): string => vc(mode === 'musicvideo' ? VIDEO_COPY.modeMusicVideo : VIDEO_COPY.modeDocumentary, locale);

export const tierName = (tier: VideoQuality, locale: string): string =>
  vc(tier === 'lite' ? VIDEO_COPY.tierLite : tier === 'fast' ? VIDEO_COPY.tierFast : VIDEO_COPY.tierStandard, locale);

/** "Veo 3.1 Fast" — the model's name as a row reads it. */
export const modelRowName = (tier: VideoQuality): string => (tier === 'standard' ? 'Veo 3.1' : tier === 'fast' ? 'Veo 3.1 Fast' : 'Veo 3.1 Lite');

/** Three little bars — one for Lite, two for Fast, three for the max-quality tier (the ▮▮ of the reference's model row). */
export function VideoTierBars({ tier }: { tier: VideoQuality }) {
  const n = tier === 'lite' ? 1 : tier === 'fast' ? 2 : 3;
  return (
    <span aria-hidden="true" className="inline-flex items-end gap-[2px]">
      {[0, 1, 2].map((i) => (
        <span key={i} className={cx('w-[3px] rounded-sm', i < n ? 'bg-app-accent' : 'bg-app-border/25')} style={{ height: 6 + i * 3 }} />
      ))}
    </span>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────────────────────────────────

export function VideoCreateHeader({ locale, title, onSwitchTool, onClose }: {
  locale: string;
  title: string;
  onSwitchTool: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pb-3">
      <button type="button" onClick={onSwitchTool} aria-haspopup="dialog" data-testid="video-tool-switch"
        aria-label={`${title} — ${vc(VIDEO_COPY.chooseTool, locale)}`}
        className="-ml-1 flex min-h-[44px] min-w-0 items-center gap-2 rounded-xl px-1 text-left transition-opacity hover:opacity-90">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-accent/15 text-app-accent"><Film size={19} aria-hidden="true" /></span>
        <span className="min-w-0 truncate font-display text-[19px] font-extrabold uppercase leading-none tracking-tight text-app-text">{title}</span>
        <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-app-muted" />
      </button>
      <button type="button" onClick={onClose} aria-label={vc(VIDEO_COPY.close, locale)} title={vc(VIDEO_COPY.close, locale)} data-testid="video-close"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-app-elevated text-app-text/85 transition-colors hover:bg-app-border/15">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The preview of the chosen engine/mode: a still of the look, or a gradient where no still exists (Lite, music videos). */
function heroPicture(tier: VideoQuality, mode: VideoMode): string | null {
  if (mode === 'musicvideo') return null;
  return tier === 'standard' ? '/templates/video/trailer.jpg' : tier === 'fast' ? '/templates/video/reel.jpg' : null;
}

export function VideoHero({ locale, tier, mode, format, seconds, onChange }: {
  locale: string;
  tier: VideoQuality;
  mode: VideoMode;
  format: OutputFormat;
  seconds: number;
  onChange: () => void;
}) {
  const pic = heroPicture(tier, mode);
  return (
    <div data-testid="video-hero" className="relative isolate overflow-hidden rounded-3xl bg-app-elevated" style={{ minHeight: 140 }}>
      {pic ? (
        <Image src={pic} alt="" fill sizes="(min-width: 1024px) 340px, 440px" className="-z-20 object-cover" />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 -z-20 bg-gradient-to-br from-app-accent-deep/55 via-app-elevated to-app-bg" />
      )}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/25 to-black/40" />
      <button type="button" onClick={onChange} data-testid="video-hero-change" aria-haspopup="dialog"
        className="absolute right-3 top-3 flex min-h-[44px] items-center gap-2 rounded-2xl border border-white/25 bg-black/35 px-3.5 text-[14px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/50">
        <Pencil size={16} aria-hidden="true" /> {vc(VIDEO_COPY.change, locale)}
      </button>
      <div className="flex min-h-[140px] flex-col items-center justify-center gap-1.5 px-4 pb-3 pt-12 text-center">
        <h2 data-testid="video-hero-title" className="font-display text-[28px] font-extrabold leading-none tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">{VIDEO_TIER_TITLE[tier]}</h2>
        <p className="text-[12.5px] font-medium text-white/80">{modeName(mode, locale)} · {format} · {formatVideoDuration(seconds, locale)}</p>
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────────────────────────────────

export type VideoTab = 'create' | 'extend';

export function VideoTabs({ locale, value, onChange }: { locale: string; value: VideoTab; onChange: (t: VideoTab) => void }) {
  const tabs: { id: VideoTab; label: string }[] = [
    { id: 'create', label: vc(VIDEO_COPY.create, locale) },
    { id: 'extend', label: vc(VIDEO_COPY.extend, locale) },
  ];
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
      onChange(next.id);
      // Roving focus: the newly selected tab takes the focus with it.
      requestAnimationFrame(() => document.getElementById(`video-tab-${next.id}`)?.focus());
    }
  };
  return (
    <div role="tablist" aria-label={vc(VIDEO_COPY.tabs, locale)} data-testid="video-tabs" className="grid grid-cols-2 gap-1 rounded-2xl bg-app-elevated p-1.5">
      {tabs.map((t, i) => {
        const on = value === t.id;
        return (
          <button key={t.id} id={`video-tab-${t.id}`} type="button" role="tab" aria-selected={on} aria-controls={`video-tabpanel-${t.id}`}
            tabIndex={on ? 0 : -1} onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}
            className={cx('min-h-[48px] min-w-0 rounded-xl px-2 text-[16px] font-semibold transition-colors', on ? 'bg-app-border/20 text-app-text' : 'text-app-muted hover:text-app-text')}>
            <span className="block truncate">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── References ────────────────────────────────────────────────────────────────────────────────────────────

/** A round icon button — the reference's overlapping circles. */
function CircleButton({ label, onClick, disabled, children, testId }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; testId?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} data-testid={testId}
      className="relative flex h-14 w-14 items-center justify-center rounded-full bg-app-border/15 text-app-text/80 ring-4 ring-app-surface transition-all hover:bg-app-border/25 hover:text-app-text active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
      {children}
    </button>
  );
}

export interface VideoRefsProps {
  locale: string;
  images: readonly string[];
  maxImages: number;
  onAddImage: () => void;
  onRemoveImage: (index: number) => void;
  audio: { name: string } | null;
  audioBusy: boolean;
  onAddAudio: () => void;
  onRemoveAudio: () => void;
  /** Disabled look + no actions — the Extend tab draws the same card locked. */
  locked?: boolean;
  title?: string;
  sub?: string;
}

export function VideoRefsCard({ locale, images, maxImages, onAddImage, onRemoveImage, audio, audioBusy, onAddAudio, onRemoveAudio, locked, title, sub }: VideoRefsProps) {
  const full = images.length >= maxImages;
  return (
    <div data-testid="video-references" aria-disabled={locked || undefined}
      className={cx('rounded-3xl border border-dashed border-app-border/30 bg-app-elevated/40 px-4 py-5 text-center', locked && 'opacity-55')}>
      <div className="mx-auto flex items-center justify-center -space-x-3">
        <CircleButton label={vc(VIDEO_COPY.addImage, locale)} onClick={onAddImage} disabled={locked || full} testId="video-add-image">
          <ImagePlus size={22} aria-hidden="true" />
        </CircleButton>
        <CircleButton label={vc(VIDEO_COPY.addAudio, locale)} onClick={onAddAudio} disabled={locked || audioBusy} testId="video-add-audio">
          <Music2 size={22} aria-hidden="true" />
        </CircleButton>
      </div>
      <p className="mt-3 text-[17px] font-medium leading-snug text-app-text/90">{title ?? vc(VIDEO_COPY.refsTitle, locale)}</p>
      <p className="mt-0.5 text-[14px] leading-snug text-app-muted">{sub ?? vc(VIDEO_COPY.refsSub, locale)}</p>
      {(images.length > 0 || audio) && (
        <ul className="mt-4 flex flex-wrap items-start justify-center gap-3" data-testid="video-reference-list">
          {images.map((src, i) => (
            <li key={`${i}-${src.slice(-12)}`} className="flex flex-col items-center gap-1">
              <span className="relative block h-14 w-14 rounded-xl ring-1 ring-app-border/20">
                {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL the user just picked */}
                <img src={src} alt={`${vc(VIDEO_COPY.imageAlt, locale)} ${i + 1}`} className="h-full w-full rounded-xl object-cover" />
                <button type="button" onClick={() => onRemoveImage(i)} aria-label={`${vc(VIDEO_COPY.remove, locale)} ${referenceToken(i)}`}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-app-surface text-app-muted shadow ring-1 ring-app-border/20 transition-colors hover:text-app-text before:absolute before:-inset-3 before:content-['']">
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
              <span className="text-[11px] font-medium tabular-nums text-app-muted">{referenceToken(i)}</span>
            </li>
          ))}
          {audio && (
            <li className="flex max-w-full flex-col items-center gap-1">
              <span className="relative flex min-h-[56px] max-w-[220px] items-center gap-2 rounded-xl bg-app-accent/10 px-3 ring-1 ring-app-accent/30">
                <Music2 size={16} aria-hidden="true" className="shrink-0 text-app-accent" />
                <span className="min-w-0 truncate text-[12.5px] font-medium text-app-text">{audio.name}</span>
                <button type="button" onClick={onRemoveAudio} aria-label={`${vc(VIDEO_COPY.remove, locale)} ${audio.name}`}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-app-surface text-app-muted shadow ring-1 ring-app-border/20 transition-colors hover:text-app-text before:absolute before:-inset-3 before:content-['']">
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
              <span className="max-w-[240px] text-[11px] leading-tight text-app-muted">{vc(VIDEO_COPY.audioMakesMusicVideo, locale)}</span>
            </li>
          )}
        </ul>
      )}
      {full && images.length > 0 && !locked && <p className="mt-3 text-[11.5px] leading-snug text-app-muted">{vc(VIDEO_COPY.refsFull, locale)}</p>}
    </div>
  );
}

// ── Prompt ────────────────────────────────────────────────────────────────────────────────────────────────

export function VideoPromptCard({
  locale, value, onChange, placeholder, textareaRef, images, onInsertToken, onAddImage, soundOn, soundLocked, onToggleSound, needed, disabled, testId = 'video-prompt',
}: {
  locale: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  textareaRef: RefObject<HTMLTextAreaElement>;
  /** The reference images, so "@ Elements" can list them by name. */
  images: readonly string[];
  onInsertToken: (token: string) => void;
  onAddImage: () => void;
  soundOn: boolean;
  /** The live connection cannot switch Veo's sound off (Gemini API) — the chip shows On, locked, and says why. */
  soundLocked: boolean;
  onToggleSound: () => void;
  /** The last tap on Generate found this box empty. */
  needed?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  // Closing is automatic once the references go away (nothing left to list).
  useEffect(() => { if (images.length === 0) setOpen(false); }, [images.length]);
  const chip = 'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-app-bg/55 px-3 text-[14px] font-medium text-app-text transition-colors hover:bg-app-bg/80 disabled:opacity-50 aria-pressed:ring-1 aria-pressed:ring-app-accent/40';
  return (
    <div data-testid={testId} className={cx(CARD, 'p-4', needed && 'ring-1 ring-app-warning/60')}>
      <label htmlFor={`${testId}-input`} className="block text-[15px] font-medium text-app-muted">{vc(VIDEO_COPY.prompt, locale)}</label>
      <textarea
        id={`${testId}-input`}
        ref={textareaRef}
        data-testid={`${testId}-input`}
        value={value}
        disabled={disabled}
        rows={4}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={needed || undefined}
        className="mt-1.5 block min-h-[104px] w-full resize-none border-0 bg-transparent p-0 text-[16px] leading-relaxed text-app-text outline-none placeholder:text-app-muted/70 focus:ring-0 disabled:opacity-60"
      />
      {needed && <p role="status" className="mt-1 text-[12.5px] font-medium text-app-warning">{vc(VIDEO_COPY.promptNeeded, locale)}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => (images.length ? setOpen((v) => !v) : onAddImage())} aria-expanded={images.length ? open : undefined} disabled={disabled}
          data-testid="video-elements" className={chip}>
          <AtSign size={16} aria-hidden="true" /> {vc(VIDEO_COPY.elements, locale)}
        </button>
        <button type="button" onClick={onToggleSound} aria-pressed={soundOn} disabled={disabled || soundLocked} data-testid="video-sound"
          aria-label={`${vc(VIDEO_COPY.sound, locale)}: ${vc(soundOn ? VIDEO_COPY.on : VIDEO_COPY.off, locale)}`}
          title={soundLocked ? vc(VIDEO_COPY.soundLocked, locale) : undefined} className={chip}>
          {soundOn ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
          {vc(soundOn ? VIDEO_COPY.on : VIDEO_COPY.off, locale)}
        </button>
      </div>
      {open && images.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" data-testid="video-elements-list">
          {images.map((src, i) => (
            <li key={`${i}-${src.slice(-12)}`}>
              <button type="button" onClick={() => { onInsertToken(referenceToken(i)); setOpen(false); }}
                className="flex min-h-[44px] items-center gap-2 rounded-xl bg-app-bg/55 py-1 pl-1 pr-3 text-[13px] font-medium text-app-text ring-1 ring-app-border/15 transition-colors hover:ring-app-accent/50">
                {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL the user just picked */}
                <img src={src} alt="" className="h-9 w-9 rounded-lg object-cover" />
                {referenceToken(i)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Model row, tiles, quality ─────────────────────────────────────────────────────────────────────────────

export function VideoModelRow({ locale, tier, mode, onOpen }: { locale: string; tier: VideoQuality; mode: VideoMode; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" data-testid="video-model-row" className={ROW_BTN}>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] text-app-muted">{vc(VIDEO_COPY.model, locale)}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[17px] font-medium text-app-text">
          <span className="min-w-0 truncate">{modelRowName(tier)}</span>
          <VideoTierBars tier={tier} />
          <span className="min-w-0 truncate text-[13px] font-normal text-app-muted">· {modeName(mode, locale)}</span>
        </span>
      </span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-app-muted" />
    </button>
  );
}

function VideoTile({ label, value, icon, onClick, testId }: { label: string; value: string; icon: ReactNode; onClick: () => void; testId: string }) {
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={`${label}: ${value}`} data-testid={testId}
      className="flex min-h-[56px] min-w-0 items-center justify-center gap-1.5 rounded-2xl border border-app-border/10 bg-app-elevated px-1 text-[15px] font-medium tabular-nums text-app-text transition-colors hover:bg-app-elevated/70 active:scale-[0.98] min-[400px]:gap-2 min-[400px]:px-2 min-[400px]:text-[16px]">
      <span aria-hidden="true" className="shrink-0 text-app-text/85">{icon}</span>
      <span className="min-w-0 truncate">{value}</span>
    </button>
  );
}

export function VideoTiles({ locale, seconds, format, resolution, onLength, onFormat, onResolution }: {
  locale: string;
  seconds: number;
  format: OutputFormat;
  resolution: string;
  onLength: () => void;
  onFormat: () => void;
  onResolution: () => void;
}) {
  const AspectIcon = format === '16:9' ? RectangleHorizontal : format === '1:1' ? Square : RectangleVertical;
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="video-tiles">
      <VideoTile testId="video-tile-length" label={vc(VIDEO_COPY.length, locale)} value={formatVideoDuration(seconds, locale)} icon={<Clock size={18} />} onClick={onLength} />
      <VideoTile testId="video-tile-format" label={vc(VIDEO_COPY.format, locale)} value={format} icon={<AspectIcon size={18} />} onClick={onFormat} />
      <VideoTile testId="video-tile-resolution" label={vc(VIDEO_COPY.resolution, locale)} value={resolution} icon={<Gem size={18} />} onClick={onResolution} />
    </div>
  );
}

/** Lite · Fast · Max quality, each with what it does to the price at THIS length and mode. */
export function VideoQualityRow({ locale, tier, mode, seconds, onTier }: {
  locale: string;
  tier: VideoQuality;
  mode: VideoMode;
  seconds: number;
  onTier: (t: VideoQuality) => void;
}) {
  const order: VideoQuality[] = ['lite', 'fast', 'standard'];
  return (
    <div role="radiogroup" aria-label={vc(VIDEO_COPY.quality, locale)} data-testid="video-quality" className={cx(CARD, 'p-3')}>
      <p className="px-1 pb-2 text-[13.5px] text-app-muted">{vc(VIDEO_COPY.quality, locale)}</p>
      <div className="grid grid-cols-3 gap-2">
        {order.map((t) => {
          const on = t === tier;
          const eff = tierPriceEffect(t);
          const effLabel = t === 'fast' ? vc(VIDEO_COPY.tierDefaultNote, locale) : eff.deltaPct < 0 ? `−${Math.abs(eff.deltaPct)}%` : `×${eff.multiplier}`;
          return (
            <button key={t} type="button" role="radio" aria-checked={on} onClick={() => onTier(t)} data-testid={`video-quality-${t}`}
              className={cx('flex min-h-[72px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-2 text-center transition-colors',
                on ? 'border-app-accent/60 bg-app-accent/15 text-app-accent' : 'border-app-border/15 bg-app-bg/40 text-app-text hover:bg-app-bg/60')}>
              <span className="w-full break-words text-[13px] font-semibold leading-tight">{tierName(t, locale)}</span>
              <span className="text-[14px] font-bold tabular-nums">✦ {videoQuote({ seconds, tier: t, mode })}</span>
              <span className={cx('text-[11px] leading-none', on ? 'text-app-accent/80' : 'text-app-muted')}>{effLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Disclosure ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A closed-by-default group for what the cinema tab always had and the create screen keeps one tap away. Its children are
 * mounted only while it is open (a gallery of pictures should not load behind a closed door); `openWhen` opens it once and
 * never closes it, so something the user already loaded (a script, a track) is never hidden behind it.
 */
export function VideoDisclosure({ id, title, summary, openWhen, children }: { id: string; title: string; summary?: string; openWhen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (openWhen) setOpen(true); }, [openWhen]);
  return (
    <section data-testid={`video-disclosure-${id}`} className="min-w-0 rounded-2xl border border-app-border/10 bg-app-elevated/60">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={`video-disclosure-body-${id}`}
        className="flex min-h-[52px] w-full items-center gap-2 rounded-2xl px-4 py-2 text-left transition-colors hover:bg-app-elevated">
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-app-text">{title}</span>
        {!open && summary ? <span className="min-w-0 max-w-[45%] shrink truncate text-[12.5px] text-app-muted">{summary}</span> : null}
        <ChevronDown size={17} aria-hidden="true" className={cx('shrink-0 text-app-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div id={`video-disclosure-body-${id}`} className="space-y-2 border-t border-app-border/10 p-3">{children}</div>}
    </section>
  );
}

// ── The Generate bar ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Sticky to the bottom of whatever scrolls the panel (the phone sheet, the desktop column), over a fade in that surface's
 * own colour so nothing shows through behind the button.
 */
export function VideoGenerateBar({ surface, children }: { surface: 'sheet' | 'panel'; children: ReactNode }) {
  return (
    <div data-testid="video-generate-bar"
      // ⚠️ `sticky bottom-0` sticks INSIDE the scroller's padding (the sheet's pb-3, the column's py-4), so content scrolled
      // behind that gap showed under the button. The shadow is a solid skirt of the surface's own colour that fills it.
      className={cx('sticky bottom-0 z-10 -mx-1 px-1 pt-3', surface === 'sheet'
        ? 'bg-gradient-to-t from-app-surface via-app-surface/95 to-transparent shadow-[0_16px_0_0_rgb(var(--app-surface))]'
        : 'bg-gradient-to-t from-app-bg via-app-bg/95 to-transparent shadow-[0_16px_0_0_rgb(var(--app-bg))]')}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
      {children}
    </div>
  );
}

