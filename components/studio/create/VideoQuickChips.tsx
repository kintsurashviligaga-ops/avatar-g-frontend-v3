'use client';

/**
 * VideoQuickChips — the video tool's quick settings in the chat box (the unified composer, GG 2026-10-25):
 * `ფილმი ▾ · 9:16 ▾ · 8 წმ ▾ · Veo 3.1 Fast ▾ · ⋯`.
 *
 * The SAME values and pickers as VideoCreatePanel (which stays mounted as the „მეტი პარამეტრი" layer, and keeps owning the
 * remembered-model and off-grid-length effects): the mode is `videoMode`, the length opens VideoDurationSheet, the format
 * VideoFormatSheet, the model is the Veo tier in the studio's plan with each tier's price from videoQuote — the function the
 * composer's Send and the server charge with. Nothing here sends or prices a request of its own.
 */
import { useRef, useState } from 'react';
import { Clapperboard, Clock, Gauge, RectangleHorizontal, RectangleVertical, Square } from 'lucide-react';
import { OptionPicker } from './OptionPicker';
import { VideoDurationSheet, VideoFormatSheet } from './VideoPickers';
import { modeName, tierName } from './videoCreateParts';
import { VIDEO_COPY, vc } from './videoCreateCopy';
import { ServiceQuickSettings, type QuickChip } from '@/components/chat/composer/ServiceQuickSettings';
import { formatVideoDuration } from '@/lib/video/duration';
import { VIDEO_TIERS, videoQuote, type VideoCapabilities } from '@/lib/video/createPanel';
import { planNotices, type VeoPlan } from '@/lib/video/veoPlan';
import type { VideoMode, VideoQuality } from '@/lib/credits/videoPricing';
import type { OutputFormat } from '@/lib/veo/types';
import type { VeoEngineInfo } from '../video/VeoParametersPanel';

type Sheet = 'mode' | 'duration' | 'format' | 'tier' | null;
const MODES: readonly VideoMode[] = ['documentary', 'musicvideo'];

export function VideoQuickChips(p: {
  locale: string;
  desktop: boolean;
  plan: VeoPlan;
  engine: VeoEngineInfo | null;
  mode: VideoMode;
  onMode: (m: VideoMode) => void;
  seconds: number;
  onSeconds: (s: number) => void;
  format: OutputFormat;
  onFormat: (f: OutputFormat) => void;
  onTier: (t: VideoQuality) => void;
  caps: VideoCapabilities;
  requestedSec?: number | null;
  joinOverlapSec?: number;
  onMore: () => void;
  moreExpanded: boolean;
  moreLabel: string;
}) {
  const { locale, plan, mode, seconds, format } = p;
  const [sheet, setSheet] = useState<Sheet>(null);
  const modeRef = useRef<HTMLButtonElement>(null);
  const tierRef = useRef<HTMLButtonElement>(null);
  const tier = plan.tier;
  const audioToggle = p.engine?.tiers?.[tier]?.audioToggle ?? p.engine?.audioToggle ?? false;
  const croppedNotes = planNotices({ ...plan, format }, { audioToggle }).filter((n) => n.id === 'cropped').map((n) => n[locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka']);
  const AspectIcon = format === '16:9' ? RectangleHorizontal : format === '1:1' ? Square : RectangleVertical;
  const toggle = (s: Exclude<Sheet, null>) => () => setSheet((cur) => (cur === s ? null : s));

  // The mode chip's name is the two choices it holds („ფილმი / მუსიკალური კლიპი"): no new string to translate.
  const modeLabel = `${modeName('documentary', locale)} / ${modeName('musicvideo', locale)}`;
  const chips: QuickChip[] = [
    { id: 'video-mode', icon: <Clapperboard size={15} />, label: modeLabel, value: modeName(mode, locale), onOpen: toggle('mode'), expanded: sheet === 'mode', chipRef: modeRef },
    { id: 'video-format', icon: <AspectIcon size={15} />, label: vc(VIDEO_COPY.format, locale), value: format, onOpen: toggle('format'), expanded: sheet === 'format' },
    { id: 'video-length', icon: <Clock size={15} />, label: vc(VIDEO_COPY.length, locale), value: formatVideoDuration(seconds, locale), onOpen: toggle('duration'), expanded: sheet === 'duration' },
    { id: 'video-tier', icon: <Gauge size={15} />, label: vc(VIDEO_COPY.quality, locale), value: tierName(tier, locale), onOpen: toggle('tier'), expanded: sheet === 'tier', chipRef: tierRef },
  ];

  return (
    <>
      <ServiceQuickSettings chips={chips} onMore={p.onMore} moreExpanded={p.moreExpanded} moreLabel={p.moreLabel} testId="video-quick-settings" moreTestId="options-toggle" />
      <OptionPicker<VideoMode>
        open={sheet === 'mode'} onClose={() => setSheet(null)} desktop={p.desktop} anchorRef={modeRef}
        title={modeLabel} closeLabel={vc(VIDEO_COPY.close, locale)} testId="video-mode-picker"
        value={mode} onSelect={p.onMode}
        options={MODES.map((m) => ({ value: m, label: modeName(m, locale), hint: vc(m === 'musicvideo' ? VIDEO_COPY.modeMusicVideoSub : VIDEO_COPY.modeDocumentarySub, locale) }))}
      />
      <OptionPicker<VideoQuality>
        open={sheet === 'tier'} onClose={() => setSheet(null)} desktop={p.desktop} anchorRef={tierRef}
        title={vc(VIDEO_COPY.quality, locale)} closeLabel={vc(VIDEO_COPY.close, locale)} testId="video-tier-picker"
        value={tier} onSelect={p.onTier}
        options={VIDEO_TIERS.map((t) => {
          const closed = p.engine?.tiers?.[t]?.available === false;
          return { value: t, label: tierName(t, locale), disabled: closed, trailing: closed ? vc(VIDEO_COPY.tierUnavailable, locale) : `✦ ${videoQuote({ seconds, tier: t, mode })}` };
        })}
      />
      <VideoDurationSheet open={sheet === 'duration'} onClose={() => setSheet(null)} locale={locale} seconds={seconds} onChange={p.onSeconds}
        caps={p.caps} tier={tier} mode={mode} requestedSec={p.requestedSec ?? null} joinOverlapSec={p.joinOverlapSec ?? 0} />
      <VideoFormatSheet open={sheet === 'format'} onClose={() => setSheet(null)} locale={locale} format={format} onChange={p.onFormat}
        musicVideo={mode === 'musicvideo'} notes={croppedNotes} />
    </>
  );
}
