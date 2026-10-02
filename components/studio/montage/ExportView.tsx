'use client';

/**
 * components/studio/montage/ExportView.tsx — the export, from the first stage to the finished video.
 *
 * While it renders: the pipeline's real stage in words and its real percent (the job row the route updates),
 * never a spinner with nothing under it. When it is done: the video itself, at its format, with the shared
 * result actions (download — the photo roll on iOS — share, library) and the way back.
 */
import { AlertCircle, ArrowLeft, MessageSquare } from 'lucide-react';
import type { MontageAspect } from '@/lib/services/montage/montagePlan';
import { ProgressBar } from '../ui/controls';
import { ResultActions } from '../ui/ResultActions';
import { STAGE_LABEL, aspectRatio, langOf, type Copy } from './copy';

export type ExportState =
  | { phase: 'running'; stage: string | null; pct: number }
  | { phase: 'done'; url: string; musicMissing: boolean }
  | { phase: 'error'; message: string };

export function ExportView(p: {
  t: Copy;
  locale: string;
  aspect: MontageAspect;
  state: ExportState;
  onKeepEditing: () => void;
  onBackToChat: () => void;
  onRetry: () => void;
}) {
  const { t, state } = p;
  const l = langOf(p.locale);
  const r = aspectRatio(p.aspect);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-6" data-testid="montage-export" data-phase={state.phase}>
      <div className="flex w-full max-w-md flex-col items-center">
        {state.phase === 'running' && (
          <>
            <div
              className="relative w-full overflow-hidden rounded-2xl bg-app-surface"
              style={{ aspectRatio: String(r), maxHeight: '52vh', maxWidth: `calc(52vh * ${r})` }}
              aria-hidden="true"
            >
              <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-app-elevated/60 to-app-surface motion-reduce:animate-none" />
            </div>
            <div className="mt-5 w-full" role="status" aria-live="polite">
              <p className="mb-2 text-center text-[15px] font-semibold text-app-text">{t.exporting}</p>
              <ProgressBar
                pct={state.pct}
                label={state.stage && STAGE_LABEL[state.stage] ? STAGE_LABEL[state.stage]![l] : undefined}
              />
              <p className="mt-3 text-center text-[12.5px] leading-snug text-app-muted">{t.exportKeep}</p>
            </div>
          </>
        )}

        {state.phase === 'done' && (
          <>
            <video
              src={state.url}
              controls
              playsInline
              autoPlay
              className="w-full rounded-2xl bg-black"
              style={{ aspectRatio: String(r), maxHeight: '58vh', maxWidth: `calc(58vh * ${r})` }}
              data-testid="montage-result-video"
            />
            <p className="mt-4 text-[16px] font-semibold text-app-text">{t.ready}</p>
            {state.musicMissing && <p className="mt-1 text-center text-[12.5px] text-app-muted">{t.musicMissing}</p>}
            <div className="mt-3">
              <ResultActions url={state.url} kind="film" locale={l} prompt={t.title} />
            </div>
            <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={p.onKeepEditing}
                data-testid="montage-keep-editing"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[13.5px] text-app-text ring-1 ring-app-border/20 hover:ring-app-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
              >
                <ArrowLeft size={16} aria-hidden="true" /> {t.keepEditing}
              </button>
              <button
                type="button"
                onClick={p.onBackToChat}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[13.5px] text-app-muted hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
              >
                <MessageSquare size={16} aria-hidden="true" /> {t.toChat}
              </button>
            </div>
          </>
        )}

        {state.phase === 'error' && (
          <div className="mt-10 flex flex-col items-center text-center" role="alert">
            <AlertCircle size={28} aria-hidden="true" className="text-app-danger" />
            <p className="mt-3 text-[15px] font-semibold text-app-text">{t.exportFailed}</p>
            <p className="mt-1 max-w-sm text-[13px] leading-snug text-app-muted">{state.message}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={p.onRetry}
                className="inline-flex min-h-[44px] items-center rounded-full bg-app-accent px-5 text-[14px] font-semibold text-black hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
              >
                {t.retry}
              </button>
              <button
                type="button"
                onClick={p.onKeepEditing}
                className="inline-flex min-h-[44px] items-center rounded-full px-4 text-[13.5px] text-app-text ring-1 ring-app-border/20 hover:ring-app-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
              >
                {t.keepEditing}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
