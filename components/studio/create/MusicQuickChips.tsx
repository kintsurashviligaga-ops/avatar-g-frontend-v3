'use client';

/**
 * MusicQuickChips — the music tool's quick settings in the chat box (the unified composer, GG 2026-10-25):
 * `ვოკალით | ინსტრუმენტული · ჯაზი ▾ · 30 წმ ▾ · ⋯`.
 *
 * The SAME values as MusicCreatePanel (which stays mounted as the „მეტი პარამეტრი" layer and keeps owning its effects: the
 * vocals lock, the length fallback, the lyrics stash): `musicInstrumental`, `musicStyles`, `musicDuration` in OmniStudio,
 * which the music send reads. What the server runs comes from the same GET /api/ai/music/engines (useMusicEngines, cached):
 * Instrumental is locked on while vocals are unverified, only the lengths the route makes are offered, each with its
 * musicQuote price, and a cover's length is fixed at 30 s — so no chip offers what the route would refuse.
 */
import { useMemo, useRef, useState } from 'react';
import { Disc3, Clock, Music2 } from 'lucide-react';
import { OptionPicker, type PickerOption } from './OptionPicker';
import { musicCreateCopy } from './musicCreateCopy';
import { useMusicEngines } from './useMusicEngines';
import { ServiceQuickSettings, type QuickChip } from '@/components/chat/composer/ServiceQuickSettings';
import { MUSIC_DURATIONS, musicQuote, type MusicDuration } from '@/lib/studio/musicQuote';

type Sheet = 'style' | 'length' | null;

export function MusicQuickChips(p: {
  locale: string;
  desktop: boolean;
  instrumental: boolean;
  onInstrumental: (v: boolean) => void;
  styles: string[];
  onStyles: (v: string[]) => void;
  styleOptions: readonly { id: string; label: string }[];
  duration: MusicDuration;
  onDuration: (d: MusicDuration) => void;
  /** A cover is attached: the route bills it as a flat 30 s, so the length is not a choice. */
  cover: boolean;
  onMore: () => void;
  moreExpanded: boolean;
  moreLabel: string;
}) {
  const cc = musicCreateCopy(p.locale);
  const status = useMusicEngines();
  const [sheet, setSheet] = useState<Sheet>(null);
  const styleRef = useRef<HTMLButtonElement>(null);
  const lengthRef = useRef<HTMLButtonElement>(null);
  const toggle = (s: Exclude<Sheet, null>) => () => setSheet((cur) => (cur === s ? null : s));
  const close = () => setSheet(null);

  const vocalsLocked = !!status && !status.vocals;
  const lengthName = (d: MusicDuration) => (d === 0 ? cc.lengthFull : `${d} ${cc.secondsShort}`);
  const shownDuration: MusicDuration = p.cover ? 30 : p.duration;
  const labelOf = (id: string) => p.styleOptions.find((o) => o.id === id)?.label ?? id;
  const primary = p.styles[0] ?? '';

  const styleOptions = useMemo<PickerOption<string>[]>(() => p.styleOptions.map((o) => ({ value: o.id, label: o.label })), [p.styleOptions]);
  const lengths = status?.lengths;
  const lengthOptions = useMemo<PickerOption<MusicDuration>[]>(() => MUSIC_DURATIONS.filter((d) => (lengths ?? [30]).includes(d)).map((d) => ({
    value: d, label: d === 0 ? cc.lengthFull : `${d} ${cc.secondsShort}`, trailing: `✦ ${musicQuote({ duration: d })}`,
  })), [lengths, cc]);

  const chips: QuickChip[] = [
    {
      // Shown by what it makes (GG 2026-10-26: a simpler flow): „ვოკალით“ for a song, „ინსტრუმენტული“ for a backing track.
      id: 'music-instrumental', icon: <Disc3 size={15} />, label: cc.instrumental, value: p.instrumental ? cc.instrumental : cc.songWithVocals,
      pressed: p.instrumental, onOpen: () => p.onInstrumental(!p.instrumental),
      ...(vocalsLocked ? { disabled: true, note: cc.vocalsSoon } : {}),
    },
    {
      id: 'music-style', icon: <Music2 size={15} />, label: cc.styles,
      value: p.styles.length > 1 ? `${labelOf(primary)} +${p.styles.length - 1}` : primary ? labelOf(primary) : cc.styles,
      onOpen: toggle('style'), expanded: sheet === 'style', chipRef: styleRef,
    },
    {
      id: 'music-length', icon: <Clock size={15} />, label: cc.length, value: lengthName(shownDuration),
      onOpen: toggle('length'), expanded: sheet === 'length', chipRef: lengthRef,
      ...(p.cover ? { disabled: true, note: cc.lengthFixed } : {}),
    },
  ];

  return (
    <>
      <ServiceQuickSettings chips={chips} onMore={p.onMore} moreExpanded={p.moreExpanded} moreLabel={p.moreLabel} testId="music-quick-settings" moreTestId="options-toggle" />
      {/* One pick sets the lead style; the other styles chosen in the full card stay (it holds up to three). */}
      <OptionPicker open={sheet === 'style'} onClose={close} title={cc.styles} closeLabel={cc.close} options={styleOptions} value={primary}
        onSelect={(id) => p.onStyles([id, ...p.styles.filter((s) => s !== id && s !== primary)].slice(0, 3))}
        desktop={p.desktop} anchorRef={styleRef} testId="quick-picker-music-style" />
      <OptionPicker open={sheet === 'length'} onClose={close} title={cc.length} closeLabel={cc.close} options={lengthOptions} value={shownDuration} onSelect={p.onDuration}
        desktop={p.desktop} anchorRef={lengthRef} testId="quick-picker-music-length" />
    </>
  );
}
