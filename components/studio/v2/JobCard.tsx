'use client';

/**
 * One generation: its status while it runs, the result when it is done, and — when it fails — what happened
 * in plain Georgian and whether the money came back. Both prompt versions are available (brief §7): the
 * user's own words, and the English the model actually received, folded away.
 */
import Link from 'next/link';
import { Download, Film, ImageIcon, Move, Sparkles, X } from 'lucide-react';
import type { StudioJobView } from '@/hooks/useStudioGeneration';
import { describeServiceError } from '@/components/studio/ui/serviceError';
import { STATUS_LABEL, T, tx, type Lang } from './copy';

const CANCELABLE = new Set(['reserving', 'reserved', 'pending', 'queued']);
const FAILED = new Set(['failed', 'nsfw']);

export const gel = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2)} ₾`;

export interface JobCardProps {
  job: StudioJobView;
  modelLabel: string;
  lang: Lang;
  locale: string;
  cancelling: boolean;
  onCancel: (id: string) => void;
  /** Image results only: start an image→video from this frame. */
  onAnimate?: (url: string, job: StudioJobView) => void;
  /** Image results only, when the current model takes a photo. */
  onUseAsReference?: (url: string) => void;
}

function Icon({ service }: { service: string }) {
  if (service === 'image') return <ImageIcon size={14} />;
  if (service === 'motion') return <Move size={14} />;
  return <Film size={14} />;
}

export function JobCard({ job, modelLabel, lang, locale, cancelling, onCancel, onAnimate, onUseAsReference }: JobCardProps) {
  const done = job.status === 'completed';
  const failed = FAILED.has(job.status);
  const canceled = job.status === 'canceled';
  const running = !done && !failed && !canceled;
  const isImage = job.service === 'image';
  const [first] = job.outputUrls;
  const status = STATUS_LABEL[job.status] ? tx(STATUS_LABEL[job.status]!, lang) : job.status;
  const errorText = job.errorCode === 'not_found'
    ? tx(T.failed, lang)
    : describeServiceError(job.errorCode ?? 'generation_failed', locale, tx(T.failed, lang));
  const sent = job.promptSent && job.promptSent !== job.promptOriginal ? job.promptSent : null;

  return (
    <article className="overflow-hidden rounded-3xl border border-app-border/10 bg-app-surface" aria-busy={running} data-status={job.status}>
      <div className={`relative ${isImage ? 'aspect-square' : 'aspect-video'} bg-black/40`}>
        {done && first ? (
          isImage ? (
            job.outputUrls.length > 1 ? (
              <div className="grid h-full w-full grid-cols-2 gap-0.5">
                {job.outputUrls.slice(0, 4).map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" className="h-full w-full object-cover" />
                ))}
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={first} alt={job.promptOriginal ?? ''} className="h-full w-full object-contain" />
            )
          ) : (
            <video src={first} controls playsInline preload="metadata" className="h-full w-full object-contain" />
          )
        ) : failed || canceled ? (
          <div className="flex h-full w-full items-center justify-center p-6 text-center text-[13px] text-app-muted">{status}</div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,rgba(51,143,232,0.10),transparent_65%)]">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-app-accent/25 border-t-app-accent motion-reduce:animate-none" aria-hidden="true" />
            <span className="text-[13px] font-medium text-app-text/80">{status}…</span>
            <span className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden bg-app-accent/10" aria-hidden="true">
              <span className="block h-full w-1/3 animate-pulse bg-app-accent/70 motion-reduce:animate-none" />
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2 p-3.5">
        <div className="flex items-center gap-2 text-[12px] text-app-muted">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${done ? 'bg-app-accent/10 text-app-accent' : failed ? 'bg-app-danger/10 text-app-danger' : 'bg-app-elevated text-app-text/80'}`}>
            <Icon service={job.service} /> {status}
          </span>
          <span className="min-w-0 truncate">{modelLabel}</span>
          <span className="ml-auto shrink-0 tabular-nums text-app-text/80">{gel(job.priceGel)}</span>
        </div>

        {job.promptOriginal ? <p className="line-clamp-2 text-[14px] leading-snug text-app-text">{job.promptOriginal}</p> : null}
        {sent ? (
          <details className="text-[12px] text-app-muted">
            <summary className="cursor-pointer select-none">{tx(T.sentToModel, lang)}</summary>
            <p className="mt-1 leading-snug">{sent}</p>
          </details>
        ) : null}

        {failed ? (
          <p role="alert" className="text-[13px] leading-snug text-app-danger">
            {errorText}
            {/* The shared failure copy may already say the money came back; say it once. */}
            {job.refunded && !errorText.includes(tx(T.refunded, lang)) ? <span className="text-app-muted"> · {tx(T.refunded, lang)}</span> : null}
          </p>
        ) : null}
        {canceled && job.refunded ? <p className="text-[13px] text-app-muted">{tx(T.refunded, lang)}</p> : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {running && CANCELABLE.has(job.status) ? (
            <button type="button" onClick={() => onCancel(job.id)} disabled={cancelling}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-border/15 px-3 text-[13px] text-app-text transition-colors hover:bg-app-elevated disabled:opacity-50">
              <X size={14} /> {tx(T.cancel, lang)}
            </button>
          ) : null}
          {done && first ? (
            <>
              <a href={first} download target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-border/15 px-3 text-[13px] text-app-text transition-colors hover:bg-app-elevated">
                <Download size={14} /> {tx(T.download, lang)}
              </a>
              {isImage && onAnimate ? (
                <button type="button" onClick={() => onAnimate(first, job)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-accent/10 px-3 text-[13px] font-semibold text-app-accent transition-colors hover:bg-app-accent/20">
                  <Sparkles size={14} /> {tx(T.animate, lang)}
                </button>
              ) : null}
              {isImage && onUseAsReference ? (
                <button type="button" onClick={() => onUseAsReference(first)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-border/15 px-3 text-[13px] text-app-text transition-colors hover:bg-app-elevated">
                  {tx(T.useAsRef, lang)}
                </button>
              ) : null}
              <Link href={`/${locale}/library`}
                className="inline-flex min-h-[40px] items-center rounded-full px-3 text-[13px] text-app-muted transition-colors hover:text-app-text">
                {tx(T.openLibrary, lang)} →
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
