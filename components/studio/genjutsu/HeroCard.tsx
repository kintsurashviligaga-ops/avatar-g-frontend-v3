'use client';

/**
 * HeroCard — the big rounded card at the top of the panel (Higgsfield's grammar: the chosen model / look, a „Change"
 * button at its corner). Here it shows the chosen EFFECT: its still (or, without one, its palette and icon), its name and
 * its one-line hint — so the user always sees what a press of Generate will make, with no prompt anywhere on screen.
 * The still is the tile's 3:4 picture cropped to the card's middle band, under a left-to-right scrim for the text.
 *
 * With nothing picked it is an invitation, not a form: a dashed card that says "Pick an effect — one tap, no prompt to
 * write" and whose button takes the user to the presets below.
 */
import Image from 'next/image';
import { Pencil, Sparkles } from 'lucide-react';
import { KIND_LABEL, type GenjutsuPreset } from '@/lib/genjutsu/presets';
import { toLang } from '@/lib/genjutsu/types';
import { copyFor } from './copy';
import { iconFor, presetThumb, tileBackground } from './presetVisual';

export function HeroCard({ locale, preset, onChange }: { locale: string; preset: GenjutsuPreset | null; onChange: () => void }) {
  const lang = toLang(locale);
  const c = copyFor(locale);
  const Icon = preset ? iconFor(preset) : Sparkles;
  const still = preset ? presetThumb(preset) : null;
  return (
    <div
      data-testid="vfx-hero"
      data-preset={preset?.id ?? ''}
      className={`relative min-h-[148px] overflow-hidden rounded-3xl p-4 ${preset ? 'ring-1 ring-app-border/10' : 'border border-dashed border-app-border/30 bg-app-elevated/40'}`}
      style={preset ? { backgroundImage: tileBackground(preset.palette) } : undefined}
    >
      {still ? (
        <>
          <Image
            key={still.src}
            src={still.src}
            alt=""
            fill
            sizes="(min-width: 1024px) 320px, 440px"
            {...(still.blurDataURL ? { placeholder: 'blur' as const, blurDataURL: still.blurDataURL } : {})}
            className="object-cover"
          />
          {/* The name and hint sit on the left: darken that side (and the foot) so they read on any still. */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/10" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/50 to-transparent" />
        </>
      ) : (
        <Icon
          aria-hidden="true"
          strokeWidth={1}
          className="pointer-events-none absolute -bottom-3 right-3 h-28 w-28"
          style={{ color: preset ? preset.palette[1] : 'rgb(var(--app-muted))', opacity: preset ? 0.3 : 0.18 }}
        />
      )}
      <div className="relative flex items-start justify-between gap-3">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${preset ? 'text-white/70' : 'text-app-muted'}`}>
          {preset ? `${c.heroEyebrow} · ${KIND_LABEL[preset.kind][lang]}` : c.heroEyebrow}
        </span>
        <button
          type="button"
          onClick={onChange}
          className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent ${preset ? 'bg-black/35 text-white ring-white/20 hover:bg-black/50' : 'bg-app-elevated text-app-text ring-app-border/20 hover:text-app-accent'}`}
        >
          <Pencil size={14} aria-hidden="true" />
          {c.change}
        </button>
      </div>
      <div className="relative mt-5 pr-24">
        <p className={`text-[22px] font-bold leading-tight ${preset ? 'text-white' : 'text-app-text'}`}>{preset ? preset.label[lang] : c.heroEmptyTitle}</p>
        <p className={`mt-1 line-clamp-3 text-[12.5px] leading-snug ${preset ? 'text-white/75' : 'text-app-muted'}`}>{preset ? preset.hint[lang] : c.heroEmptyHint}</p>
      </div>
    </div>
  );
}
