'use client';

/**
 * VideoStage — the desktop's centre for the video tool (ref6): the RESULT pane — the latest video of this tool from the
 * thread, with its actions — and, under it, "Models & prices", the engine tiers priced per length that also pick the model.
 * The create form itself is the right-hand column (VideoCreatePanel); this is what the form makes.
 *
 * ⚠️ NOTHING HERE OWNS A JOB. The caller (OmniStudio) already has the thread; it hands over the newest finished video and,
 * while one renders, its real progress. The pane only shows them — with the same ResultCard and ResultActions every other
 * result in the studio uses — so a film is the same film in the thread and here.
 */
import { Film } from 'lucide-react';
import type { VideoMode, VideoQuality } from '@/lib/credits/videoPricing';
import { ResultActions } from '@/components/studio/ui/ResultActions';
import { ResultCard } from '@/components/studio/ui/ResultCard';
import { VIDEO_COPY, vc, videoLang } from './videoCreateCopy';
import { VideoModelList } from './VideoPickers';

export interface VideoStageResult {
  url: string;
  /** "9:16" · "16:9" · "1:1" · "4:5" — the tile keeps the film's own shape. */
  aspect: string;
  /** Stored with the Library row as the caption. */
  prompt?: string;
}

export interface VideoStageProgress {
  aspect: string;
  /** A real percent from the film poll, when there is one. */
  pct?: number;
  /** The pipeline's own line ("Rendering scenes 2/3"). */
  stage?: string;
  /** Seconds since the render started and the seconds the time estimate is paced against (when no real percent). */
  elapsedSec?: number;
  capSec?: number;
}

export interface VideoStageProps {
  locale: string;
  latest: VideoStageResult | null;
  progress: VideoStageProgress | null;
  tier: VideoQuality;
  mode: VideoMode;
  seconds: number;
  onTier: (t: VideoQuality) => void;
  onOpenInEditor: (url: string) => void;
  onNote: (msg: string) => void;
}

/** The film's width ÷ height from its "9:16" label (16:9 when unreadable). */
const ratioOf = (aspect: string): number => {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspect.trim());
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : 16 / 9;
};

export function VideoStage({ locale, latest, progress, tier, mode, seconds, onTier, onOpenInEditor, onNote }: VideoStageProps) {
  const lang = videoLang(locale);
  return (
    <section data-testid="video-stage" aria-label={vc(VIDEO_COPY.result, locale)} className="mx-auto w-full max-w-3xl space-y-5 pb-4 pt-2">
      <div data-testid="video-result" className="rounded-3xl border border-app-border/10 bg-app-elevated/50 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-app-text">{vc(VIDEO_COPY.result, locale)}</h2>
          {latest && !progress && (
            <div className="flex flex-wrap items-center gap-1.5" data-testid="video-result-actions">
              <ResultActions url={latest.url} kind="film" locale={lang} prompt={latest.prompt} onNote={onNote} />
              <button type="button" onClick={() => onOpenInEditor(latest.url)}
                className="inline-flex min-h-[44px] items-center rounded-full border border-app-border/20 px-4 text-[13px] font-medium text-app-text transition-colors hover:border-app-accent/50 hover:text-app-accent">
                {vc(VIDEO_COPY.openInEditor, locale)}
              </button>
            </div>
          )}
        </div>
        {/* ⚠️ The tile is capped to 44 % of the window's height (width = height × its ratio), so a 9:16 film does not push
            "Models & prices" off the screen: the result and the table are on screen together, as in the reference. */}
        <div className="mx-auto w-full" style={{ maxWidth: `calc(44vh * ${ratioOf(progress?.aspect ?? latest?.aspect ?? '16:9')})` }}>
          {progress ? (
            <ResultCard kind="video" size="tile" aspect={progress.aspect} state={typeof progress.pct === 'number' && progress.pct >= 96 ? 'finalizing' : 'rendering'}
              locale={lang} pct={progress.pct} stage={progress.stage} elapsedSec={progress.elapsedSec ?? 0} capSec={progress.capSec ?? 440} />
          ) : latest ? (
            <ResultCard kind="video" size="tile" aspect={latest.aspect} state="ready" locale={lang} media={{ type: 'video', url: latest.url }} />
          ) : (
            <div data-testid="video-result-empty" className="flex aspect-[2/1] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-app-border/25 bg-gradient-to-br from-app-accent/10 via-transparent to-transparent px-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-app-accent/15 text-app-accent"><Film size={22} aria-hidden="true" /></span>
              <p className="text-[16px] font-medium text-app-text">{vc(VIDEO_COPY.resultEmpty, locale)}</p>
              <p className="max-w-sm text-[13px] leading-snug text-app-muted">{vc(VIDEO_COPY.resultEmptySub, locale)}</p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="px-1 text-[15px] font-semibold text-app-text">{vc(VIDEO_COPY.modelsPrices, locale)}</h2>
        <VideoModelList locale={locale} tier={tier} mode={mode} seconds={seconds} onTier={onTier} variant="table" />
      </div>
    </section>
  );
}
