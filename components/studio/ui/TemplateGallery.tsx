'use client';

/**
 * TemplateGallery — a grid of picture cards, one per starting point (lib/studio/templates.ts). It replaces the
 * panels' text preset rows: "Cinematic Reel", "Anime", "R&B Beat", "Corporate Presenter" are things people recognise
 * by sight, not by reading a dial.
 *
 * ⚠️ A CARD IS A RADIO, NOT A MODE. `activeId` is computed by the caller from the LIVE values (match*Template), so a
 * card stops being selected the moment the user edits a field it set; picking the selected card again is a no-op (it
 * never "un-picks" the panel's values, which would surprise someone who only meant to look). The panel's own
 * controls stay below to fine-tune.
 *
 * ⚠️ A CARD THAT ADDS CONTEXT SAYS SO ON ITS FACE (owner decision 2026-10-01 A-a). A video, image or music card's
 * request carries its id, and the server adds that card's context (lib/studio/templateContext). The card shows what
 * that context does as an „Adds: …" line (`adds`), so nothing a template sends is invisible to the user.
 *
 * Layout: TWO columns. The gallery lives in the settings panel (~320 px) and the phone's sheet — both narrow whatever
 * the viewport — and a viewport breakpoint gave the panel three ~100 px cards whose Georgian labels truncated to one
 * word ("კინო რ…"). Every card is 3:4 with its label on a scrim, so mixed thumbnails and no-image tiles
 * (the template's palette as a gradient) line up as one grid. Motion is opacity/transform only and stops under
 * prefers-reduced-motion.
 *
 * Pictures (lib/studio/templateThumbs): a shipped thumbnail goes through next/image — `fill` inside the card's own 3:4
 * box, so the picture never takes part in layout — sized by TEMPLATE_CARD_SIZES, with its real ≤ 16 px blur and a
 * content-versioned URL. The palette is painted under EVERY card, so a picture still loading (or failing) shows the
 * tile, never a hole. ⚠️ A REMOTE thumb (the „My twin" signed URL) stays a plain <img>: see templateThumbs.ts.
 */
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { templateThumb } from '@/lib/studio/templateThumbs';

/**
 * The rendered width of one card, for next/image's `sizes` (two columns, gap-2). The gallery only ever lives in the
 * settings: the right panel from `lg` (300 px, 340 px from `xl`, px-4 → 130 / 150 px cards at most), the sheet below it
 * (440 px max from `sm`, px-3 → ≤ 205 px; full width on a phone → ≤ 50vw − 16 px). Each is the widest of the panels'
 * two layouts (the image and video galleries sit in an extra p-3.5 box, so theirs are a little narrower).
 * ⚠️ `calc(50vw …)`, not a bare `50vw`: next/image drops every srcset width under 0.5 × 640 = 320 px for a bare 50vw,
 * which would force a 384 px file onto a 130 px desktop card.
 */
export const TEMPLATE_CARD_SIZES = '(min-width: 1280px) 150px, (min-width: 1024px) 130px, (min-width: 640px) 205px, calc(50vw - 16px)';
/** Two columns: the first row is on screen whenever a gallery mounts (each sits at the top of its panel). */
const FIRST_ROW = 2;

export interface TemplateCardItem {
  id: string;
  label: string;
  hint: string;
  /** A public 3:4 image, or null → the palette tile. */
  thumb: string | null;
  palette: readonly [string, string];
  /** Shown faint on the no-image tile, so it never reads as a broken picture. */
  Icon?: LucideIcon;
  /** A short facts line on the card ("9:16 · 24წმ"). */
  meta?: string;
  /**
   * The one-line disclosure of what the card adds beyond the visible controls — „Adds: Georgian polyphonic choir"
   * (lib/studio/templates `templateAddsLine`, already localised). Absent for a card that adds nothing (a presenter).
   * Shown on the card under the facts line and read out with its description, so the context a template sends is
   * never hidden.
   */
  adds?: string;
}

/** `#RRGGBB` → `rgba(r, g, b, a)`. (An 8-digit hex is valid CSS, but some parsers — jsdom among them — drop the whole
 *  declaration over it, and the tile would silently lose its colour.) */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 'transparent';
  return `rgba(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)}, ${alpha})`;
}

export function TemplateGallery({
  label, items, activeId, onPick, testId,
}: {
  label: ReactNode;
  items: readonly TemplateCardItem[];
  activeId: string | null;
  onPick: (id: string) => void;
  testId?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="min-w-0" data-testid={testId}>
      <p className="mb-2 text-[12.5px] font-semibold text-app-text">{label}</p>
      <div role="radiogroup" aria-label={typeof label === 'string' ? label : undefined}
        className="grid grid-cols-2 gap-2">
        {items.map((t, i) => {
          const on = activeId === t.id;
          const Icon = t.Icon;
          const description = t.adds ? `${t.hint}. ${t.adds}` : t.hint;
          const pic = templateThumb(t.thumb);
          // The gallery never renders on the first paint (it mounts when a tool's settings open), but when it does its
          // first row IS the top of the panel — the one place `priority` (eager + fetchpriority=high) earns its keep.
          const firstRow = i < FIRST_ROW;
          return (
            <motion.button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={t.label}
              aria-description={description}
              title={description}
              data-template={t.id}
              onClick={() => { if (!on) onPick(t.id); }}
              whileHover={reduce ? undefined : { y: -2 }}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className={`group relative aspect-[3/4] min-h-[132px] w-full overflow-hidden rounded-2xl text-left outline-none ring-1 transition-shadow focus-visible:ring-2 focus-visible:ring-app-accent ${on ? 'ring-2 ring-app-accent shadow-[0_0_0_4px_rgb(var(--app-accent)/0.15)]' : 'ring-app-border/10 hover:ring-app-border/25'}`}
              style={{ backgroundImage: `radial-gradient(120% 90% at 85% 10%, ${withAlpha(t.palette[1], 0.33)} 0%, transparent 55%), linear-gradient(160deg, ${t.palette[0]} 0%, #000 100%)` }}
            >
              {pic?.kind === 'static' ? (
                // objectFit in `style`, not only the class: next/image reads it to crop the blur the way the picture is.
                <Image src={pic.src} alt="" fill sizes={TEMPLATE_CARD_SIZES} priority={firstRow} draggable={false}
                  {...(pic.blurDataURL ? { placeholder: 'blur' as const, blurDataURL: pic.blurDataURL } : {})}
                  style={{ objectFit: 'cover' }}
                  className="transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
              ) : pic?.kind === 'remote' ? (
                // eslint-disable-next-line @next/next/no-img-element -- a private, expiring URL must not be cached by the optimizer (templateThumbs.ts)
                <img src={pic.src} alt="" loading={firstRow ? 'eager' : 'lazy'} decoding="async" draggable={false}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
              ) : (
                Icon && <Icon aria-hidden="true" strokeWidth={1.25} className="absolute right-3 top-3 h-9 w-9" style={{ color: t.palette[1], opacity: 0.55 }} />
              )}
              {/* The scrim keeps the label readable on any picture (≥ 4.5:1 over its lower third). */}
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-2.5">
                <span className="block truncate text-[13px] font-semibold leading-tight text-white">{t.label}</span>
                {t.meta && <span className="mt-0.5 block truncate text-[11px] leading-tight text-white/70">{t.meta}</span>}
                {/* Two lines at most, not one: a Georgian disclosure truncated to "ამატებს: ქართ…" would disclose nothing. */}
                {t.adds && <span data-template-adds="" className="mt-0.5 line-clamp-2 text-[10.5px] leading-tight text-white/80">{t.adds}</span>}
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

export default TemplateGallery;
