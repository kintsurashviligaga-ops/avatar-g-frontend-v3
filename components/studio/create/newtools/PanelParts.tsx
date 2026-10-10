'use client';

/**
 * The pieces both creation panels are made of, in the order the owner's reference (Higgsfield „CREATE IMAGE", docs/DESIGN.md
 * §8) lays them out: a header with the tool's name and a chevron to switch tools and a ✕ · a dashed upload card · (the
 * panel's own choices) · a prompt card whose last row is the model · a chip row · the Generate pill with its price.
 *
 * Presentation only — nothing here knows a route, a price or a template. Every control is ≥ 44 px, every row wraps or
 * scrolls inside itself (nothing pushes the page sideways at 375 px), every colour is a design token.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BrainCircuit, Check, ChevronDown, Gem, ImagePlus, Layers, X, type LucideIcon } from 'lucide-react';
import { BottomSheet } from '@/components/studio/ui/BottomSheet';
import { CHIP_BASE, CHIP_OFF, CHIP_ON, NOTE_BASE, NOTE_TONE } from '@/components/studio/ui/tokens';
import { SHOOT_BRIEF_MAX } from '@/lib/studio/shootQuote';
import type { ShootPhotoRef } from './shootRuns';
import type { ShootCopy } from './copy';

// ─── Header ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function PanelHeader({ Icon, title, copy, onSwitch, onClose, testId }: {
  Icon: LucideIcon; title: string; copy: ShootCopy; onSwitch: () => void; onClose: () => void; testId: string;
}) {
  return (
    // ⚠️ `sticky top-0` sticks INSIDE the scroller's top padding (the column's py-4), so the form scrolled up showed in that
    // strip above the header. The shadow is a solid skirt of the surface's own colour that fills it (the footer's twin).
    <header data-testid={`${testId}-header`} className="sticky top-0 z-20 -mx-1 flex min-h-[60px] items-center justify-between gap-2 bg-app-surface px-1 pb-1 pt-0.5 shadow-[0_-16px_0_0_rgb(var(--app-surface))] lg:bg-app-bg lg:shadow-[0_-16px_0_0_rgb(var(--app-bg))]">
      <button type="button" onClick={onSwitch} aria-haspopup="dialog" aria-label={`${title} — ${copy.switchTool}`} data-testid={`${testId}-switch`}
        className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-2xl pr-2 text-left transition-colors hover:bg-app-elevated/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-app-accent/15 text-app-accent lg:h-9 lg:w-9"><Icon size={21} aria-hidden="true" /></span>
        {/* break-normal: a name wraps between words, never inside one („Photograph / er" in the 300 px column). */}
        <span className="line-clamp-2 min-w-0 break-normal text-[20px] font-semibold leading-tight tracking-tight text-app-text lg:text-[17px] xl:text-[18px]">{title}</span>
        <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-app-muted" />
      </button>
      <button type="button" onClick={onClose} aria-label={copy.close} title={copy.close} data-testid={`${testId}-close`}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-app-elevated text-app-text transition-colors hover:bg-app-elevated/70 lg:h-10 lg:w-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
        <X size={18} aria-hidden="true" />
      </button>
    </header>
  );
}

// ─── The dashed upload card ───────────────────────────────────────────────────────────────────────────────────────

/** The „+" sheet's Photos / Camera tiles reach the panel through this window event (OmniStudio.attachTargets). */
export const SHOOT_PICK_EVENT = 'omni:shoot-pick';

