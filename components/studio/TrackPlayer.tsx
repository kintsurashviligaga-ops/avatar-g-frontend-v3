'use client';

/**
 * The primary Music Create result and desktop centre pane share this player.
 *
 * Important: this is the player actually rendered on the user's phone
 * (MusicResult -> TrackPlayer), not the separate Agent G MusicStudioCard.
 * The existing download/share/edit/save actions remain owned by MusicResult.
 */
import { memo } from 'react';
import { MusicPreviewPlayer } from '@/components/studio/music/MusicPreviewPlayer';

export interface TrackPlayerProps {
  url: string;
  coverUrl?: string;
  label: string;
  engine?: string;
  note?: string | null;
  locale?: string;
}

export const TrackPlayer = memo(function TrackPlayer({
  url, coverUrl, label, engine, note, locale = 'ka',
}: TrackPlayerProps) {
  return (
    <div className="w-full min-w-0" data-testid="music-primary-result-player">
      <MusicPreviewPlayer src={url} coverUrl={coverUrl} title={label} locale={locale} />
      {/* Keep the honest provider / slider-provenance information under the
          redesigned controls; losing this would hide an important constraint. */}
      {(engine || note) && (
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 px-2 text-[10.5px] font-medium text-app-muted/80">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400/80" />
          {engine && <span>Generated with {engine}</span>}
          {note && <span data-track-note>{engine ? '· ' : ''}{note}</span>}
        </div>
      )}
    </div>
  );
});

export default TrackPlayer;
