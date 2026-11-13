'use client';

/**
 * RunTimeline — one Agent G run in the Live Agent Workspace (v5.1 Phase 7, mocked data): goal, state, clock, credits
 * spent of the reservation, the percent (§3.3: a number and a label, no drawn bar) with one dot per step, then the
 * steps of the DAG with "in parallel" marks, and Pause · Resume · Cancel. Same step look as AgentTaskCard (#272).
 */
import { useEffect, useState } from 'react';
import { Check, ChevronDown, FileText, Hand, Loader2, Minus, Pause, Play, Square, X } from 'lucide-react';
import { clockText, parallelGroups, type RunView, type StepState } from '@/lib/agent/liveWorkspace/model';
import { ProgressLine } from '../ui/controls';
import type { Words } from './labels';

function StepIcon({ state }: { state: StepState }) {
  const box = 'relative z-[1] flex h-5 w-5 shrink-0 items-center justify-center rounded-full';
  switch (state) {
    case 'done':
      return <span data-icon="check" className={`${box} bg-app-accent text-white motion-safe:animate-[step-pop_220ms_ease-out]`}><Check size={12} strokeWidth={3} aria-hidden="true" /></span>;
    case 'active':
      return <span data-icon="spinner" className={`${box} bg-app-surface text-app-accent ring-2 ring-app-accent/35`}><Loader2 size={13} strokeWidth={2.5} aria-hidden="true" className="motion-safe:animate-spin" /></span>;
    case 'waiting':
      return <span data-icon="hand" className={`${box} bg-app-accent/15 text-app-accent ring-2 ring-app-accent/70`}><Hand size={11} aria-hidden="true" /></span>;
    case 'failed':
      return <span className={`${box} bg-app-danger text-white`}><X size={12} strokeWidth={3} aria-hidden="true" /></span>;
    case 'skipped':
      return <span className={`${box} border border-dashed border-app-border/40 bg-app-surface text-app-muted/60`}><Minus size={10} aria-hidden="true" /></span>;
    case 'queued':
      return <span className={`${box} border-[1.5px] border-app-accent/50 bg-app-surface`} />;
    default:
      return <span className={`${box} border-[1.5px] border-app-border/45 bg-app-surface`} />;
  }
}

/** One dot per step: discrete states, not a fill (no width is drawn from a number). */
function StepDots({ run, w }: { run: RunView; w: Words }) {
  return (
    <ol aria-hidden="true" data-testid="run-dots" className="flex flex-wrap gap-1">
      {run.steps.map((s) => (
        <li
          key={s.id}
          title={`${s.title} · ${w.step[s.state]}`}
          data-state={s.state}
          className={`h-1.5 w-5 rounded-full ${
            s.state === 'done' ? 'bg-app-accent'
              : s.state === 'active' ? 'bg-app-accent/50 motion-safe:animate-pulse'
                : s.state === 'waiting' ? 'bg-app-warning'
                  : s.state === 'failed' ? 'bg-app-danger'
                    : 'bg-app-border/30'
          }`}
        />
      ))}
    </ol>
  );
}

