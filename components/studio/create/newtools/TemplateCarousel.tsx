'use client';

/**
 * TemplateCarousel — the Interior designer's styles and the Photographer's shoot presets as a row of picture cards you
 * swipe sideways (the owner's „template carousel with thumbnails"; the studio's other galleries are 2-column grids,
 * components/studio/ui/TemplateGallery.tsx, whose card grammar this keeps: 3:4, the label on a scrim, the palette as the
 * tile until the picture exists).
 *
 * ⚠️ A CARD IS A RADIO THAT CAN BE LET GO. The image cards are tuples of the panel's own values and are lit by them; a style
 * or a shoot preset names a LOOK and writes no value, so the pick is plain selected state — and tapping the picked card
 * again lets it go, because „no style" (a tasteful redesign of the photo) is a real choice, not an error.
 *
 * What the picked card adds is one line UNDER the carousel („Adds: …", lib/studio/templates.interior `interiorAddsLine`):
 * the card itself is narrow, a Georgian disclosure clipped to „ამატებს: ღია მ…" would disclose nothing. It is also in each
 * card's description for assistive tech.
 *
 * Pictures go through templateThumb (lib/studio/templateThumbs): a shipped file is next/image with its real blur and a
 * content-versioned URL; no file → the palette tile, in the SAME 3:4 box, so nothing shifts when the art arrives.
 */
import Image from 'next/image';
import { useRef } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { templateThumb } from '@/lib/studio/templateThumbs';

export interface CarouselItem {
  id: string;
  label: string;
  /** The card's one line of what it is — its description for assistive tech and its tooltip. */
  hint: string;
  /** The „Adds: …" line, already localised. */
  adds: string;
  thumb: string | null;
  palette: readonly [string, string];
  /** A short facts line on the card ("4:5"). */
  meta?: string;
}

/** The rendered card width, for next/image's `sizes` (see TemplateGallery.TEMPLATE_CARD_SIZES for the arithmetic). */
export const CAROUSEL_CARD_SIZES = '(min-width: 1280px) 124px, (min-width: 1024px) 112px, 124px';

/** `#RRGGBB` → `rgba(r, g, b, a)` (an 8-digit hex is dropped by some parsers, jsdom among them). */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? `rgba(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)}, ${alpha})` : 'transparent';
}

export function TemplateCarousel({ label, items, activeId, onPick, Icon, addsLine, emptyLine, testId }: {
  label: string;
  items: readonly CarouselItem[];
  activeId: string | null;
  /** `null` = the picked card was let go. */
  onPick: (id: string | null) => void;
  /** Faint on a no-picture tile, so it never reads as a broken image. */
  Icon: LucideIcon;
  addsLine: string | null;
  emptyLine: string;
  testId: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const checkedAt = items.findIndex((i) => i.id === activeId);
  const tabAt = checkedAt >= 0 ? checkedAt : 0;
  const move = (from: number, dir: 1 | -1) => {
    const i = (from + dir + items.length) % items.length;
    refs.current[i]?.focus();
    refs.current[i]?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  };
  return (
    <section data-testid={testId} className="min-w-0">
      <p aria-hidden="true" className="mb-2 text-[12.5px] font-semibold text-app-text">{label}</p>
      <div role="radiogroup" aria-label={label}
        className="-mx-1 flex snap-x snap-proximity gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((t, i) => {
          const on = t.id === activeId;
          const pic = templateThumb(t.thumb);
          return (
            <button key={t.id} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on}
              aria-label={t.label} aria-description={`${t.hint}. ${t.adds}`} title={`${t.hint}. ${t.adds}`}
              data-template={t.id} tabIndex={i === tabAt ? 0 : -1}
              onClick={() => onPick(on ? null : t.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
              }}
              className={`group relative aspect-[3/4] w-[118px] shrink-0 snap-start overflow-hidden rounded-2xl text-left outline-none ring-1 transition-shadow focus-visible:ring-2 focus-visible:ring-app-accent lg:w-[112px] xl:w-[124px] ${on ? 'ring-2 ring-app-accent shadow-[0_0_0_4px_rgb(var(--app-accent)/0.15)]' : 'ring-app-border/10 hover:ring-app-border/25'}`}
              style={{ backgroundImage: `radial-gradient(120% 90% at 85% 10%, ${withAlpha(t.palette[1], 0.33)} 0%, transparent 55%), linear-gradient(160deg, ${t.palette[0]} 0%, #000 100%)` }}>
              {pic?.kind === 'static' ? (
                <Image src={pic.src} alt="" fill sizes={CAROUSEL_CARD_SIZES} draggable={false}
                  {...(pic.blurDataURL ? { placeholder: 'blur' as const, blurDataURL: pic.blurDataURL } : {})}
                  style={{ objectFit: 'cover' }}
                  className="transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
              ) : (
                <Icon aria-hidden="true" strokeWidth={1.25} className="absolute right-2.5 top-2.5 h-8 w-8" style={{ color: t.palette[1], opacity: 0.55 }} />
              )}
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-2.5">
                <span className="block text-[13px] font-semibold leading-tight text-white [overflow-wrap:anywhere]">{t.label}</span>
                {t.meta && <span className="mt-0.5 block truncate text-[11px] leading-tight text-white/70">{t.meta}</span>}
              </span>
              {on && (
                <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-app-accent text-app-bg shadow-md" aria-hidden="true">
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p data-testid={`${testId}-adds`} aria-live="polite" className="text-[12.5px] leading-snug text-app-muted">
        {addsLine ?? emptyLine}
      </p>
    </section>
  );
}
