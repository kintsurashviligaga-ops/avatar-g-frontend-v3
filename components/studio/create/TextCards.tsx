'use client';

/**
 * The Create screen's text cards (ref2): LYRICS — a collapsible header with the round wand button, the textarea, and a
 * bottom row [library] [✓ Instrumental] [camera] … [expand]; STYLES — the same card with a description and, under it, a
 * horizontally scrolling chip row with [library] at its left and [expand] at its right; and the single SIMPLE card.
 *
 * These are views. The words live in OmniStudio's own states (the lyrics box; the composer's text, which `send()` reads
 * as the song's description), the chips are `musicStyles`, and every real action — the wands, the saved lists, the
 * full-screen editor — is a callback. Locked controls (the camera) are `aria-disabled` and have no handler at all.
 */
import { Camera, Check, Library, Maximize2, Wand2 } from 'lucide-react';
import { MAX_STYLES, toggleStyle } from '@/lib/ai/musicControls';
import { musicCreateCopy } from './musicCreateCopy';
import { PanelCard, PillButton, RoundButton, cx } from './primitives';

/** Say what a wand (or a save) did, in words, under the card it belongs to — never silently. */
export type CardNote = { tone: 'info' | 'warn'; text: string; action?: { label: string; onClick: () => void } } | null;

function NoteLine({ note, testId }: { note: CardNote; testId: string }) {
  if (!note) return null;
  return (
    <p
      data-testid={testId}
      role={note.tone === 'warn' ? 'alert' : 'status'}
      className={cx('mt-2 flex flex-wrap items-center gap-x-2 rounded-xl px-3 py-2 text-[12.5px] leading-snug', note.tone === 'warn' ? 'bg-app-warning/10 text-app-warning' : 'bg-app-accent/10 text-app-accent')}
    >
      <span className="min-w-0">{note.text}</span>
      {note.action && (
        <button type="button" onClick={note.action.onClick} className="min-h-[44px] rounded-full px-2 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
          {note.action.label}
        </button>
      )}
    </p>
  );
}

/** A borderless textarea that lives inside a card. The card carries the focus ring (`focus-within`). */
export function CardTextarea({
  value, onChange, placeholder, label, maxLength, rows, testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  maxLength?: number;
  rows: number;
  testId: string;
}) {
  return (
    <textarea
      data-testid={testId}
      aria-label={label}
      value={value}
      rows={rows}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="block w-full resize-none rounded-none border-0 bg-transparent px-0 py-1.5 text-[16px] leading-relaxed text-app-text outline-none placeholder:text-app-muted/55 focus:shadow-none focus:ring-0"
    />
  );
}

export function InstrumentalPill({ locale, on, onToggle }: { locale: string; on: boolean; onToggle: () => void }) {
  const cc = musicCreateCopy(locale);
  return (
    <PillButton
      testId="music-instrumental"
      pressed={on}
      onClick={onToggle}
      icon={
        <span aria-hidden="true" className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors', on ? 'bg-app-accent text-app-bg' : 'bg-app-border/20 text-transparent')}>
          <Check size={12} strokeWidth={3} />
        </span>
      }
    >
      {cc.instrumental}
    </PillButton>
  );
}

