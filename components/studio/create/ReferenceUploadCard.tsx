'use client';

/**
 * ReferenceUploadCard — Higgsfield's dashed "Choose images to upload (up to N)" card.
 *
 * Empty: a round image button, the title and the limit. Filled: the pictures as 72 px tiles, each with its own remove, and a
 * Replace action. `max` is the REAL number of references the tool's route takes (lib/studio/imageCreate IMAGE_MAX_REFERENCES —
 * ONE for the image tool); pictures beyond it are shown (so they can be removed) with a plain note that they are not used.
 *
 * ⚠️ THE FILE INPUT IS A SIBLING OF THE CLICKABLE LABEL, NEVER A CHILD (the trap controls.tsx `Dropzone` documents): a nested
 * input's programmatic click bubbles back into the label and iOS Safari cancels the picker. Files are snapshotted with
 * Array.from BEFORE the input is reset — `input.files` is a live FileList and `value = ''` empties it. Dropping a file on the
 * studio is already handled by its root drop zone (it lands in the same attachment tray this card reads), so no drop handler here.
 */
import { useId } from 'react';
import { ImagePlus, Image as ImageIcon, X } from 'lucide-react';

export interface UploadItem { src: string; name?: string }

export function ReferenceUploadCard({
  items, max, onFiles, onRemove, title, limitLabel, filledHint, replaceLabel, removeLabel, extraNote, disabled,
}: {
  items: readonly UploadItem[];
  max: number;
  onFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
  title: string;
  /** "(max 1)". */
  limitLabel: string;
  /** Shown under the tiles once something is picked. */
  filledHint: string;
  replaceLabel: string;
  removeLabel: string;
  /** "Only the first image is used." — shown when more than `max` pictures are attached. */
  extraNote: string;
  disabled?: boolean;
}) {
  const id = useId();
  const input = (
    <input
      id={id}
      type="file"
      accept="image/*"
      // One at a time when the route takes one: a multi-select would hand over pictures that are then ignored.
      multiple={max > 1}
      disabled={disabled}
      className="sr-only"
      data-testid="reference-input"
      onChange={(e) => {
        const picked = Array.from(e.target.files ?? []);
        e.currentTarget.value = '';
        if (picked.length) onFiles(picked.slice(0, Math.max(1, max)));
      }}
    />
  );

  if (items.length === 0) {
    return (
      <div>
        <label
          htmlFor={id}
          className={`flex min-h-[132px] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-app-border/25 bg-app-elevated/30 px-4 py-5 text-center transition-colors hover:border-app-accent/45 hover:bg-app-elevated/50 focus-within:border-app-accent/60 ${disabled ? 'pointer-events-none opacity-45' : ''}`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-app-elevated text-app-muted ring-1 ring-app-border/10">
            <ImageIcon size={20} aria-hidden="true" />
          </span>
          <span className="min-w-0 text-[15px] leading-snug text-app-text/90">
            {title} <span className="whitespace-nowrap text-app-muted">{limitLabel}</span>
          </span>
        </label>
        {input}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-dashed border-app-accent/40 bg-app-accent/[0.04] p-3">
      <div className="flex flex-wrap items-center gap-3">
        {items.map((it, i) => (
          <div key={`${i}-${it.src.slice(-24)}`} className={`relative ${i >= max ? 'opacity-45' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL the user just picked; nothing to optimise */}
            <img src={it.src} alt={it.name ?? ''} className="h-[72px] w-[72px] rounded-2xl object-cover ring-1 ring-app-border/15" />
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={removeLabel}
              title={removeLabel}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-app-surface text-app-muted shadow ring-1 ring-app-border/20 transition-colors hover:text-app-text before:absolute before:-inset-3 before:content-['']"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        ))}
        <label
          htmlFor={id}
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full bg-app-elevated px-4 text-[13.5px] font-semibold text-app-text ring-1 ring-app-border/10 transition-colors hover:bg-app-elevated/80"
        >
          <ImagePlus size={16} aria-hidden="true" /> {replaceLabel}
        </label>
      </div>
      <p className="mt-2.5 text-[12.5px] leading-snug text-app-muted">{filledHint}</p>
      {items.length > max && <p role="status" className="mt-1 text-[12.5px] font-medium leading-snug text-app-warning">{extraNote}</p>}
      {input}
    </div>
  );
}
