'use client';

/**
 * ReferenceDropzone — up to 40 reference photos (Character · Product · Wardrobe) that keep the people and the product
 * identical in the generated video, with the policy for what the ENGINE really receives printed where the user can see
 * it BEFORE paying: "Using 3 of 12 — Google Veo 3.1 takes up to 3".
 *
 *   · a dashed drop card (the picker input is a SIBLING of its label — a nested input's `.click()` bubbles back into the
 *     label and iOS Safari cancels the picker; components/studio/ui/controls.Dropzone documents the trap);
 *   · a thumbnail grid — each tile wears its role as a chip and a check when the engine will use it; tapping a tile
 *     selects it;
 *   · ONE toolbar for the selected photo (role · earlier · later · remove), 44 px controls — per-tile controls on a 78 px
 *     thumbnail would be 30 px targets, and 40 photos of them would be unusable on a phone;
 *   · the count "12 / 40", a "remove all", and the rule that picks the photos, one tap away.
 *
 * Presentation only: the state (and the 1280 px downscale, the type and size checks, the lazy upload) is
 * useReferencePhotos; the choice of photos is lib/genjutsu/selection — the SAME pure function the server re-applies.
 */
import { ArrowLeft, ArrowRight, Check, ImagePlus, Package, Shirt, Trash2, User, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { REFERENCE_ROLES, type ReferenceRole } from '@/lib/genjutsu/types';
import { CHIP_BASE, CHIP_OFF, CHIP_ON, ICON_BTN } from '@/components/studio/ui/tokens';
import { copyFor } from './copy';
import type { RefPhoto, SkippedPhoto } from './useReferencePhotos';

const ROLE_ICON: Record<ReferenceRole, LucideIcon> = { character: User, product: Package, wardrobe: Shirt };

export interface ReferenceDropzoneProps {
  locale: string;
  photos: readonly RefPhoto[];
  pending: number;
  max: number;
  /** Ids the engine will receive — from selectReferences, so the tile's check IS the policy. */
  usedIds: ReadonlySet<string>;
  /** How many photos the engine takes, and its name — for the policy line. */
  cap: number;
  engineLabel: string;
  skipped: readonly SkippedPhoto[];
  overflow: number;
  /** Motion needs a character photo — shown as a warning until there is one. */
  needsCharacter?: boolean;
  disabled?: boolean;
  onAdd: (files: File[]) => void;
  onRole: (id: string, role: ReferenceRole) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function ReferenceDropzone({
  locale, photos, pending, max, usedIds, cap, engineLabel, skipped, overflow, needsCharacter, disabled,
  onAdd, onRole, onMove, onRemove, onClear,
}: ReferenceDropzoneProps) {
  const c = copyFor(locale);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = photos.find((p) => p.id === selectedId) ?? null;
  const selectedIndex = selected ? photos.indexOf(selected) : -1;
  const full = photos.length + pending >= max;
  const inputId = 'vfx-refs-input';

  const notes: string[] = [
    ...skipped.map((s) => (s.reason === 'type' ? c.fileSkipped.type(s.name) : s.reason === 'size' ? c.fileSkipped.size(s.name) : s.reason === 'small' ? c.fileSkipped.small(s.name) : c.fileSkipped.unreadable(s.name))),
    ...(overflow > 0 ? [c.refsFull(overflow, max)] : []),
  ];

  return (
    <section aria-label={c.refsTitle} data-testid="vfx-refs" className="min-w-0 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12.5px] font-semibold text-app-text">{c.refsTitle}</h3>
        <div className="flex items-center gap-1">
          <span data-testid="vfx-refs-count" className="rounded-full bg-app-elevated px-2.5 py-1 text-[12px] font-medium tabular-nums text-app-muted ring-1 ring-app-border/10">
            {c.refsCount(photos.length, max)}
          </span>
          {photos.length > 1 && (
            <button type="button" onClick={() => { setSelectedId(null); onClear(); }} className="inline-flex min-h-[44px] items-center px-2 text-[12px] font-medium text-app-muted underline-offset-2 hover:text-app-text hover:underline">
              {c.refsClear}
            </button>
          )}
        </div>
      </div>

      {/* The drop card. Disabled (not hidden) at the cap, so the count and the reason stay in view. */}
      <label
        htmlFor={inputId}
        data-testid="vfx-refs-drop"
        className={`flex min-h-[108px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-app-border/30 bg-app-elevated/30 p-3 text-center transition-colors hover:bg-app-elevated/60 focus-within:border-app-accent/60 ${full || disabled ? 'pointer-events-none opacity-50' : ''}`}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = Array.from(e.dataTransfer.files ?? []);
          if (dropped.length) onAdd(dropped);
        }}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-app-accent/15 text-app-accent">
          <ImagePlus size={18} aria-hidden="true" />
        </span>
        <span className="text-[13px] font-semibold text-app-text">{c.refsTitle}</span>
        <span className="text-[11.5px] leading-snug text-app-muted">{c.refsHint}</span>
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        disabled={full || disabled}
        className="sr-only"
        data-testid="vfx-refs-input"
        onChange={(e) => {
          // Array.from BEFORE the reset: input.files is a LIVE FileList and clearing `value` empties it.
          const picked = Array.from(e.target.files ?? []);
          e.currentTarget.value = '';
          if (picked.length) onAdd(picked);
        }}
      />

      {(photos.length > 0 || pending > 0) && (
        <ul className="grid grid-cols-4 gap-1.5" aria-label={c.refsTitle}>
          {photos.map((p, i) => {
            const used = usedIds.has(p.id);
            const on = p.id === selectedId;
            const Role = ROLE_ICON[p.role];
            return (
              <li key={p.id} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${p.name} — ${c.role[p.role]} — ${used ? c.inUse : c.notUsed}`}
                  data-testid={`vfx-ref-${i}`}
                  data-role={p.role}
                  data-used={used ? 'true' : 'false'}
                  onClick={() => setSelectedId(on ? null : p.id)}
                  className={`relative block aspect-square w-full overflow-hidden rounded-xl bg-app-elevated outline-none ring-1 transition focus-visible:ring-2 focus-visible:ring-app-accent ${on ? 'ring-2 ring-app-accent' : used ? 'ring-app-accent/45' : 'ring-app-border/15'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: URL of the user's own photo */}
                  <img src={p.thumb} alt="" draggable={false} className={`h-full w-full object-cover transition-opacity ${used ? '' : 'opacity-55'}`} />
                  <span className="absolute inset-x-1 bottom-1 flex max-w-full items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9.5px] font-medium leading-tight text-white">
                    <Role size={9} aria-hidden="true" className="shrink-0" />
                    <span className="truncate">{c.role[p.role]}</span>
                  </span>
                  {used && (
                    <span aria-hidden="true" className="absolute right-1 top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-app-accent text-app-bg shadow">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {Array.from({ length: Math.min(pending, 8) }, (_, i) => (
            <li key={`pending-${i}`} aria-hidden="true" className="aspect-square animate-pulse rounded-xl bg-app-elevated/70 ring-1 ring-app-border/10" />
          ))}
        </ul>
      )}

      {/* ONE toolbar for the selected photo. */}
      {selected && (
        <div role="group" aria-label={selected.name} data-testid="vfx-ref-toolbar" className="space-y-2 rounded-2xl bg-app-elevated/40 p-2.5 ring-1 ring-app-border/10">
          <div role="radiogroup" aria-label={c.roleLabel} className="flex flex-wrap gap-1.5">
            {REFERENCE_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={selected.role === r}
                data-role-choice={r}
                onClick={() => onRole(selected.id, r)}
                className={`${CHIP_BASE} ${selected.role === r ? CHIP_ON : CHIP_OFF}`}
              >
                {c.role[r]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label={c.earlier} title={c.earlier} disabled={selectedIndex <= 0} onClick={() => onMove(selected.id, -1)} className={ICON_BTN}>
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <button type="button" aria-label={c.later} title={c.later} disabled={selectedIndex >= photos.length - 1} onClick={() => onMove(selected.id, 1)} className={ICON_BTN}>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            <button type="button" aria-label={c.remove} title={c.remove} onClick={() => { onRemove(selected.id); setSelectedId(null); }} className={`${ICON_BTN} ml-auto hover:!border-app-danger/60 hover:!text-app-danger`}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* The honest line: how many the engine really receives. Announced when it changes. */}
      <p data-testid="vfx-refs-policy" aria-live="polite" className="rounded-xl bg-app-accent/10 px-3 py-2 text-[12px] leading-snug text-app-text ring-1 ring-app-accent/15">
        {photos.length > 0 ? c.using(Math.min(usedIds.size, cap), photos.length, cap, engineLabel) : c.usingNone(cap, engineLabel)}
      </p>
      <details className="group rounded-xl text-[11.5px] leading-snug text-app-muted">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center font-medium underline-offset-2 hover:text-app-text group-open:text-app-text [&::-webkit-details-marker]:hidden">{c.ruleTitle}</summary>
        <p className="pb-2">{c.rule}</p>
      </details>

      {needsCharacter && (
        <p role="status" className="rounded-lg bg-amber-400/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-amber-300/90 ring-1 ring-amber-400/20">{c.needCharacter}</p>
      )}
      {notes.length > 0 && (
        <ul role="status" data-testid="vfx-refs-notes" className="space-y-0.5 rounded-lg bg-app-elevated/50 px-2.5 py-1.5 text-[11px] leading-snug text-app-muted ring-1 ring-app-border/10">
          {notes.slice(0, 4).map((n, i) => <li key={i} className="break-words">{n}</li>)}
          {notes.length > 4 && <li>{c.refsSkipped(skipped.length + overflow)}</li>}
        </ul>
      )}
    </section>
  );
}
