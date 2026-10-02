'use client';

/**
 * ResearchCard — a research job as a card in the thread: running (progress, "you can close this — we will tell you"), ready
 * (sources count + Open), failed or canceled (what happened, and the credits). It reads the job from the store by id, so the
 * same card is right after a reload, a locked phone or a toast — the server owns the job, the card only shows it.
 */
import { useEffect, useState } from 'react';
import { AlertCircle, FileSearch, Loader2 } from 'lucide-react';
import { isActiveResearchStatus } from '@/lib/research/types';
import { cancelJob } from './api';
import { elapsedMinutes, jobFailureText, researchCopy } from './copy';
import { researchActions } from './store';
import { useEnsureJob } from './useEnsureJob';

/** Re-render every `everyMs` while `on` (the elapsed-minutes line). */
function useTicker(on: boolean, everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [on, everyMs]);
  return now;
}

const btn = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:opacity-50';

export function ResearchCard({ id, locale, className = '' }: { id: string; locale: string; className?: string }) {
  const c = researchCopy(locale);
  const { job, missing } = useEnsureJob(id);
  const active = !!job && isActiveResearchStatus(job.status);
  const now = useTicker(active);
  const [confirming, setConfirming] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const shell = `mt-2 w-full max-w-[460px] rounded-2xl border border-app-border/15 bg-app-elevated/40 p-3.5 ${className}`;

  if (!job) {
    return (
      <div className={shell} data-testid="research-card" data-state={missing ? 'missing' : 'loading'}>
        <p className="flex items-center gap-2 text-[13px] text-app-muted">
          {missing ? <AlertCircle size={16} aria-hidden="true" /> : <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" />}
          {missing ? c.cardMissing : c.cardLoading}
        </p>
      </div>
    );
  }

  const doCancel = async () => {
    setCanceling(true);
    const r = await cancelJob(id);
    if (r.ok) researchActions.upsertJob(r.job);
    setCanceling(false);
    setConfirming(false);
  };

  if (active) {
    const mins = elapsedMinutes(job, now);
    const searches = job.progress?.searches ?? 0;
    return (
      <div className={shell} data-testid="research-card" data-state="running">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-app-accent/15 text-app-accent" aria-hidden="true">
            <FileSearch size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-app-text" role="status">{job.cancelRequested ? c.cardCanceling : c.cardRunning}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-app-border/20" aria-hidden="true">
              <div className="h-full w-1/3 rounded-full bg-app-accent motion-safe:animate-pulse" />
            </div>
            <p className="mt-2 line-clamp-2 text-[12.5px] leading-snug text-app-muted">{job.progress?.summary || c.cardWorking}</p>
            <p className="mt-1 text-[12px] text-app-muted">
              {c.cardElapsed(mins)}{searches > 0 ? ` · ${c.cardSearches(searches)}` : ''}
            </p>
            <p className="mt-1.5 text-[12.5px] text-app-text/80">{c.cardCloseHint}</p>
            {!job.cancelRequested && (
              confirming ? (
                <div className="mt-2 rounded-xl bg-app-bg/40 p-2.5" role="group" aria-label={c.cardCancelAsk}>
                  <p className="text-[12.5px] text-app-text">{c.cardCancelAsk}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void doCancel()} disabled={canceling} className={`${btn} border border-app-border/25 text-app-text hover:bg-app-elevated`}>
                      {canceling ? <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" /> : null}{c.cardCancelYes}
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} disabled={canceling} className={`${btn} bg-app-accent text-app-bg hover:opacity-90`}>{c.cardCancelNo}</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className={`${btn} -ml-2 mt-1 text-app-muted hover:text-app-text`}>{c.cardCancel}</button>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  if (job.status === 'completed' && job.hasReport) {
    return (
      <div className={shell} data-testid="research-card" data-state="ready">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-app-accent/15 text-app-accent" aria-hidden="true"><FileSearch size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-app-text" role="status">{c.cardReady(job.sourcesCount)}</p>
            {job.title ? <p className="truncate text-[12.5px] text-app-muted">{job.title}</p> : null}
          </div>
          <button type="button" onClick={() => researchActions.openViewer(id)} data-testid="research-card-open" className={`${btn} shrink-0 bg-app-accent text-app-bg hover:opacity-90`}>{c.cardOpen}</button>
        </div>
      </div>
    );
  }

  return (
    <div className={shell} data-testid="research-card" data-state={job.status}>
      <p className="flex items-start gap-2 text-[13px] text-app-text" role="status">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-app-muted" aria-hidden="true" />
        <span>{jobFailureText(job, locale)}</span>
      </p>
      {job.status !== 'canceled' && (
        <button type="button" onClick={() => researchActions.openStart(job.prompt)} className={`${btn} -ml-2 mt-1 text-app-accent hover:bg-app-elevated`}>{c.retry}</button>
      )}
    </div>
  );
}