function Clock({ from, to }: { from: number; to: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (to !== null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [to]);
  return <span className="tabular-nums">{clockText((to ?? now) - from)}</span>;
}

export function RunTimeline({ run, w, onPause, onResume, onCancel, defaultFolded = false }: {
  run: RunView;
  w: Words;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  defaultFolded?: boolean;
}) {
  const [folded, setFolded] = useState(defaultFolded);
  const groups = parallelGroups(run.steps);
  const done = run.steps.filter((s) => s.state === 'done').length;
  const live = run.state === 'running' || run.state === 'paused' || run.state === 'awaiting_approval' || run.state === 'planned';
  const tone = run.state === 'delivered' || run.state === 'settled' ? 'text-app-success'
    : run.state === 'failed' ? 'text-app-danger'
      : run.state === 'awaiting_approval' ? 'text-app-warning'
        : run.state === 'cancelled' || run.state === 'paused' ? 'text-app-muted' : 'text-app-accent';
  const current = run.steps.find((s) => s.state === 'active' || s.state === 'waiting');
  const listId = `run-${run.id}-steps`;

  return (
    <section data-testid="run-timeline" data-run={run.id} data-state={run.state} aria-label={run.goal}
      className="w-full overflow-hidden rounded-2xl border border-app-border/15 bg-app-elevated/45">
      <button type="button" onClick={() => setFolded((v) => !v)} aria-expanded={!folded} aria-controls={listId}
        className="flex w-full items-start gap-3 px-4 pb-2 pt-3 text-left transition-colors hover:bg-app-border/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-accent/50">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[14px] font-semibold leading-snug text-app-text">{run.goal}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-app-muted">
            <span className={`font-medium ${tone}`} aria-live="polite">{w.run[run.state]}</span>
            <span aria-hidden="true">·</span>
            <Clock from={run.startedAt} to={run.endedAt} />
            <span aria-hidden="true">·</span>
            <span className="tabular-nums" data-testid="run-credits">{w.spent(run.creditsSpent, run.maxCredits)}</span>
            {folded && current ? <><span aria-hidden="true">·</span><span className="truncate text-app-text/80">{current.title}</span></> : null}
          </span>
        </span>
        <ChevronDown size={16} aria-hidden="true" className={`mt-0.5 shrink-0 text-app-muted transition-transform duration-200 ${folded ? '' : 'rotate-180'}`} />
      </button>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 pb-2">
        <ProgressLine pct={run.pct} label={w.stepCount(done, run.steps.length)} ariaLabel={run.goal} className="justify-start" />
        <StepDots run={run} w={w} />
      </div>

      <div id={listId} data-folded={folded ? 'true' : 'false'} aria-hidden={folded || undefined}
        {...(folded ? ({ inert: '' } as Record<string, string>) : {})}
        className={`grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-300 motion-safe:ease-out ${folded ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}>
        <div className="min-h-0 overflow-hidden">
          <ol aria-label={w.steps} className="px-4 pb-1 pt-2">
            {run.steps.map((s, i) => {
              const last = i === run.steps.length - 1;
              const g = groups.get(s.id);
              const muted = s.state === 'pending' || s.state === 'queued' || s.state === 'skipped';
              return (
                <li key={s.id} data-step={s.id} data-state={s.state} aria-current={s.state === 'active' ? 'step' : undefined} className="relative flex gap-3 pb-3 last:pb-2 motion-safe:animate-fade-in">
                  {!last ? <span aria-hidden="true" className={`absolute bottom-0.5 left-[9.5px] top-6 w-px ${s.state === 'done' ? 'bg-app-accent/60' : 'bg-app-border/30'}`} /> : null}
                  <StepIcon state={s.state} />
                  <div className="min-w-0 flex-1 pt-px">
                    <p className={`flex flex-wrap items-baseline gap-x-2 text-[13.5px] leading-[1.35] ${s.state === 'active' || s.state === 'waiting' ? 'font-medium text-app-text' : s.state === 'failed' ? 'font-medium text-app-danger' : muted ? (s.state === 'skipped' ? 'text-app-muted/60 line-through decoration-app-muted/30' : 'text-app-muted') : 'text-app-text/90'}`}>
                      <span>{s.title}</span>
                      {s.state === 'active' && s.pct !== null ? <span className="text-[12px] font-normal tabular-nums text-app-muted">{Math.min(99, Math.round(s.pct))}%</span> : null}
                      {g ? <span data-testid="parallel-mark" className="rounded-full bg-app-accent/10 px-1.5 py-px text-[10.5px] font-medium text-app-accent">∥ {w.parallel}</span> : null}
                      <span className="sr-only"> ({w.step[s.state]})</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] leading-[1.4] text-app-muted">
                      <span className="font-mono text-[11px] text-app-muted/80">{s.tool}</span>
                      {s.detail ? <span>{s.detail}</span> : null}
                      {s.credits !== null && s.state === 'done' ? <span className="tabular-nums">✦{s.credits}</span> : null}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          {run.artifacts.length ? (
            <ul aria-label={w.files} className="flex flex-wrap gap-1.5 px-4 pb-3">
              {run.artifacts.map((a) => (
                <li key={a.name} className="flex max-w-[14rem] items-center gap-1.5 rounded-full border border-app-border/20 px-2.5 py-1 text-[12px] leading-none text-app-text/85">
                  <FileText size={12} aria-hidden="true" className="shrink-0 text-app-muted" /><span className="truncate">{a.name}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {live ? (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-1">
          {run.state === 'running' && onPause ? <button type="button" data-testid="run-pause" onClick={onPause} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-app-border/25 px-3 text-[13px] text-app-text hover:bg-app-border/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50"><Pause size={13} aria-hidden="true" />{w.pause}</button> : null}
          {run.state === 'paused' && onResume ? <button type="button" data-testid="run-resume" onClick={onResume} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-app-accent px-3 text-[13px] font-medium text-white hover:bg-app-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50"><Play size={13} aria-hidden="true" />{w.resume}</button> : null}
          {onCancel ? <button type="button" data-testid="run-cancel" onClick={onCancel} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-[13px] text-app-muted hover:text-app-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50"><Square size={11} fill="currentColor" aria-hidden="true" />{w.cancel}</button> : null}
        </div>
      ) : null}
    </section>
  );
}
