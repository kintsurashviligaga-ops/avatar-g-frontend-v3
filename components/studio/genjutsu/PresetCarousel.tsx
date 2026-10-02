'use client';

/**
 * PresetCarousel — the "Presets" panel: ONE tap picks a ready VFX effect, no prompt to write.
 *
 * A snap-scrolling rail of tiles on a phone (the thumb flicks through them; the next tile peeks in so the rail reads as
 * scrollable), a two-column grid on a desktop (the right settings column is ~300 px — a viewport breakpoint would give
 * three unreadable tiles, so the break is `lg`, exactly where the panel becomes a column). A row of kind chips filters
 * the 24 effects (Motion · Object · Place · Style · VFX).
 *
 * ⚠️ A TILE IS A RADIO, NOT A MODE. Exactly one is selected, picking the selected one again is a no-op, and the whole
 * group is ONE tab stop (roving tabindex) with the arrow keys moving the choice — the same pattern as Segmented, so a
 * keyboard user reaches Generate in a few Tab presses, not 24.
 *
 * Tiles are 128×168 px (≥ 44 px on both axes); chips are honestly 44 px tall (CHIP_BASE). Colours come from the preset's
 * own palette — the tile is the effect's thumbnail — and the label sits on a scrim so it stays readable on any of them.
 */
import { Check } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { GENJUTSU_PRESETS, KIND_LABEL, PRESET_KINDS, type GenjutsuPreset, type PresetKind } from '@/lib/genjutsu/presets';
import { toLang } from '@/lib/genjutsu/types';
import { CHIP_BASE, CHIP_OFF, CHIP_ON } from '@/components/studio/ui/tokens';
import { copyFor } from './copy';
import { iconFor, tileBackground } from './presetVisual';

export interface PresetCarouselProps {
  locale: string;
  activeId: string | null;
  onPick: (id: string) => void;
  /** Overridable for tests; defaults to the shipped list. */
  presets?: readonly GenjutsuPreset[];
}

export function PresetCarousel({ locale, activeId, onPick, presets = GENJUTSU_PRESETS }: PresetCarouselProps) {
  const lang = toLang(locale);
  const c = copyFor(locale);
  const reduce = useReducedMotion();
  const [kind, setKind] = useState<'all' | PresetKind>('all');
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const railRef = useRef<HTMLDivElement | null>(null);

  const shown = useMemo(() => (kind === 'all' ? presets : presets.filter((p) => p.kind === kind)), [presets, kind]);
  const checked = shown.findIndex((p) => p.id === activeId);
  const tabAt = checked >= 0 ? checked : 0;

  // A pick made elsewhere (the hero's "Change", a restored session) brings its tile into view inside the rail.
  useEffect(() => {
    const i = shown.findIndex((p) => p.id === activeId);
    refs.current[i]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [activeId, shown, reduce]);

  const step = (from: number, dir: 1 | -1) => {
    const n = shown.length;
    if (n === 0) return;
    const i = (from + dir + n) % n;
    refs.current[i]?.focus();
    onPick(shown[i]!.id);
  };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(i, 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(i, -1); }
    else if (e.key === 'Home') { e.preventDefault(); refs.current[0]?.focus(); onPick(shown[0]!.id); }
    else if (e.key === 'End') { e.preventDefault(); refs.current[shown.length - 1]?.focus(); onPick(shown[shown.length - 1]!.id); }
  };

  return (
    <div className="min-w-0" data-testid="vfx-presets">
      <p className="mb-2 text-[12.5px] font-semibold text-app-text">{c.effects}</p>

      {/* Kind filter. Wraps rather than scrolls — a hidden chip is a hidden category. */}
      <div role="group" aria-label={c.effects} className="mb-2.5 flex flex-wrap gap-1.5">
        {(['all', ...PRESET_KINDS] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            data-kind={k}
            onClick={() => setKind(k)}
            className={`${CHIP_BASE} ${kind === k ? CHIP_ON : CHIP_OFF}`}
          >
            {k === 'all' ? c.all : KIND_LABEL[k][lang]}
          </button>
        ))}
      </div>

      <div
        ref={railRef}
        role="radiogroup"
        aria-label={c.pickEffect}
        className="-mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain scroll-px-3 px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:grid lg:max-h-[21rem] lg:snap-none lg:grid-cols-2 lg:overflow-y-auto lg:overflow-x-hidden lg:px-0 lg:[scrollbar-width:thin]"
      >
        {shown.map((p, i) => {
          const on = p.id === activeId;
          const Icon = iconFor(p);
          return (
            <motion.button
              key={p.id}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={p.label[lang]}
              aria-description={p.hint[lang]}
              title={p.hint[lang]}
              tabIndex={i === tabAt ? 0 : -1}
              data-preset={p.id}
              onClick={() => { if (!on) onPick(p.id); }}
              onKeyDown={(e) => onKeyDown(e, i)}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className={`group relative h-[168px] w-[128px] shrink-0 snap-start overflow-hidden rounded-2xl text-left outline-none ring-1 transition-shadow focus-visible:ring-2 focus-visible:ring-app-accent lg:h-auto lg:w-auto lg:aspect-[4/3] ${on ? 'ring-2 ring-app-accent shadow-[0_0_0_4px_rgb(var(--app-accent)/0.15)]' : 'ring-app-border/10 hover:ring-app-border/25'}`}
              style={{ backgroundImage: tileBackground(p.palette) }}
            >
              <Icon aria-hidden="true" strokeWidth={1.25} className="absolute right-2.5 top-2.5 h-9 w-9" style={{ color: p.palette[1], opacity: 0.6 }} />
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-2.5">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/60">{KIND_LABEL[p.kind][lang]}</span>
                <span className="mt-0.5 line-clamp-2 block text-[13px] font-semibold leading-tight text-white">{p.label[lang]}</span>
              </span>
              {on && (
                <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-app-accent text-app-bg shadow-md" aria-hidden="true">
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
