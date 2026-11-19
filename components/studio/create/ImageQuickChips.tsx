'use client';

/**
 * ImageQuickChips — the image tool's quick settings in the chat box (the unified composer, GG 2026-10-25):
 * `1:1 ▾ · ×1 ▾ · სტილი ▾ · ⋯`.
 *
 * The SAME values and pickers as ImageCreatePanel (which stays mounted as the „მეტი პარამეტრი" layer: templates, negative
 * prompt, Script → Storyboard): `imgAspect`, `imgCount`, `imgStyle` in OmniStudio, which runImageJob / runImageBatch read.
 * Each count carries its price from imageCredits — quoteCredits, the number the route reserves. No model chip: the route has
 * one Google model (lib/studio/imageCreate, GG 2026-10-23 "Hide"), so a picker of one would be decoration.
 */
import { useMemo, useRef, useState } from 'react';
import { Layers, Palette } from 'lucide-react';
import { AspectGlyph } from './AspectGlyph';
import { imageCreateCopy } from './imageCreateCopy';
import { OptionPicker, type PickerOption } from './OptionPicker';
import { ServiceQuickSettings, type QuickChip } from '@/components/chat/composer/ServiceQuickSettings';
import { creditsLabel } from '@/lib/credits/quote';
import { IMG_ASPECTS, IMG_COUNTS, IMG_STYLES, imageCredits, imageStyleSwatch, type ImgAspect, type ImgCount } from '@/lib/studio/imageCreate';

type Sheet = 'aspect' | 'count' | 'style' | null;

export function ImageQuickChips(p: {
  locale: string;
  desktop: boolean;
  aspect: ImgAspect;
  onAspect: (a: ImgAspect) => void;
  count: ImgCount;
  onCount: (n: ImgCount) => void;
  style: string;
  onStyle: (s: string) => void;
  styleLabel: (s: string) => string;
  onMore: () => void;
  moreExpanded: boolean;
  moreLabel: string;
}) {
  const c = imageCreateCopy(p.locale);
  const [sheet, setSheet] = useState<Sheet>(null);
  const aspectRef = useRef<HTMLButtonElement>(null);
  const countRef = useRef<HTMLButtonElement>(null);
  const styleRef = useRef<HTMLButtonElement>(null);
  const toggle = (s: Exclude<Sheet, null>) => () => setSheet((cur) => (cur === s ? null : s));
  const close = () => setSheet(null);

  const aspectOptions = useMemo<PickerOption<ImgAspect>[]>(() => IMG_ASPECTS.map((a) => ({ value: a, label: a, glyph: <AspectGlyph ratio={a} size={26} on={a === p.aspect} /> })), [p.aspect]);
  const countOptions = useMemo<PickerOption<ImgCount>[]>(() => IMG_COUNTS.map((n) => ({
    value: n, label: c.countOption(n), glyph: <Layers size={20} />, trailing: creditsLabel(imageCredits(n), p.locale),
  })), [c, p.locale]);
  const styleOptions = useMemo<PickerOption<string>[]>(() => IMG_STYLES.map((s) => {
    const swatch = imageStyleSwatch(s);
    // eslint-disable-next-line @next/next/no-img-element -- a 96 px static swatch, the same file the panel's chip shows
    return { value: s, label: p.styleLabel(s), glyph: swatch ? <img src={swatch} alt="" width={26} height={26} className="h-[26px] w-[26px] rounded-md object-cover" /> : <Palette size={20} /> };
  }), [p]);

  const chips: QuickChip[] = [
    { id: 'image-aspect', icon: <AspectGlyph ratio={p.aspect} size={15} />, label: c.aspect, value: p.aspect, onOpen: toggle('aspect'), expanded: sheet === 'aspect', chipRef: aspectRef },
    { id: 'image-count', icon: <Layers size={15} />, label: c.count, value: `×${p.count}`, onOpen: toggle('count'), expanded: sheet === 'count', chipRef: countRef },
    { id: 'image-style', icon: <Palette size={15} />, label: c.style, value: p.styleLabel(p.style), onOpen: toggle('style'), expanded: sheet === 'style', chipRef: styleRef },
  ];

  return (
    <>
      <ServiceQuickSettings chips={chips} onMore={p.onMore} moreExpanded={p.moreExpanded} moreLabel={p.moreLabel} testId="image-quick-settings" moreTestId="options-toggle" />
      <OptionPicker open={sheet === 'aspect'} onClose={close} title={c.aspect} closeLabel={c.pickerClose} options={aspectOptions} value={p.aspect} onSelect={p.onAspect} desktop={p.desktop} anchorRef={aspectRef} columns={5} testId="quick-picker-aspect" />
      <OptionPicker open={sheet === 'count'} onClose={close} title={c.countTitle} closeLabel={c.pickerClose} options={countOptions} value={p.count} onSelect={p.onCount} desktop={p.desktop} anchorRef={countRef} testId="quick-picker-count" />
      <OptionPicker open={sheet === 'style'} onClose={close} title={c.style} closeLabel={c.pickerClose} options={styleOptions} value={p.style} onSelect={p.onStyle} desktop={p.desktop} anchorRef={styleRef} testId="quick-picker-style" />
    </>
  );
}