export function UploadCard({ photos, max, title, limit, note, notice, copy, onFiles, onRemove, testId }: {
  photos: readonly ShootPhotoRef[]; max: number; title: string; limit: string; note: string; notice: string | null;
  copy: ShootCopy; onFiles: (files: File[]) => void; onRemove: (id: string) => void; testId: string;
}) {
  const pick = useRef<HTMLInputElement | null>(null);
  const cam = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const noteId = useId();

  useEffect(() => {
    const on = (e: Event) => {
      const kind = (e as CustomEvent<unknown>).detail;
      (kind === 'camera' ? cam : pick).current?.click();
    };
    window.addEventListener(SHOOT_PICK_EVENT, on);
    return () => window.removeEventListener(SHOOT_PICK_EVENT, on);
  }, []);

  const take = (list: FileList | null) => { const files = Array.from(list ?? []); if (files.length) onFiles(files); };
  const full = photos.length >= max;

  return (
    <section data-testid={`${testId}-upload`} aria-describedby={noteId} className="space-y-2">
      <input ref={pick} type="file" accept="image/*" multiple className="hidden" data-testid={`${testId}-file`}
        onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      {/* The „+" sheet's Camera tile opens this one (the OS picker of the first input already offers „Take photo" on a phone). */}
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      {photos.length === 0 ? (
        <button type="button" onClick={() => pick.current?.click()} data-testid={`${testId}-dropzone`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); take(e.dataTransfer.files); }}
          className={`flex min-h-[148px] w-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 ${over ? 'border-app-accent bg-app-accent/10' : 'border-app-border/40 bg-app-elevated/20 hover:border-app-accent/50'}`}>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-app-elevated text-app-text ring-1 ring-app-border/15"><ImagePlus size={24} aria-hidden="true" /></span>
          <span className="text-[15px] leading-snug text-app-text/85">{title} <span className="text-app-muted">{limit}</span></span>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2" data-testid={`${testId}-photos`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); take(e.dataTransfer.files); }}>
          {photos.map((p, i) => (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-2xl bg-app-elevated ring-1 ring-app-border/15" data-testid={`${testId}-photo`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL or a signed result, not an optimizable asset */}
              <img src={p.src} alt={copy.photoN(i + 1)} className="h-full w-full object-cover" draggable={false} />
              <button type="button" onClick={() => onRemove(p.id)} aria-label={`${copy.removePhoto} ${i + 1}`} title={copy.removePhoto}
                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center focus-visible:outline-none">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20"><X size={14} aria-hidden="true" /></span>
              </button>
            </div>
          ))}
          {!full && (
            <button type="button" onClick={() => pick.current?.click()} aria-label={copy.addPhoto} data-testid={`${testId}-add`}
              className="flex aspect-square min-h-[44px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-app-border/40 bg-app-elevated/30 text-app-muted transition-colors hover:border-app-accent/40 hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
              <ImagePlus size={22} aria-hidden="true" />
              <span className="text-[12px] font-medium">{copy.addPhoto}</span>
            </button>
          )}
        </div>
      )}
      {notice && <p role="status" className={`${NOTE_BASE} ${NOTE_TONE.warn}`}>{notice}</p>}
      <p id={noteId} className="text-[12px] leading-snug text-app-muted">{note}</p>
    </section>
  );
}

// ─── The prompt card ─────────────────────────────────────────────────────────────────────────────────────────────

export function PromptCard({ value, onChange, placeholder, copy, testId }: {
  value: string; onChange: (v: string) => void; placeholder: string; copy: ShootCopy; testId: string;
}) {
  const id = useId();
  return (
    <section data-testid={`${testId}-prompt`} className="overflow-hidden rounded-3xl bg-app-elevated/70 ring-1 ring-app-border/10 focus-within:ring-app-accent/40">
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      {/* The global input rule paints a border, a background and a focus glow on every textarea — the card owns all three. */}
      <textarea id={id} value={value} onChange={(e) => onChange(e.target.value.slice(0, SHOOT_BRIEF_MAX))} rows={4} placeholder={placeholder}
        maxLength={SHOOT_BRIEF_MAX} data-testid={`${testId}-brief`}
        className="block min-h-[132px] w-full resize-none !rounded-none !border-0 !bg-transparent px-5 pb-2 pt-4 leading-snug !text-app-text !shadow-none outline-none placeholder:text-app-muted/60 focus:!shadow-none" />
      <div className="flex min-h-[52px] items-center justify-between gap-3 border-t border-app-border/10 px-5 text-[14px]">
        <span className="inline-flex items-center gap-2 text-app-muted"><BrainCircuit size={16} aria-hidden="true" />{copy.modelLabel}</span>
        <span className="font-medium text-app-text">{copy.modelValue}</span>
      </div>
    </section>
  );
}

// ─── The chip row: aspect · quality · count ──────────────────────────────────────────────────────────────────────
// Each pill opens a bottom sheet with its options (the grammar of the owner's reference: a chip is a summary, the sheet is the
// choice) — a grid for shapes, a list for tiers and counts, the price on every row that has one.

export interface ChipOption<V extends string | number> {
  value: V;
  label: string;
  /** A second line (a price, a speed). */
  sub?: string;
  /** A picture for the option (an aspect's shape). */
  glyph?: ReactNode;
}

export interface ChipSpec<V extends string | number> {
  id: string;
  /** The sheet's title and the pill's accessible name. */
  label: string;
  icon: ReactNode;
  /** What the pill shows ("2K", "×2"). */
  value: string;
  layout: 'grid' | 'list';
  options: readonly ChipOption<V>[];
  current: V;
  onSelect: (v: V) => void;
}

