'use client';

/**
 * "More Options" (ref2): Vocal Gender (i) as a segmented control, Weirdness and Style Influence (i) as sliders with tick
 * marks and an accent thumb — and, below them, everything else the Music tool has always had and the server still reads:
 * the track length, the tempo, and the templates gallery (thumbnails and all), so nothing that existed is out of reach.
 *
 * The sliders say what they are. On Lyria and ElevenLabs they only add a sentence to the text brief ("approximate", the
 * hint lib/ai/musicControls insists on); on an engine that takes them as parameters (MusicGen) the hint says so instead.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Chip, Slider } from '@/components/studio/ui/controls';
import { TemplateGallery, type TemplateCardItem } from '@/components/studio/ui/TemplateGallery';
import { musicControlsCopy } from '@/components/studio/ui/musicControlsCopy';
import type { MusicControlMode, VocalGender } from '@/lib/ai/musicControls';
import { MUSIC_DURATIONS, type MusicDuration } from '@/lib/studio/musicQuote';
import { MUSIC_TEMPOS, musicCreateCopy, tempoName, type MusicTempo } from './musicCreateCopy';
import { PillSegmented } from './PillSegmented';
import { InfoButton, PanelCard, cx, useInfoTip } from './primitives';

/** ref2's order — Auto first, then the two solo voices, then the duet. */
const VOCAL_ORDER: readonly VocalGender[] = ['auto', 'male', 'female', 'duet'];

export interface MoreOptionsProps {
  locale: string;
  open: boolean;
  onToggle: () => void;
  instrumental: boolean;
  vocal: VocalGender;
  onVocal: (v: VocalGender) => void;
  sliders: { weirdness: number; styleInfluence: number };
  onSliders: (next: { weirdness: number; styleInfluence: number }) => void;
  /** How the sliders reach the engine that will compose: real parameters, or sentences in the brief. */
  controlsMode: MusicControlMode;
  duration: MusicDuration;
  onDuration: (d: MusicDuration) => void;
  /** A cover is attached: the route bills a flat 30 s, so the length shown is fixed. */
  lengthLocked?: boolean;
  tempo: MusicTempo;
  onTempo: (t: MusicTempo) => void;
  templates: { items: readonly TemplateCardItem[]; activeId: string | null; onPick: (id: string) => void };
}

export function MoreOptions(p: MoreOptionsProps) {
  const cc = musicCreateCopy(p.locale);
  const mc = musicControlsCopy(p.locale);
  const vocalTip = useInfoTip();
  const weirdTip = useInfoTip();
  const influenceTip = useInfoTip();
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const tip = (t: ReturnType<typeof useInfoTip>, text: string) =>
    t.open ? <p id={t.id} role="note" className="mt-1 text-[12px] leading-snug text-app-muted">{text}</p> : null;

  return (
    <PanelCard testId="music-more" title={cc.moreOptions} open={p.open} onToggle={p.onToggle}>
      <div className="space-y-4 pt-1">
        {/* Vocal gender (i) — the four stops; moot for an instrumental, so shown but inert */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="flex items-center text-[15px] text-app-text">
              {cc.vocalGender}
              <InfoButton label={`${cc.info}: ${cc.vocalGender}`} open={vocalTip.open} controls={vocalTip.id} onClick={vocalTip.toggle} />
            </span>
            <PillSegmented
              testId="music-vocal"
              label={cc.vocalGender}
              value={p.vocal}
              onChange={p.onVocal}
              disabled={p.instrumental}
              options={VOCAL_ORDER.map((id) => ({ id, label: mc.vocalGender[id] }))}
            />
          </div>
          {tip(vocalTip, cc.vocalInfo)}
          {p.instrumental && <p className="mt-1 text-[11.5px] text-app-muted">{cc.vocalOff}</p>}
        </div>

        {/* Weirdness */}
        <div data-testid="music-sliders" className="space-y-1">
          <Slider
            stacked ticks={10} accentThumb
            label={mc.weirdness}
            labelAfter={<InfoButton label={`${cc.info}: ${mc.weirdness}`} open={weirdTip.open} controls={weirdTip.id} onClick={weirdTip.toggle} />}
            min={0} max={100} suffix="%" value={p.sliders.weirdness}
            onChange={(v) => p.onSliders({ ...p.sliders, weirdness: v })}
            ends={mc.weirdnessEnds}
          />
          {tip(weirdTip, cc.weirdnessInfo)}
          {/* Style Influence (i) … 50% */}
          <Slider
            stacked ticks={10} accentThumb
            label={mc.styleInfluence}
            labelAfter={<InfoButton label={`${cc.info}: ${mc.styleInfluence}`} open={influenceTip.open} controls={influenceTip.id} onClick={influenceTip.toggle} />}
            min={0} max={100} suffix="%" value={p.sliders.styleInfluence}
            onChange={(v) => p.onSliders({ ...p.sliders, styleInfluence: v })}
            ends={mc.styleInfluenceEnds}
          />
          {tip(influenceTip, cc.styleInfluenceInfo)}
          <p data-testid="music-sliders-hint" data-mode={p.controlsMode} className="text-[11px] leading-snug text-app-muted">
            {p.controlsMode === 'native' ? cc.native : mc.approximate}
          </p>
        </div>

        {/* Length — a chip here, a tile beside Create */}
        <div className="border-t border-app-border/10 pt-3">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-app-text">{cc.length}</span>
          <div role="group" aria-label={cc.length} data-testid="music-length" className="flex flex-wrap gap-1.5">
            {MUSIC_DURATIONS.map((d) => (
              <Chip key={d} active={p.duration === d} disabled={p.lengthLocked} onClick={() => p.onDuration(d)}>
                {d === 0 ? cc.lengthFull : `${d} ${cc.secondsShort}`}
              </Chip>
            ))}
          </div>
          {p.lengthLocked && <p className="mt-1 text-[11.5px] leading-snug text-app-muted">{cc.lengthFixed}</p>}
        </div>

        {/* Tempo — the server folds it into the brief as a BPM hint */}
        <div>
          <span className="mb-1.5 block text-[12.5px] font-semibold text-app-text">{cc.tempo}</span>
          <div role="group" aria-label={cc.tempo} data-testid="music-tempo" className="flex flex-wrap gap-1.5">
            {MUSIC_TEMPOS.map((t) => (
              <Chip key={t} active={p.tempo === t} onClick={() => p.onTempo(t)}>{tempoName(p.locale, t)}</Chip>
            ))}
          </div>
        </div>

        {/* Templates — the one-tap vibes, with their pictures */}
        <div className="border-t border-app-border/10 pt-1">
          <button
            type="button"
            data-testid="music-templates-toggle"
            aria-expanded={templatesOpen}
            onClick={() => setTemplatesOpen((v) => !v)}
            className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl text-left text-[14px] font-medium text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
          >
            <span className="min-w-0 truncate">{cc.templates}</span>
            <ChevronDown size={16} aria-hidden="true" className={cx('shrink-0 text-app-muted transition-transform', templatesOpen && 'rotate-180')} />
          </button>
          {templatesOpen && (
            <div className="pt-1">
              <TemplateGallery
                testId="music-templates"
                label={<span className="sr-only">{cc.templates}</span>}
                items={p.templates.items}
                activeId={p.templates.activeId}
                onPick={p.templates.onPick}
              />
            </div>
          )}
        </div>
      </div>
    </PanelCard>
  );
}
