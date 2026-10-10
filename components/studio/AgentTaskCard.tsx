'use client';

/**
 * AgentTaskCard — Agent G's work in the chat as a task panel (lib/agent/media/taskSteps): a header with the count of
 * steps done and a clock, every step from the first upload to the saved result in one list joined by a line, a spinner
 * on the step in progress, ✓ on the steps done, an empty circle on the steps ahead, and the card's own buttons under it.
 * It stays in the thread after the work ends, with every step and where it ended; the header folds the list away.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Hand, Minus, Sparkles, Square, X } from 'lucide-react';
import { clockText, type StepState, type TaskCardModel } from '@/lib/agent/media/taskSteps';

type Lang = 'ka' | 'en' | 'ru';
const L: Record<Lang, { fold: string; unfold: string; steps: string; state: Record<StepState, string> }> = {
  ka: { fold: 'ნაბიჯების დაკეცვა', unfold: 'ნაბიჯების ჩვენება', steps: 'ნაბიჯები', state: { done: 'შესრულდა', active: 'მიმდინარეობს', waiting: 'გელოდება', pending: 'წინ არის', failed: 'ვერ შესრულდა', stopped: 'გაჩერდა', skipped: 'არ შესრულებულა' } },
  en: { fold: 'Fold the steps', unfold: 'Show the steps', steps: 'Steps', state: { done: 'done', active: 'in progress', waiting: 'waiting for you', pending: 'up next', failed: 'failed', stopped: 'stopped', skipped: 'not reached' } },
  ru: { fold: 'Свернуть шаги', unfold: 'Показать шаги', steps: 'Шаги', state: { done: 'выполнено', active: 'выполняется', waiting: 'ждёт вас', pending: 'впереди', failed: 'не удалось', stopped: 'остановлено', skipped: 'не выполнялось' } },
};

function StepIcon({ state }: { state: StepState }) {
  const box = 'relative z-[1] flex h-5 w-5 shrink-0 items-center justify-center rounded-full';
  switch (state) {
    case 'done':
      return <span className={`${box} bg-app-accent text-app-bg`}><Check size={12} strokeWidth={3} aria-hidden="true" /></span>;
    case 'active':
      // A ring with a moving arc: the step in progress (a still arc under reduced motion still reads as „in progress").
      return <span className={`${box} bg-app-surface`}><span className="h-[18px] w-[18px] rounded-full border-2 border-app-accent/25 border-t-app-accent motion-safe:animate-spin" /></span>;
    case 'waiting':
      return <span className={`${box} bg-app-accent/15 text-app-accent ring-2 ring-app-accent/70`}><Hand size={11} aria-hidden="true" /></span>;
    case 'failed':
      return <span className={`${box} bg-app-danger text-white`}><X size={12} strokeWidth={3} aria-hidden="true" /></span>;
    case 'stopped':
      return <span className={`${box} bg-app-muted/30 text-app-text`}><Square size={8} fill="currentColor" aria-hidden="true" /></span>;
    case 'skipped':
      return <span className={`${box} border border-dashed border-app-border/40 bg-app-surface text-app-muted/60`}><Minus size={10} aria-hidden="true" /></span>;
    case 'pending':
    default:
      return <span className={`${box} border-[1.5px] border-app-border/45 bg-app-surface`} />;
  }
}

/** The clock in the header: it ticks while Agent G works and stands still where the run ended. */
function Clock({ clock }: { clock: NonNullable<TaskCardModel['clock']> }) {
  const live = clock.to === undefined;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);
  return <span className="tabular-nums">{clockText((clock.to ?? now) - clock.from)}</span>;
}

