/**
 * The "MyAvatar.ge" wordmark as the brand sheet sets it (docs/brand/BRAND.md): Montserrat, "MyAvatar" in the
 * text colour (a white → ice-blue fade on dark), ".ge" in the rocket blue, and optionally the letter-spaced
 * "AI CREATIVE STUDIO" tagline underneath.
 *
 * It is typeset, not an image: the sheet specifies the face and the colours, and live text stays sharp at any
 * size. `mark` puts the rocket in front of the name — the TRANSPARENT cut-out (public/brand/rocket-mark.*, made by
 * design/brand/rocket/extract.py from the supplied raster, never redrawn), so rocket + name read as ONE lockup.
 * ⚠️ „ორი ლოგო": the old rocket was an opaque tile (its PNG has no alpha) beside the name, which read as a second
 * logo; the cut-out carries no box, and it sits inside the wordmark's own role="img", so a reader hears one name.
 *
 * `whitespace-nowrap` + `shrink-0` are load-bearing: the brief's known bug was the wordmark cut to "MyAvata"
 * on mobile — a flex child allowed to shrink and clip. It keeps its width; the row around it gives way.
 */
import React from 'react';

export type WordmarkSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<WordmarkSize, string> = {
  sm: 'text-[15px] sm:text-[16px]',
  md: 'text-[18px] md:text-[19px]',
  lg: 'text-[26px] md:text-[30px]',
  xl: 'text-[40px] md:text-[56px]',
};

export interface WordmarkProps {
  size?: WordmarkSize;
  /** Show "AI CREATIVE STUDIO" under the name. */
  tagline?: boolean;
  /**
   * 'theme' follows light/dark. 'onDark' is for surfaces that are dark whatever the theme (the film studio,
   * the public share page) — theme colours there would put dark text on a dark header in light mode.
   */
  tone?: 'theme' | 'onDark';
  /** The transparent rocket in front of the name (the navbar lockup, docs/DESIGN.md §13). */
  mark?: boolean;
  className?: string;
}

/** The rocket cut-out. 256 px covers a 1.6 em mark at 3× on any size the navbars use. */
export const ROCKET_MARK_SRC = '/brand/rocket-mark.webp';
export const ROCKET_MARK_FALLBACK_SRC = '/brand/rocket-mark.png';

const NAME: Record<NonNullable<WordmarkProps['tone']>, string> = {
  theme: 'text-[color:var(--color-text)] dark:bg-gradient-to-b dark:from-white dark:to-[#D6E8FB] dark:bg-clip-text dark:text-transparent',
  onDark: 'bg-gradient-to-b from-white to-[#D6E8FB] bg-clip-text text-transparent',
};
const DOT_GE: Record<NonNullable<WordmarkProps['tone']>, string> = {
  theme: 'text-app-accent',
  onDark: 'text-[#338FE8]',
};
const TAG: Record<NonNullable<WordmarkProps['tone']>, string> = {
  theme: 'text-app-muted',
  onDark: 'text-white/60',
};

export function Wordmark({ size = 'md', tagline = false, tone = 'theme', mark = false, className = '' }: WordmarkProps) {
  const name = (
    <span className="font-display font-bold tracking-[-0.02em]" aria-hidden="true">
      <span className={NAME[tone]}>MyAvatar</span>
      <span className={DOT_GE[tone]}>.ge</span>
    </span>
  );
  return (
    <span
      className={`inline-flex shrink-0 flex-col whitespace-nowrap leading-none ${SIZE[size]} ${className}`}
      aria-label="MyAvatar.ge"
      role="img"
    >
      {mark ? (
        <span className="inline-flex items-center gap-[0.38em]">
          <picture className="shrink-0" aria-hidden="true">
            <source srcSet={ROCKET_MARK_SRC} type="image/webp" />
            {/* eslint-disable-next-line @next/next/no-img-element -- a 20 KB static mark inside a span; next/image would add a wrapper and a loader for nothing */}
            <img src={ROCKET_MARK_FALLBACK_SRC} alt="" width={256} height={256} decoding="async" data-testid="rocket-mark"
              className="block h-[1.6em] w-[1.6em] select-none" draggable={false} />
          </picture>
          {name}
        </span>
      ) : name}
      {tagline ? (
        <span
          className={`mt-[0.45em] font-display text-[0.34em] font-medium uppercase tracking-[0.42em] ${TAG[tone]}`}
          aria-hidden="true"
        >
          AI Creative Studio
        </span>
      ) : null}
    </span>
  );
}

export default Wordmark;
