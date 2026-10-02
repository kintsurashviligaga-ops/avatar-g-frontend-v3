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
import { BrainCircuit, ChevronDown, Gem, ImagePlus, Layers, Camera, X, type LucideIcon } from 'lucide-react';
import { CHIP_BASE, CHIP_OFF, CHIP_ON, NOTE_BASE, NOTE_TONE } from '@/components/studio/ui/tokens';
import { SHOOT_BRIEF_MAX } from '@/lib/studio/shootQuote';
import type { ShootPhotoRef } from './shootRuns';
import type { ShootCopy } from './copy';

// ─── Header ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function PanelHeader({ Icon, title, copy, onSwitch, onClose, testId }: {
  Icon: LucideIcon; title: string; copy: ShootCopy; onSwitch: () => void; onClose: () => void; testId: string;
}) {
  return (
    <header data-testid={`${testId}-header`} className="sticky top-0 z-20 -mx-1 flex min-h-[56px] items-center justify-between gap-2 bg-app-surface/95 px-1 pb-1 pt-0.5 backdrop-blur-sm">
      <button type="button" onClick={onSwitch} aria-haspopup="dialog" aria-label={`${title} — ${copy.switchTool}`} data-testid={`${testId}-switch`}
        className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-2xl pr-2 text-left transition-colors hover:bg-app-elevated/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-app-accent text-app-bg"><Icon size={20} aria-hidden="true" /></span>
        <span className="min-w-0 truncate text-[17px] font-semibold leading-tight tracking-tight text-app-text">{title}</span>
        <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-app-muted" />
      </button>
      <button type="button" onClick={onClose} aria-label={copy.close} title={copy.close} data-testid={`${testId}-close`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-app-elevated text-app-text transition-colors hover:bg-app-elevated/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
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
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      {photos.length === 0 ? (
        <button type="button" onClick={() => pick.current?.click()} data-testid={`${testId}-dropzone`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); take(e.dataTransfer.files); }}
          className={`flex min-h-[148px] w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 ${over ? 'border-app-accent bg-app-accent/10' : 'border-app-border/30 bg-app-elevated/30 hover:border-app-accent/40'}`}>
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
              className="flex aspect-square min-h-[44px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-app-border/30 bg-app-elevated/30 text-app-muted transition-colors hover:border-app-accent/40 hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
              <ImagePlus size={22} aria-hidden="true" />
              <span className="text-[12px] font-medium">{copy.addPhoto}</span>
            </button>
          )}
        </div>
      )}
      {!full && (
        <button type="button" onClick={() => cam.current?.click()}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-1 text-[13px] font-medium text-app-muted transition-colors hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 md:hidden">
          <Camera size={16} aria-hidden="true" /> {copy.takePhoto}
        </button>
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

export interface ChipSpec<V extends string | number> {
  id: string;
  label: string;
  icon: ReactNode;
  /** What the pill shows ("2K", "×2"). */
  value: string;
  options: readonly { value: V; label: string }[];
  current: V;
  onSelect: (v: V) => void;
}

/** A tiny rectangle in the ratio's own shape — the aspect chip's glyph. */
export function AspectGlyph({ ratio }: { ratio: string }) {
  const m = /^(\d+):(\d+)$/.exec(ratio);
  const w = m ? Number(m[1]) : 1;
  const h = m ? Number(m[2]) : 1;
  const k = 16 / Math.max(w, h);
  return <span aria-hidden="true" className="inline-block shrink-0 rounded-[3px] border-[1.5px] border-current" style={{ width: Math.max(8, Math.round(w * k)), height: Math.max(8, Math.round(h * k)) }} />;
}

export const QualityGlyph = () => <Gem size={16} aria-hidden="true" />;
export const CountGlyph = () => <Layers size={16} aria-hidden="true" />;

export function ChipBar({ chips, testId }: { chips: readonly ChipSpec<string | number>[]; testId: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const openChip = chips.find((c) => c.id === open) ?? null;
  const panelId = useId();
  return (
    <section data-testid={`${testId}-chips`} aria-label={chips.map((c) => c.label).join(' · ')}>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button key={c.id} type="button" aria-expanded={open === c.id} aria-controls={open === c.id ? panelId : undefined}
            aria-label={`${c.label}: ${c.value}`} data-testid={`${testId}-chip-${c.id}`}
            onClick={() => setOpen((cur) => (cur === c.id ? null : c.id))}
            className={`inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-4 text-[15px] font-medium tabular-nums ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 ${open === c.id ? 'bg-app-accent/15 text-app-accent ring-app-accent/40' : 'bg-app-elevated/80 text-app-text ring-app-border/10 hover:bg-app-elevated'}`}>
            {c.icon}
            <span>{c.value}</span>
          </button>
        ))}
      </div>
      {openChip && (
        <div id={panelId} role="radiogroup" aria-label={openChip.label} data-testid={`${testId}-options`} className="mt-2 flex flex-wrap gap-1.5 rounded-2xl bg-app-elevated/50 p-2">
          {openChip.options.map((o) => {
            const on = o.value === openChip.current;
            return (
              <button key={String(o.value)} type="button" role="radio" aria-checked={on} data-option={String(o.value)}
                onClick={() => { openChip.onSelect(o.value); setOpen(null); }}
                className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}>{o.label}</button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── A labelled single-choice row that scrolls inside itself (room type, camera settings) ─────────────────────────

export interface ScrollOption<V extends string> { value: V | null; label: string }

export function ChipScroller<V extends string>({ label, options, value, onChange, testId }: {
  label: string; options: readonly ScrollOption<V>[]; value: V | null; onChange: (v: V | null) => void; testId: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} data-testid={testId} className="min-w-0">
      <p aria-hidden="true" className="mb-1.5 text-[12.5px] font-semibold text-app-text">{label}</p>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
