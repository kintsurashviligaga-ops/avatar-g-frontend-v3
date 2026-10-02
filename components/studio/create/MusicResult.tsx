'use client';

/**
 * MusicResult — the latest generated track in the studio's own player (components/studio/TrackPlayer), with the action row
 * the feed's result bubble has (download · share · re-roll · save · edit · music video). One component, two homes: a
 * stacked card at the foot of the phone's Create sheet, and the Result pane in the desktop centre column (ref6's
 * "Result" preview under the input form). The actions are built by OmniStudio from its own handlers and handed in — this
 * file owns no generation, download or library logic.
 */
import type { ReactNode } from 'react';
import { Music2 } from 'lucide-react';
import { TrackPlayer } from '@/components/studio/TrackPlayer';
import { musicCreateCopy } from './musicCreateCopy';
import { cx } from './primitives';

export interface MusicTrack {
  url: string;
  coverUrl?: string;
  engine?: string;
  /** How the sliders reached the engine ("≈ sliders approximate"), or null (lib musicControlsNote). */
  note: string | null;
}

export function MusicResult({
  locale, track, actions, label, variant, testId,
}: {
  locale: string;
  track: MusicTrack | null;
  actions: ReactNode;
  /** The player's corner badge ("Music"). */
  label: string;
  variant: 'card' | 'pane';
  testId?: string;
}) {
  const cc = musicCreateCopy(locale);
  const pane = variant === 'pane';
  return (
    <section data-testid={testId} aria-label={pane ? cc.result : cc.lastTrack} className="min-w-0 rounded-[26px] bg-app-elevated/45 p-4 ring-1 ring-app-border/10">
      <h3 className="mb-2 text-[16px] font-medium text-app-text">{pane ? cc.result : cc.lastTrack}</h3>
      {track ? (
        <div className={cx('flex min-w-0 gap-4', pane ? 'flex-col items-start sm:flex-row' : 'flex-col')}>
          <div className={cx('w-full min-w-0 shrink-0', pane ? 'max-w-[260px]' : 'mx-auto max-w-[300px]')}>
            <TrackPlayer url={track.url} coverUrl={track.coverUrl} label={label} engine={track.engine} note={track.note} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            {/* The player already says "Generated with <engine>" (and the slider note): nothing to repeat here. */}
            <div className="flex flex-wrap items-center gap-1.5">{actions}</div>
          </div>
        </div>
      ) : (
        <div data-testid="music-result-empty" className="flex min-h-[132px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-app-border/20 px-4 py-6 text-center">
          <Music2 size={22} aria-hidden="true" className="text-app-muted" />
          <p className="text-[14px] font-medium text-app-text">{cc.resultEmpty}</p>
          <p className="text-[12.5px] leading-snug text-app-muted">{cc.resultEmptyHint}</p>
        </div>
      )}
    </section>
  );
}