export function AgentTaskCard({
  model, locale, testId, phase, footer, children,
}: {
  model: TaskCardModel;
  locale: string;
  /** The card's test id (agent-montage-card, agent-audio-card) and its phase, read by the end-to-end specs. */
  testId: string;
  phase: string;
  /** Lines under the steps, folded away with them (a run's credits and its events). */
  footer?: ReactNode;
  /** The card's buttons for this phase (Start · Cancel, Stop, Upload). */
  children?: ReactNode;
}) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = L[lang];
  const [folded, setFolded] = useState(false);
  const active = model.steps.find((s) => s.state === 'active' || s.state === 'waiting' || s.state === 'failed' || s.state === 'stopped');
  const tone = model.status === 'done' ? 'text-app-success' : model.status === 'failed' ? 'text-app-danger' : model.status === 'waiting' ? 'text-app-accent' : 'text-app-muted';
  const listId = `${testId}-steps`;

  return (
    <section
      data-testid={testId}
      data-phase={phase}
      aria-label={`Agent G · ${model.title}`}
      className="mt-3 w-full max-w-[34rem] overflow-hidden rounded-2xl border border-app-border/15 bg-app-elevated/45 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]"
    >
      <button
        type="button"
        onClick={() => setFolded((v) => !v)}
        aria-expanded={!folded}
        aria-controls={listId}
        title={folded ? t.unfold : t.fold}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-app-border/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-accent/50"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-app-accent/15 text-app-accent">
          <Sparkles size={14} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold leading-tight text-app-text">{model.countText}</span>
          <span className="mt-0.5 block truncate text-[12px] leading-tight text-app-muted">
            Agent G · {model.title}
            {folded && active ? <> · <span className="text-app-text/80">{active.label}</span></> : null}
          </span>
        </span>
        <span className={`flex shrink-0 items-center gap-1.5 text-[12px] font-medium ${tone}`} aria-live="polite">
          <span>{model.statusText}</span>
          {model.clock ? <><span aria-hidden="true">·</span><Clock clock={model.clock} /></> : null}
        </span>
        <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-app-muted transition-transform duration-200 ${folded ? '' : 'rotate-180'}`} />
      </button>

      {model.pct !== null ? (
        <div className="mx-4 h-1 overflow-hidden rounded-full bg-app-border/20" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={model.pct} aria-label={model.title}>
          <div className="h-full rounded-full bg-app-accent transition-[width] duration-700 ease-out" style={{ width: `${Math.max(3, model.pct)}%` }} />
        </div>
      ) : null}

      <div id={listId} hidden={folded}>
        <ol aria-label={t.steps} className="px-4 pb-1 pt-3">
          {model.steps.map((s, i) => {
            const last = i === model.steps.length - 1;
            const muted = s.state === 'pending' || s.state === 'skipped';
            return (
              <li key={s.key} data-step={s.key} data-state={s.state} aria-current={s.state === 'active' ? 'step' : undefined} className="relative flex gap-3 pb-3.5 last:pb-2">
                {/* The line that joins this step to the next: lit up to where the work has got. */}
                {!last ? (
                  <span aria-hidden="true" className={`absolute left-[9.5px] top-6 bottom-0.5 w-px ${s.state === 'done' ? 'bg-app-accent/50' : 'bg-app-border/30'}`} />
                ) : null}
                <StepIcon state={s.state} />
                <div className="min-w-0 flex-1 pt-px">
                  <p className={`text-[13.5px] leading-[1.35] ${
                    s.state === 'active' ? 'agent-step-sheen font-medium'
                      : s.state === 'failed' ? 'font-medium text-app-danger'
                        : s.state === 'waiting' ? 'font-medium text-app-text'
                          : muted ? (s.state === 'skipped' ? 'text-app-muted/60 line-through decoration-app-muted/30' : 'text-app-muted')
                            : 'text-app-text/90'
                  }`}>
                    {s.label}
                    {s.note ? <span className={`ml-2 text-[12px] font-normal tabular-nums ${s.state === 'waiting' ? 'text-app-accent' : 'text-app-muted'}`}>{s.note}</span> : null}
                    <span className="sr-only"> ({t.state[s.state]})</span>
                  </p>
                  {s.detail ? (
                    <p {...(s.attrs ?? {})} className={`mt-0.5 text-[12px] leading-[1.4] ${s.warn ? 'text-app-warning' : 'text-app-muted'}`}>{s.detail}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        {footer ? <div className="px-4 pb-2">{footer}</div> : null}
      </div>
      {/* The buttons stay when the list is folded: Stop must never hide behind a fold. */}
      {children ? <div className="flex flex-wrap items-center gap-2 px-4 pb-4 pt-1">{children}</div> : null}
    </section>
  );
}