/** A tiny rectangle in the ratio's own shape — the aspect chip's glyph (`box` = the longest side in px). */
export function AspectGlyph({ ratio, box = 16 }: { ratio: string; box?: number }) {
  const m = /^(\d+):(\d+)$/.exec(ratio);
  const w = m ? Number(m[1]) : 1;
  const h = m ? Number(m[2]) : 1;
  const k = box / Math.max(w, h);
  return <span aria-hidden="true" className="inline-block shrink-0 rounded-[3px] border-[1.5px] border-current" style={{ width: Math.max(8, Math.round(w * k)), height: Math.max(8, Math.round(h * k)) }} />;
}

export const QualityGlyph = () => <Gem size={16} aria-hidden="true" />;
export const CountGlyph = () => <Layers size={16} aria-hidden="true" />;

const OPTION_ON = 'bg-app-accent/15 text-app-accent ring-app-accent/50';
const OPTION_OFF = 'bg-app-elevated/70 text-app-text ring-app-border/10 hover:bg-app-elevated';

export function ChipBar({ chips, closeLabel, testId }: { chips: readonly ChipSpec<string | number>[]; closeLabel: string; testId: string }) {
  const [open, setOpen] = useState<string | null>(null);
  // Smaller in the 300 px desktop column, so the three (shape · quality · count) sit on ONE row and the sticky footer
  // leaves the form room; the phone sheet keeps the 52 px thumb targets.
  return (
    <section data-testid={`${testId}-chips`} aria-label={chips.map((c) => c.label).join(' · ')}>
      <div className="flex flex-wrap gap-2 lg:gap-1.5">
        {chips.map((c) => (
          <button key={c.id} type="button" aria-haspopup="dialog" aria-expanded={open === c.id}
            aria-label={`${c.label}: ${c.value}`} data-testid={`${testId}-chip-${c.id}`}
            onClick={() => setOpen(c.id)}
            className="inline-flex min-h-[52px] items-center gap-2.5 rounded-full bg-app-elevated/80 px-5 text-[16px] font-medium tabular-nums lg:min-h-[44px] lg:gap-2 lg:px-3.5 lg:text-[15px] text-app-text ring-1 ring-app-border/10 transition-colors hover:bg-app-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
            {c.icon}
            <span>{c.value}</span>
          </button>
        ))}
      </div>
      {chips.map((c) => (
        <BottomSheet key={c.id} open={open === c.id} onClose={() => setOpen(null)} title={c.label} closeLabel={closeLabel} testId={`${testId}-sheet-${c.id}`}>
          <div role="radiogroup" aria-label={c.label} data-testid={`${testId}-options-${c.id}`}
            className={c.layout === 'grid' ? 'grid grid-cols-5 gap-2 pb-2' : 'space-y-2 pb-2'}>
            {c.options.map((o) => {
              const on = o.value === c.current;
              const look = on ? OPTION_ON : OPTION_OFF;
              return (
                <button key={String(o.value)} type="button" role="radio" aria-checked={on} data-option={String(o.value)}
                  onClick={() => { c.onSelect(o.value); setOpen(null); }}
                  className={c.layout === 'grid'
                    ? `flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-2xl px-1 text-[13px] font-medium tabular-nums ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 ${look}`
                    : `flex min-h-[60px] w-full items-center gap-3 rounded-2xl px-4 text-left ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 ${look}`}>
                  {c.layout === 'grid' ? (
                    <>
                      {o.glyph}
                      <span>{o.label}</span>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-medium leading-tight">{o.label}</span>
                        {o.sub && <span className={`mt-0.5 block text-[12.5px] leading-snug ${on ? 'text-app-accent/80' : 'text-app-muted'}`}>{o.sub}</span>}
                      </span>
                      {on && <Check size={18} aria-hidden="true" className="shrink-0" />}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </BottomSheet>
      ))}
    </section>
  );
}

// ─── A labelled single-choice row (room type, camera settings) ──────────────────────────────────────────────────
// ⚠️ IT WRAPS. It was a row that scrolled sideways with its scrollbar hidden, and in the 300 px column every row ended in a
// chip cut in half („Stu", „Low ar") — the owner read it as the panel spilling out of its frame (2026-10-09 18:28Z).

export interface ScrollOption<V extends string> { value: V | null; label: string }

export function ChipScroller<V extends string>({ label, options, value, onChange, testId }: {
  label: string; options: readonly ScrollOption<V>[]; value: V | null; onChange: (v: V | null) => void; testId: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} data-testid={testId} className="min-w-0">
      <p aria-hidden="true" className="mb-1.5 text-[12.5px] font-semibold text-app-text">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button key={String(o.value)} type="button" role="radio" aria-checked={on} data-option={String(o.value)}
              onClick={() => onChange(o.value)} className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}>{o.label}</button>
          );
        })}
      </div>
    </div>
  );
}

/** A small quiet caption under a group. */
export const Hint = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <p data-testid={testId} className="text-[12px] leading-snug text-app-muted">{children}</p>
);
