'use client';

/**
 * What the two creation panels share beyond their pieces (PanelParts): the FOOTER — the chip row (aspect · count, each a
 * pill that opens its options in a sheet, the count's rows priced) and the Generate pill with its price on it, pinned to the
 * bottom of the settings like the owner's reference (chips directly above the full-width accent pill) — and the quality
 * chip, which is technical and sits in the panel's Advanced settings (GG 2026-10-18).
 *
 * One module, so the two panels cannot drift apart on the one control that spends credits. Every number is `credits`
 * (shootCredits — the image route's own function) or a count-row price built from the same function.
 */
import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { GenerateButton } from '@/components/studio/ui/GenerateButton';
import { creditsLabel } from '@/lib/credits/quote';
import {
  SHOOT_ASPECTS, SHOOT_COUNTS, SHOOT_QUALITIES, nearestAspect, shootCredits, shootTiles,
  type ShootAspect, type ShootCount, type ShootQuality,
} from '@/lib/studio/shootQuote';
import { AspectGlyph, ChipBar, CountGlyph, Hint, QualityGlyph, type ChipSpec } from './PanelParts';
import type { ShootCopy } from './copy';
import type { AspectChoice } from './useShootStudio';

type ShootChipId = 'aspect' | 'quality' | 'count';

function ShootChips({ ids, aspect, quality, count, photos, copy, locale, onAspect, onQuality, onCount, testId }: {
  /** Which chips this row shows, in this order. */
  ids: readonly ShootChipId[];
  aspect: AspectChoice; quality: ShootQuality; count: ShootCount;
  /** The first photo decides what „Auto" is; their number prices the count rows. */
  photos: readonly { w: number; h: number }[];
  copy: ShootCopy; locale: string;
  /** Each chip's change; a chip this row does not show needs none. */
  onAspect?: (a: AspectChoice) => void; onQuality?: (q: ShootQuality) => void; onCount?: (c: ShootCount) => void;
  testId: string;
}) {
  const first = photos[0];
  const resolved: ShootAspect | null = aspect !== 'auto' ? aspect : first && first.w > 0 && first.h > 0 ? nearestAspect(first.w, first.h) : null;
  const n = photos.length;
  const chips = useMemo<ChipSpec<string | number>[]>(() => {
    const all: ChipSpec<string | number>[] = [
      {
        id: 'aspect', label: copy.aspect, icon: <AspectGlyph ratio={resolved ?? '4:3'} />, layout: 'grid',
        value: aspect === 'auto' ? (resolved ? `${copy.auto} · ${resolved}` : copy.auto) : aspect,
        options: [
          { value: 'auto', label: copy.auto, glyph: <Sparkles size={22} aria-hidden="true" /> },
          ...SHOOT_ASPECTS.map((a) => ({ value: a as string, label: a, glyph: <AspectGlyph ratio={a} box={26} /> })),
        ],
        current: aspect, onSelect: (v) => onAspect?.(v as AspectChoice),
      },
      {
        id: 'quality', label: copy.quality, icon: <QualityGlyph />, layout: 'list',
        value: SHOOT_QUALITIES.find(([q]) => q === quality)?.[1] ?? '2K',
        options: SHOOT_QUALITIES.map(([q, l]) => ({ value: q as string, label: l, sub: copy.qualityHint[q] })),
        current: quality, onSelect: (v) => onQuality?.(v as ShootQuality),
      },
      {
        id: 'count', label: copy.count, icon: <CountGlyph />, layout: 'list', value: String(count),
        // Every row carries what pressing Generate would cost with it — the price is never a surprise.
        options: SHOOT_COUNTS.map((c) => ({ value: c, label: copy.tilesLine(n, c, shootTiles(n, c)), sub: creditsLabel(shootCredits(n, c), locale) })),
        current: count, onSelect: (v) => onCount?.(Number(v) as ShootCount),
      },
    ];
    return all.filter((c) => ids.includes(c.id as ShootChipId));
  }, [ids, aspect, quality, count, resolved, n, copy, locale, onAspect, onQuality, onCount]);
  return <ChipBar chips={chips} closeLabel={copy.close} testId={testId} />;
}

const FOOTER_CHIPS: readonly ShootChipId[] = ['aspect', 'count'];
const QUALITY_CHIP: readonly ShootChipId[] = ['quality'];

/** The resolution chip, for the panel's Advanced settings (chip ids `${testId}-pro-chip-quality`). */
export function ShootQualityChip({ copy, locale, form, onQuality, testId }: {
  copy: ShootCopy; locale: string;
  form: { photos: readonly { w: number; h: number }[]; aspect: AspectChoice; quality: ShootQuality; count: ShootCount };
  onQuality: (q: ShootQuality) => void; testId: string;
}) {
  return (
    <ShootChips ids={QUALITY_CHIP} aspect={form.aspect} quality={form.quality} count={form.count} photos={form.photos} copy={copy} locale={locale}
      onQuality={onQuality} testId={`${testId}-pro`} />
  );
}

/** What a shut Advanced settings says is set: the resolution (the model is the route's Auto). */
export const shootQualityLabel = (quality: ShootQuality): string => SHOOT_QUALITIES.find(([q]) => q === quality)?.[1] ?? '2K';

export function ShootFooter({ copy, locale, form, tiles, credits, insufficient, canGenerate, needSomething, onAspect, onCount, onGenerate, testId, service }: {
  copy: ShootCopy; locale: string;
  form: { photos: readonly { w: number; h: number }[]; aspect: AspectChoice; quality: ShootQuality; count: ShootCount };
  tiles: number; credits: number;
  insufficient: boolean; canGenerate: boolean; needSomething: string;
  onAspect: (a: AspectChoice) => void; onCount: (c: ShootCount) => void;
  onGenerate: () => void; testId: string;
  /** The catalog service (image.photoshoot / image.interior), for the quote-shown event. */
  service?: string;
}) {
  return (
    <footer data-testid={`${testId}-footer`}
      // ⚠️ `sticky bottom-0` sticks INSIDE the scroller's bottom padding, so the camera chips scrolling past showed under
      // Generate. The shadow is a solid skirt of the surface's own colour that fills that strip (as VideoGenerateBar does).
      className="sticky bottom-0 z-10 -mx-1 space-y-3 border-t border-app-border/10 bg-app-surface px-1 pt-3 shadow-[0_16px_0_0_rgb(var(--app-surface))] lg:bg-app-bg lg:shadow-[0_16px_0_0_rgb(var(--app-bg))]"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
      <ShootChips ids={FOOTER_CHIPS} aspect={form.aspect} quality={form.quality} count={form.count} photos={form.photos} copy={copy} locale={locale}
        onAspect={onAspect} onCount={onCount} testId={testId} />
      {tiles > 1 && (
        <Hint testId={`${testId}-tiles`}>
          {copy.tilesLine(form.photos.length, form.count, tiles)} · {creditsLabel(credits, locale)}
        </Hint>
      )}
      {!canGenerate && <Hint testId={`${testId}-need`}>{needSomething}</Hint>}
      <GenerateButton
        label={copy.generate} credits={credits} insufficient={insufficient} disabled={!canGenerate} locale={locale}
        onClick={onGenerate} testId={`${testId}-generate`} service={service}
      />
    </footer>
  );
}
