/**
 * The "MyAvatar.ge" wordmark as the brand sheet sets it (docs/brand/BRAND.md): Montserrat, "MyAvatar" in the
 * text colour (a white → ice-blue fade on dark), ".ge" in the brand cyan, and optionally the letter-spaced
 * "AI CREATIVE STUDIO" tagline underneath.
 *
 * It is typeset, not an image: the sheet specifies the face and the colours, and live text stays sharp at any
 * size. The rocket beside it is always the supplied raster (brief §9: the logo is never redrawn).
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
  className?: string;
}

const NAME: Record<NonNullable<WordmarkProps['tone']>, string> = {
  theme: 'text-[color:var(--color-text)] dark:bg-gradient-to-b dark:from-white dark:to-[#CFF6FF] dark:bg-clip-text dark:text-transparent',
  onDark: 'bg-gradient-to-b from-white to-[#CFF6FF] bg-clip-text text-transparent',
};
const DOT_GE: Record<NonNullable<WordmarkProps['tone']>, string> = {
  theme: 'text-app-accent',
  onDark: 'text-[#00E5FF]',
};
const TAG: Record<NonNullable<WordmarkProps['tone']>, string> = {
  theme: 'text-app-muted',
  onDark: 'text-white/60',
};

export function Wordmark({ size = 'md', tagline = false, tone = 'theme', className = '' }: WordmarkProps) {
  return (
    <span
      className={`inline-flex shrink-0 flex-col whitespace-nowrap leading-none ${SIZE[size]} ${className}`}
      aria-label="MyAvatar.ge"
      role="img"
    >
      <span className="font-display font-bold tracking-[-0.02em]" aria-hidden="true">
        <span className={NAME[tone]}>MyAvatar</span>
        <span className={DOT_GE[tone]}>.ge</span>
      </span>
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
