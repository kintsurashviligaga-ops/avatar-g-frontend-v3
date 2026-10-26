'use client';

/**
 * ClipQuickChips — the video tool's quick settings in the chat box, for ONE clip (GG 2026-10-25 16:10Z: „like Gemini's
 * Veo"): `9:16 ▾ · 8 წმ ▾ · 720p ▾ · ⋯`. It replaces the film row (Film / Music video, 8–120 s, a tier by name): there is
 * no music video and no film here any more.
 *
 * The SAME values as ClipCreatePanel (the „მეტი პარამეტრი" layer): the length is 4 · 6 · 8 · 10 s, the frame 9:16 or 16:9,
 * the quality said as a resolution with its engine and price — Veo 3.1's tiers for 4 / 6 / 8 s, Gemini Omni Flash at 720p
 * or 1080p for 10 s and for any length whose words have a character speak Georgian (GG's card 2026-10-26 10:55Z). Every price is lib/video/directClip.directClipCredits, the function POST /api/video/clip charges by.
 */
import { useRef, useState } from 'react';
import { Clock, Gauge, RectangleHorizontal, RectangleVertical } from 'lucide-react';
import { OptionPicker } from './OptionPicker';
import { VIDEO_COPY, vc } from './videoCreateCopy';
import { ServiceQuickSettings, type QuickChip } from '@/components/chat/composer/ServiceQuickSettings';
import type { VideoQuality } from '@/lib/credits/videoPricing';
import {
  directClipCredits, directClipEngine, directClipQualityLabel, directClipTierAllowed,
  type DirectClipAspect, type DirectClipResolution, type DirectClipSeconds, type DirectClipSpeech,
} from '@/lib/video/directClip';
import { clipEngineLabel, clipLengthsFor, clipResolutionBlurb, clipTierBlurb } from '@/components/studio/clip/clipOrder';

type Sheet = 'format' | 'length' | 'quality' | null;
const TIERS: readonly VideoQuality[] = ['lite', 'fast', 'standard'];
const LENGTHS: readonly DirectClipSeconds[] = [4, 6, 8, 10];

