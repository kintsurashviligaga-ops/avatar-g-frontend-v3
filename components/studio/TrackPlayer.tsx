'use client';

/**
 * The primary Music Create result and desktop centre pane share this player.
 *
 * Important: this is the player actually rendered on the user's phone
 * (MusicResult -> TrackPlayer), not the separate Agent G MusicStudioCard.
 * The existing download/share/edit/save actions remain owned by MusicResult.
 */
import { memo } from 'react';
import { Info } from 'lucide-react';
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
      {/* Optional, collapsed disclosure keeps provenance and slider limitations
          accessible without cluttering the player's minimal default layout. */}
      {(engine || note) && (
        <details className="group mt-1 text-right">
          <summary className="ml-auto inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full text-app-muted/70 hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" aria-label="Track information">
            <Info className="h-4 w-4" aria-hidden />
          </summary>
          <div className="rounded-xl bg-app-elevated/70 px-3 py-2 text-left text-[11px] leading-5 text-app-muted">
            {engine && <p>Generated with {engine}</p>}
            {note && <p data-track-note>{note}</p>}
          </div>
        </details>
      )}
    </div>
  );
});

export default TrackPlayer;
