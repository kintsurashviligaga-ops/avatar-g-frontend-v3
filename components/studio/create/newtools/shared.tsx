'use client';

/**
 * What the two creation panels share beyond their pieces (PanelParts): the aspect / quality / count chip row, built from
 * the image route's own ratios and tiers, and the footer — the line that explains the press (photos × renders = images)
 * and the Generate pill with its price on it. One module, so the two panels cannot drift apart on the one control that
 * spends credits.
 */
import { useMemo } from 'react';
import { GenerateButton } from '@/components/studio/ui/GenerateButton';
import { creditsLabel } from '@/lib/credits/quote';
import { SHOOT_ASPECTS, SHOOT_COUNTS, SHOOT_QUALITIES, nearestAspect, type ShootAspect, type ShootCount, type ShootQuality } from '@/lib/studio/shootQuote';
import { AspectGlyph, ChipBar, CountGlyph, Hint, QualityGlyph, type ChipSpec } from './PanelParts';
import type { ShootCopy } from './copy';
import type { AspectChoice } from './useShootStudio';

export function ShootChips({ aspect, quality, count, photos, copy, onAspect, onQuality, onCount, testId }: {
  aspect: AspectChoice; quality: ShootQuality; count: ShootCount;
  /** The first photo decides what „Auto" is. */
  photos: readonly { w: number; h: number }[];
  copy: ShootCopy;
  onAspect: (a: AspectChoice) => void; onQuality: (q: ShootQuality) => void; onCount: (c: ShootCount) => void;
  testId: string;
}) {
  const first = photos[0];
  const resolved: ShootAspect | null = aspect !== 'auto' ? aspect : first && first.w > 0 && first.h > 0 ? nearestAspect(first.w, first.h) : null;
  const chips = useMemo<ChipSpec<string | number>[]>(() => [
    {
      id: 'aspect', label: copy.aspect, icon: <AspectGlyph ratio={resolved ?? '4:3'} />,
      value: aspect === 'auto' ? (resolved ? `${copy.auto} · ${resolved}` : copy.auto) : aspect,
      options: [{ value: 'auto', label: copy.auto }, ...SHOOT_ASPECTS.map((a) => ({ value: a as string, label: a }))],
      current: aspect, onSelect: (v) => onAspect(v as AspectChoice),
    },
    {
      id: 'quality', label: copy.quality, icon: <QualityGlyph />,
      value: SHOOT_QUALITIES.find(([q]) => q === quality)?.[1] ?? '2K',
      options: SHOOT_QUALITIES.map(([q, l]) => ({ value: q as string, label: l })),
      current: quality, onSelect: (v) => onQuality(v as ShootQuality),
    },
    {
      id: 'count', label: copy.count, icon: <CountGlyph />, value: String(count),
      options: SHOOT_COUNTS.map((n) => ({ value: n, label: String(n) })),
      current: count, onSelect: (v) => onCount(Number(v) as ShootCount),
    },
  ], [aspect, quality, count, resolved, copy, onAspect, onQuality, onCount]);
  return <ChipBar chips={chips} testId={testId} />;
}

export function ShootFooter({ copy, locale, photos, count, tiles, credits, insufficient, canGenerate, needSomething, onGenerate, testId }: {
  copy: ShootCopy; locale: string; photos: number; count: number; tiles: number; credits: number;
  insufficient: boolean; canGenerate: boolean; needSomething: string; onGenerate: () => void; testId: string;
}) {
  return (
    <div className="space-y-2">
      {tiles > 1 && (
        <Hint testId={`${testId}-tiles`}>
          {copy.tilesLine(photos, count, tiles)} · {creditsLabel(credits, locale)}
        </Hint>
      )}
      {!canGenerate && <Hint testId={`${testId}-need`}>{needSomething}</Hint>}
      <GenerateButton
        label={copy.generate} credits={credits} insufficient={insufficient} disabled={!canGenerate} locale={locale}
        onClick={onGenerate} stickyBottom testId={`${testId}-generate`}
      />
    </div>
  );
}
