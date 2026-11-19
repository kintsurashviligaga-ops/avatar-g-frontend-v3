'use client';

/**
 * "Use in Video" (Phase 8.6 PR C): a presenter scene, or the whole presentation, goes on — into Montage (in production:
 * the clip rides over in this tab via lib/studio/pendingEdit, as a Library file does), or to the Director's Workflow as a
 * ready scene (lib/avatar/studio/videoHandoff, read by #355 once it is merged). Free: the video is already made.
 */
import { useState } from 'react';
import { offerToVideo, type StudioClip } from '@/lib/avatar/studio/videoHandoff';
import { t, type StudioLang } from './labels';

export function UseInVideoSheet({ clip, lang, onOpenMontage, onClose }: {
  clip: Omit<StudioClip, 'at'>;
  lang: StudioLang;
  onOpenMontage: (url: string) => void;
  onClose: () => void;
}) {
  const [offered, setOffered] = useState(false);
  return (
    <div data-testid="vs-use-sheet" role="dialog" aria-label={t('useInVideo', lang)} className="space-y-2 rounded-2xl border border-app-accent/40 bg-app-surface p-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-app-text">{t('useInVideo', lang)} · {clip.title}</span>
        <button type="button" data-testid="vs-use-close" onClick={onClose} className="text-[12px] text-app-muted">{t('close', lang)}</button>
      </div>
      <p className="text-[12px] text-app-muted">{t('freeNote', lang)}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="vs-use-montage" onClick={() => onOpenMontage(clip.url)}
          className="rounded-full bg-app-accent px-3 py-1.5 text-[13px] font-semibold text-white">{t('openMontage', lang)}</button>
        <button type="button" data-testid="vs-use-director" disabled={offered} onClick={() => setOffered(offerToVideo(clip))}
          className="rounded-full border border-app-border px-3 py-1.5 text-[13px] text-app-text disabled:opacity-40">{t('toDirector', lang)}</button>
      </div>
      {offered && <p data-testid="vs-use-offered" className="text-[12px] text-app-text">{t('offered', lang)}</p>}
    </div>
  );
}
