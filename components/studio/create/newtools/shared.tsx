'use client';

/**
 * What the two creation panels share beyond their pieces (PanelParts): the FOOTER — the chip row (aspect · quality · count,
 * each a pill that opens its options in a sheet, the count's rows priced) and the Generate pill with its price on it, pinned
 * to the bottom of the settings like the owner's reference (chips directly above the full-width accent pill).
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

function ShootChips({ aspect, quality, count, photos, copy, locale, onAspect, onQuality, onCount, testId }: {
  aspect: AspectChoice; quality: ShootQuality; count: ShootCount;
  /** The first photo decides what „Auto" is; their number prices the count rows. */
  photos: readonly { w: number; h: number }[];
  copy: ShootCopy; locale: string;
  onAspect: (a: AspectChoice) => void; onQuality: (q: ShootQuality) => void; onCount: (c: ShootCount) => void;
  testId: string;
}) {
  const first = photos[0];
  const resolved: ShootAspect | null = aspect !== 'auto' ? aspect : first && first.w > 0 && first.h > 0 ? nearestAspect(first.w, first.h) : null;
  const n = photos.length;
  const chips = useMemo<ChipSpec<string | number>[]>(() => [
    {
      id: 'aspect', label: copy.aspect, icon: <AspectGlyph ratio={resolved ?? '4:3'} />, layout: 'grid',
      value: aspect === 'auto' ? (resolved ? `${copy.auto} · ${resolved}` : copy.auto) : aspect,
      options: [
        { value: 'auto', label: copy.auto, glyph: <Sparkles size={22} aria-hidden="true" /> },
        ...SHOOT_ASPECTS.map((a) => ({ value: a as string, label: a, glyph: <AspectGlyph ratio={a} box={26} /> })),
      ],
      current: aspect, onSelect: (v) => onAspect(v as AspectChoice),
    },
    {
      id: 'quality', label: copy.quality, icon: <QualityGlyph />, layout: 'list',
      value: SHOOT_QUALITIES.find(([q]) => q === quality)?.[1] ?? '2K',
      options: SHOOT_QUALITIES.map(([q, l]) => ({ value: q as string, label: l, sub: copy.qualityHint[q] })),
      current: quality, onSelect: (v) => onQuality(v as ShootQuality),
    },
    {
      id: 'count', label: copy.count, icon: <CountGlyph />, layout: 'list', value: String(count),
      // Every row carries what pressing Generate would cost with it — the price is never a surprise.
      options: SHOOT_COUNTS.map((c) => ({ value: c, label: copy.tilesLine(n, c, shootTiles(n, c)), sub: creditsLabel(shootCredits(n, c), locale) })),
      current: count, onSelect: (v) => onCount(Number(v) as ShootCount),
    },
  ], [aspect, quality, count, resolved, n, copy, locale, onAspect, onQuality, onCount]);
  return <ChipBar chips={chips} closeLabel={copy.close} testId={testId} />;
}

export function ShootFooter({ copy, locale, form, tiles, credits, insufficient, canGenerate, needSomething, onAspect, onQuality, onCount, onGenerate, testId }: {
  copy: ShootCopy; locale: string;
  form: { photos: readonly { w: number; h: number }[]; aspect: AspectChoice; quality: ShootQuality; count: ShootCount };
  tiles: number; credits: number;
  insufficient: boolean; canGenerate: boolean; needSomething: string;
  onAspect: (a: AspectChoice) => void; onQuality: (q: ShootQuality) => void; onCount: (c: ShootCount) => void;
  onGenerate: () => void; testId: string;
}) {
  return (
    <footer data-testid={`${testId}-footer`}
      className="sticky bottom-0 z-10 -mx-1 space-y-3 border-t border-app-border/10 bg-app-surface px-1 pt-3 lg:bg-app-bg"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
      <ShootChips aspect={form.aspect} quality={form.quality} count={form.count} photos={form.photos} copy={copy} locale={locale}
        onAspect={onAspect} onQuality={onQuality} onCount={onCount} testId={testId} />
      {tiles > 1 && (
        <Hint testId={`${testId}-tiles`}>
          {copy.tilesLine(form.photos.length, form.count, tiles)} · {creditsLabel(credits, locale)}
        </Hint>
      )}
      {!canGenerate && <Hint testId={`${testId}-need`}>{needSomething}</Hint>}
      <GenerateButton
        label={copy.generate} credits={credits} insufficient={insufficient} disabled={!canGenerate} locale={locale}
        onClick={onGenerate} testId={`${testId}-generate`}
      />
    </footer>
  );
}
