'use client';

/**
 * MusicCentrePane — what the DESKTOP centre column shows for the Music tool (ref6's grammar: the input form is the right
 * column; here, under it in reading order, the live RESULT preview and the models-and-prices list that doubles as the
 * model picker). The latest track plays in the studio's own TrackPlayer; the engines are the ones the music route can
 * actually run, with the price per length and the same availability the pill shows. Picking a row writes the same stored
 * preference as the pill (lib/studio/musicEnginePref), so the two can never disagree.
 */
import type { ReactNode } from 'react';
import { effectiveEnginePref } from '@/lib/studio/musicEngines';
import { useMusicEnginePref } from '@/lib/studio/musicEnginePref';
import { EngineList } from './EngineList';
import { MusicResult, type MusicTrack } from './MusicResult';
import { musicCreateCopy } from './musicCreateCopy';
import { useMusicEngines } from './useMusicEngines';

export function MusicCentrePane({
  locale, track, actions, label, instrumental, reference,
}: {
  locale: string;
  track: MusicTrack | null;
  actions: ReactNode;
  label: string;
  instrumental: boolean;
  /** A reference track is attached (it fixes the engine). */
  reference: 'cover' | 'voice' | null;
}) {
  const cc = musicCreateCopy(locale);
  const status = useMusicEngines();
  const [stored, setStored] = useMusicEnginePref();
  const pref = effectiveEnginePref(stored, status, { instrumental });
  return (
    <div data-testid="music-pane" className="space-y-4">
      <MusicResult testId="music-result-pane" locale={locale} track={track} actions={actions} label={label} variant="pane" />
      <section data-testid="music-engines-pane" aria-label={cc.enginesAndPrices} className="min-w-0 rounded-[26px] bg-app-elevated/45 p-4 ring-1 ring-app-border/10">
        <h3 className="text-[16px] font-medium text-app-text">{cc.enginesAndPrices}</h3>
        <p className="mb-2 text-[12.5px] leading-snug text-app-muted">{cc.enginesPicker}</p>
        <EngineList variant="table" locale={locale} status={status} pref={pref} instrumental={instrumental} reference={reference} onPick={setStored} />
      </section>
    </div>
  );
}