/** The 19 genre chips as one scrolling row; picks append in order, the last one cannot go, three is the cap. */
export function StyleChipStrip({
  locale, options, value, onChange,
}: {
  locale: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const cc = musicCreateCopy(locale);
  const full = value.length >= MAX_STYLES;
  return (
    <div
      role="group"
      aria-label={cc.styles}
      data-testid="music-style-chips"
      className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-0.5 [mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((o) => {
        const on = value.includes(o.id);
        const blocked = !on && full;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            disabled={blocked}
            title={blocked ? cc.stylesFull : undefined}
            onClick={() => {
              const next = toggleStyle(value, o.id, MAX_STYLES);
              if (next !== value) onChange(next);
            }}
            className={cx(
              'inline-flex h-11 shrink-0 touch-manipulation items-center rounded-full px-4 text-[14px] font-medium ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:pointer-events-none disabled:opacity-40',
              on ? 'bg-app-accent/15 text-app-accent ring-app-accent/40' : 'bg-app-bg/50 text-app-text/85 ring-app-border/15 hover:text-app-text',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export interface LyricsCardProps {
  locale: string;
  open: boolean;
  onToggle: () => void;
  value: string;
  onChange: (v: string) => void;
  instrumental: boolean;
  onInstrumental: () => void;
  /** A melody reference is attached: the track will be an instrumental, so these words are not used. */
  coverMode: boolean;
  wandBusy: boolean;
  onWand: () => void;
  onLibrary: () => void;
  onExpand: () => void;
  note: CardNote;
}

export function LyricsCard(p: LyricsCardProps) {
  const cc = musicCreateCopy(p.locale);
  return (
    <PanelCard
      testId="music-lyrics"
      title={cc.lyrics}
      open={p.open}
      onToggle={p.onToggle}
      action={
        <RoundButton
          tone="solid" testId="music-lyrics-wand" icon={<Wand2 size={18} aria-hidden="true" />} label={cc.lyricsWand}
          busy={p.wandBusy} onClick={p.onWand} disabled={p.instrumental || p.coverMode}
        />
      }
    >
      <CardTextarea
        testId="music-lyrics-input"
        label={cc.lyrics}
        value={p.value}
        onChange={p.onChange}
        maxLength={1200}
        rows={4}
        placeholder={p.instrumental ? cc.lyricsPlaceholderInstrumental : cc.lyricsPlaceholder}
      />
      {p.coverMode && <p data-testid="music-lyrics-cover-note" className="text-[11.5px] leading-snug text-app-muted">{cc.lyricsCoverNote}</p>}
      <NoteLine note={p.note} testId="music-lyrics-note" />
      {/* One row on a phone (ref2). In the 300–340 px settings column of a desktop the four do not fit, so the row WRAPS and
          the expand button — `ml-auto`, wherever it lands — stays at the right edge, instead of being clipped by it. */}
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
        <RoundButton testId="music-lyrics-library" icon={<Library size={18} aria-hidden="true" />} label={cc.lyricsLibrary} onClick={p.onLibrary} haspopup="dialog" />
        <InstrumentalPill locale={p.locale} on={p.instrumental} onToggle={p.onInstrumental} />
        <RoundButton testId="music-camera" icon={<Camera size={18} aria-hidden="true" />} label={cc.camera} locked lockedNote={cc.cameraSoon} />
        <RoundButton className="ml-auto" testId="music-lyrics-expand" icon={<Maximize2 size={17} aria-hidden="true" />} label={cc.expand} onClick={p.onExpand} haspopup="dialog" />
      </div>
    </PanelCard>
  );
}

export interface StylesCardProps {
  locale: string;
  open: boolean;
  onToggle: () => void;
  value: string;
  onChange: (v: string) => void;
  chips: string[];
  onChips: (next: string[]) => void;
  chipOptions: ReadonlyArray<{ id: string; label: string }>;
  wandBusy: boolean;
  onWand: () => void;
  onLibrary: () => void;
  onExpand: () => void;
  note: CardNote;
}

export function StylesCard(p: StylesCardProps) {
  const cc = musicCreateCopy(p.locale);
  return (
    <PanelCard
      testId="music-styles-card"
      title={cc.styles}
      titleExtra={`${p.chips.length}/${MAX_STYLES}`}
      open={p.open}
      onToggle={p.onToggle}
      action={<RoundButton tone="solid" testId="music-styles-wand" icon={<Wand2 size={18} aria-hidden="true" />} label={cc.stylesWand} busy={p.wandBusy} onClick={p.onWand} />}
    >
      <CardTextarea
        testId="music-styles-input"
        label={cc.styles}
        value={p.value}
        onChange={p.onChange}
        maxLength={600}
        rows={3}
        placeholder={cc.stylesPlaceholder}
      />
      <NoteLine note={p.note} testId="music-styles-note" />
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <RoundButton testId="music-styles-library" icon={<Library size={18} aria-hidden="true" />} label={cc.stylesLibrary} onClick={p.onLibrary} haspopup="dialog" />
        <StyleChipStrip locale={p.locale} options={p.chipOptions} value={p.chips} onChange={p.onChips} />
        <RoundButton testId="music-styles-expand" icon={<Maximize2 size={17} aria-hidden="true" />} label={cc.expand} onClick={p.onExpand} haspopup="dialog" />
      </div>
    </PanelCard>
  );
}

/** Simple mode: ONE card — the description, the track type and the style row — and nothing else. */
export function SimpleCard(p: {
  locale: string;
  value: string;
  onChange: (v: string) => void;
  instrumental: boolean;
  onInstrumental: () => void;
  chips: string[];
  onChips: (next: string[]) => void;
  chipOptions: ReadonlyArray<{ id: string; label: string }>;
  wandBusy: boolean;
  onWand: () => void;
  note: CardNote;
  /** Lyrics typed in Advanced still ride along; say so rather than send hidden words. */
  keptLyrics: number;
}) {
  const cc = musicCreateCopy(p.locale);
  return (
    <PanelCard
      testId="music-simple"
      title={cc.simpleCard}
      titleExtra={`${p.chips.length}/${MAX_STYLES}`}
      action={<RoundButton tone="solid" testId="music-simple-wand" icon={<Wand2 size={18} aria-hidden="true" />} label={cc.stylesWand} busy={p.wandBusy} onClick={p.onWand} />}
    >
      <CardTextarea testId="music-simple-input" label={cc.simpleCard} value={p.value} onChange={p.onChange} maxLength={600} rows={4} placeholder={cc.simplePlaceholder} />
      <NoteLine note={p.note} testId="music-simple-note" />
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
        <InstrumentalPill locale={p.locale} on={p.instrumental} onToggle={p.onInstrumental} />
      </div>
      <div className="mt-2 flex min-w-0 items-center">
        <StyleChipStrip locale={p.locale} options={p.chipOptions} value={p.chips} onChange={p.onChips} />
      </div>
      {p.keptLyrics > 0 && !p.instrumental && (
        <p data-testid="music-simple-lyrics-note" className="mt-2 text-[11.5px] leading-snug text-app-muted">{cc.lyricsKept(p.keptLyrics)}</p>
      )}
    </PanelCard>
  );
}