export function ClipQuickChips(p: {
  locale: string;
  desktop: boolean;
  seconds: DirectClipSeconds;
  onSeconds: (s: DirectClipSeconds) => void;
  aspect: DirectClipAspect;
  onAspect: (a: DirectClipAspect) => void;
  tier: VideoQuality;
  onTier: (t: VideoQuality) => void;
  resolution: DirectClipResolution;
  onResolution: (r: DirectClipResolution) => void;
  /** 'ka' when the words in the box have a character speak Georgian: the clip is Omni's at every length. */
  speech?: DirectClipSpeech;
  /** How many photos the clip carries (two or three are references: 8 s only, not on Lite). */
  photos: number;
  /** The Veo tiers this deployment cannot render (GET /api/video/engine): shown as unavailable, never picked. */
  closedTiers?: readonly VideoQuality[];
  onMore: () => void;
  moreExpanded: boolean;
  moreLabel: string;
}) {
  const { locale, seconds, aspect, tier, resolution, photos, speech } = p;
  const [sheet, setSheet] = useState<Sheet>(null);
  const formatRef = useRef<HTMLButtonElement>(null);
  const lengthRef = useRef<HTMLButtonElement>(null);
  const qualityRef = useRef<HTMLButtonElement>(null);
  const toggle = (s: Exclude<Sheet, null>) => () => setSheet((cur) => (cur === s ? null : s));
  const en = locale === 'en', ru = locale === 'ru';
  const sec = (s: number) => (en ? `${s} s` : ru ? `${s} с` : `${s} წმ`);
  const lengths = clipLengthsFor(photos);
  const omni = directClipEngine(seconds, speech) === 'omni';
  const AspectIcon = aspect === '16:9' ? RectangleHorizontal : RectangleVertical;
  const qualityValue = omni ? resolution : clipEngineLabel({ seconds, tier });

  const chips: QuickChip[] = [
    { id: 'video-format', icon: <AspectIcon size={15} />, label: vc(VIDEO_COPY.format, locale), value: aspect, onOpen: toggle('format'), expanded: sheet === 'format', chipRef: formatRef },
    { id: 'video-length', icon: <Clock size={15} />, label: vc(VIDEO_COPY.length, locale), value: sec(seconds), onOpen: toggle('length'), expanded: sheet === 'length', chipRef: lengthRef },
    { id: 'video-tier', icon: <Gauge size={15} />, label: vc(VIDEO_COPY.quality, locale), value: qualityValue, onOpen: toggle('quality'), expanded: sheet === 'quality', chipRef: qualityRef },
  ];
  const close = () => setSheet(null);
  const closeLabel = vc(VIDEO_COPY.close, locale);

  return (
    <>
      <ServiceQuickSettings chips={chips} onMore={p.onMore} moreExpanded={p.moreExpanded} moreLabel={p.moreLabel} testId="video-quick-settings" moreTestId="options-toggle" />
      <OptionPicker<DirectClipAspect>
        open={sheet === 'format'} onClose={close} desktop={p.desktop} anchorRef={formatRef}
        title={vc(VIDEO_COPY.format, locale)} closeLabel={closeLabel} testId="video-format-picker"
        value={aspect} onSelect={p.onAspect}
        options={(['9:16', '16:9'] as const).map((a) => ({
          value: a, label: a,
          hint: a === '9:16' ? (en ? 'vertical' : ru ? 'вертикально' : 'ვერტიკალური') : (en ? 'landscape' : ru ? 'горизонтально' : 'ჰორიზონტალური'),
        }))}
      />
      <OptionPicker<DirectClipSeconds>
        open={sheet === 'length'} onClose={close} desktop={p.desktop} anchorRef={lengthRef}
        title={vc(VIDEO_COPY.length, locale)} closeLabel={closeLabel} testId="video-length-picker"
        value={seconds} onSelect={p.onSeconds}
        options={LENGTHS.map((s) => ({
          value: s, label: sec(s), disabled: !lengths.includes(s),
          hint: clipEngineLabel({ seconds: s, tier, speech }),
          trailing: `✦ ${directClipCredits({ seconds: s, tier, photos, resolution, speech })}`,
        }))}
      />
      {omni ? (
        <OptionPicker<DirectClipResolution>
          open={sheet === 'quality'} onClose={close} desktop={p.desktop} anchorRef={qualityRef}
          title={vc(VIDEO_COPY.quality, locale)} closeLabel={closeLabel} testId="video-tier-picker"
          value={resolution} onSelect={p.onResolution}
          options={(['720p', '1080p'] as const).map((r) => ({
            value: r, label: directClipQualityLabel(aspect, seconds, r, speech), hint: `${clipResolutionBlurb(r, locale)} ${clipEngineLabel({ seconds, tier, speech })}.`,
            trailing: `✦ ${directClipCredits({ seconds, tier, photos, resolution: r, speech })}`,
          }))}
        />
      ) : (
        <OptionPicker<VideoQuality>
          open={sheet === 'quality'} onClose={close} desktop={p.desktop} anchorRef={qualityRef}
          title={vc(VIDEO_COPY.quality, locale)} closeLabel={closeLabel} testId="video-tier-picker"
          value={tier} onSelect={p.onTier}
          options={TIERS.map((t) => {
            const closed = p.closedTiers?.includes(t) ?? false;
            return {
              // What the tier changes, then its pixels (the same for all three, so not what tells them apart).
              value: t, label: clipEngineLabel({ seconds, tier: t }), hint: `${clipTierBlurb(t, locale)} ${directClipQualityLabel(aspect, seconds)}.`,
              disabled: closed || !directClipTierAllowed(t, photos),
              trailing: closed ? vc(VIDEO_COPY.tierUnavailable, locale) : `✦ ${directClipCredits({ seconds, tier: t, photos })}`,
            };
          })}
        />
      )}
    </>
  );
}
