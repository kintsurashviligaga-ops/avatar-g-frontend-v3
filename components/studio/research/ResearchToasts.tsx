'use client';

/**
 * ResearchToasts — the "your report is ready" notice (and its sad twin, and two one-liners). A polite live region at the top of
 * the screen under the safe area; each toast dismisses itself after a while (paused while hovered or focused), has a 44 px
 * dismiss, and — for a finished report — one tap on „Open" lands in the report. Never blocks the page behind it.
 */
import { useEffect, useRef } from 'react';
import { AlertCircle, FileSearch, Info, X } from 'lucide-react';
import { jobFailureText, jobLabel, researchCopy } from './copy';
import { researchActions, useResearchState, type ResearchToast } from './store';

const AUTO_DISMISS_MS = 15_000;

function Toast({ toast, locale }: { toast: ResearchToast; locale: string }) {
  const c = researchCopy(locale);
  const job = useResearchState().jobs[toast.kind === 'info' ? '' : toast.jobId];
  const paused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = toast.id;

  useEffect(() => {
    const arm = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { if (!paused.current) researchActions.dismissToast(id); else arm(); }, toast.kind === 'info' ? 6_000 : AUTO_DISMISS_MS);
    };
    arm();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [id, toast.kind]);

  let title = '';
  let body = '';
  let Icon = Info;
  if (toast.kind === 'info') {
    title = toast.key === 'started' ? c.toastStarted : c.toastLiveOff;
  } else if (toast.kind === 'ready') {
    Icon = FileSearch;
    title = c.toastReady;
    body = job ? `${jobLabel(job, 70)} · ${c.toastReadyBody(job.sourcesCount)}` : '';
  } else {
    Icon = AlertCircle;
    title = c.toastFailed;
    body = job ? jobFailureText(job, locale) : '';
  }

  return (
    <div
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
      onFocus={() => { paused.current = true; }}
      onBlur={() => { paused.current = false; }}
      data-testid="research-toast"
      data-kind={toast.kind}
      className="pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-2xl border border-app-border/15 bg-app-surface/95 p-3 pl-4 shadow-[0_12px_32px_rgba(0,0,0,0.3)] backdrop-blur"
    >
      <span className="mt-0.5 shrink-0 text-app-accent" aria-hidden="true"><Icon size={18} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-snug text-app-text">{title}</p>
        {body ? <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-app-muted">{body}</p> : null}
        {toast.kind === 'ready' && (
          <button
            type="button"
            data-testid="research-toast-open"
            onClick={() => { researchActions.dismissToast(id); researchActions.openViewer(toast.jobId); }}
            className="mt-2 inline-flex min-h-[44px] items-center rounded-full bg-app-accent px-4 text-[13px] font-semibold text-app-bg transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
          >
            {c.toastOpen}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => researchActions.dismissToast(id)}
        aria-label={c.toastDismiss}
        title={c.toastDismiss}
        className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ResearchToasts({ locale }: { locale: string }) {
  const { toasts } = useResearchState();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 top-0 z-[1000] flex flex-col items-center gap-2 px-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
    >
      {toasts.map((t) => <Toast key={t.id} toast={t} locale={locale} />)}
    </div>
  );
}
