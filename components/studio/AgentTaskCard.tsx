'use client';

/**
 * AgentTaskCard — Agent G's work in the chat as a collapsible timeline (lib/agent/media/taskSteps; GG 2026-11-06
 * 06:30Z): a header with the count of steps done („3/9 ნაბიჯი"), the status, a clock and a chevron; under it the
 * loading loop while Agent G works, then every step from the first upload to the saved result in one vertical list
 * joined by a line: a spinner on the step in progress, a blue ✓ on the steps done, an empty circle on the steps ahead,
 * each with its title and a smaller line of detail. The list folds and unfolds smoothly, a step that appears slides
 * in, and nothing moves for a user who asked the system for less motion. The card follows the job live (the follows
 * wait on app/api/tasks/stream), stays in the thread after the work ends, and keeps its buttons outside the fold.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Film, Hand, Image as ImageIcon, Loader2, Mic, Minus, Music2, Sparkles, Square, X } from 'lucide-react';
import { clockText, type StepState, type TaskCardModel } from '@/lib/agent/media/taskSteps';
import { LoadingLoop } from './ui/LoadingLoop';
import { ProgressLine } from './ui/controls';

type Lang = 'ka' | 'en' | 'ru';
const L: Record<Lang, { fold: string; unfold: string; steps: string; files: string; state: Record<StepState, string> }> = {
  ka: { fold: 'ნაბიჯების დაკეცვა', unfold: 'ნაბიჯების ჩვენება', steps: 'ნაბიჯები', files: 'ფაილები', state: { done: 'შესრულდა', active: 'მიმდინარეობს', waiting: 'გელოდება', pending: 'წინ არის', failed: 'ვერ შესრულდა', stopped: 'გაჩერდა', skipped: 'არ შესრულებულა' } },
  en: { fold: 'Fold the steps', unfold: 'Show the steps', steps: 'Steps', files: 'Files', state: { done: 'done', active: 'in progress', waiting: 'waiting for you', pending: 'up next', failed: 'failed', stopped: 'stopped', skipped: 'not reached' } },
  ru: { fold: 'Свернуть шаги', unfold: 'Показать шаги', steps: 'Шаги', files: 'Файлы', state: { done: 'выполнено', active: 'выполняется', waiting: 'ждёт вас', pending: 'впереди', failed: 'не удалось', stopped: 'остановлено', skipped: 'не выполнялось' } },
};

function StepIcon({ state }: { state: StepState }) {
  const box = 'relative z-[1] flex h-5 w-5 shrink-0 items-center justify-center rounded-full';
  switch (state) {
    case 'done':
      return <span data-icon="check" className={`${box} bg-app-accent text-white motion-safe:animate-[step-pop_220ms_ease-out]`}><Check size={12} strokeWidth={3} aria-hidden="true" /></span>;
    case 'active':
      // The step in progress spins (GG 2026-11-06: „მიმდინარე პროცესზე უნდა ტრიალებდეს"); with reduced motion it is a
      // still lit ring.
      return (
        <span data-icon="spinner" className={`${box} bg-app-surface text-app-accent ring-2 ring-app-accent/35`}>
          <Loader2 size={13} strokeWidth={2.5} aria-hidden="true" className="motion-safe:animate-spin" />
        </span>
      );
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
        {/* On a phone a long status („ველოდები შენს დასტურს") shrinks before the step count does. */}
        <span className="min-w-[5.5rem] flex-1">
          <span className="block truncate text-[14px] font-semibold leading-tight text-app-text">{model.countText}</span>
          {/* The file count leads: on a phone the line is cut at its end, and the count must never be what is cut. */}
          <span className="mt-0.5 block truncate text-[12px] leading-tight text-app-muted">
            {model.inputs ? <><span data-testid={`${testId}-inputs`} className="text-app-text/80">{model.inputs.text}</span> · </> : null}
            Agent G · {model.title}
            {folded && active ? <> · <span className="text-app-text/80">{active.label}</span></> : null}
          </span>
        </span>
        <span className={`flex min-w-0 max-w-[58%] items-center gap-1.5 text-[12px] font-medium ${tone}`} aria-live="polite" title={model.statusText}>
          <span className="truncate">{model.statusText}</span>
          {model.clock ? <><span aria-hidden="true" className="shrink-0">·</span><span className="shrink-0"><Clock clock={model.clock} /></span></> : null}
        </span>
        <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-app-muted transition-transform duration-200 ${folded ? '' : 'rotate-180'}`} />
      </button>

      {/* While Agent G works, the loading loop: every generation's wait looks the same. */}
      {model.status === 'working' && !folded ? (
        <div aria-hidden="true" data-testid={`${testId}-loop`} className="relative mx-4 mb-3 h-[140px] overflow-hidden rounded-xl bg-black ring-1 ring-app-border/15">
          <LoadingLoop />
        </div>
      ) : null}

      {/* The run's own percent, as a number (§3.3: no bar). The header already says what is running. */}
      {model.pct !== null ? <ProgressLine pct={model.pct} ariaLabel={model.title} className="mx-4 mb-1 justify-start" /> : null}

      {/* The fold: rows from 0 to the list's own height, so it opens and closes smoothly (no jump, no fixed height). */}
      <div
        id={listId}
        data-folded={folded ? 'true' : 'false'}
        aria-hidden={folded || undefined}
        // React 18 has no `inert` prop: the attribute itself keeps a folded list out of tab order and touch.
        {...(folded ? ({ inert: '' } as Record<string, string>) : {})}
        className={`grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-300 motion-safe:ease-out ${folded ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}
      >
      <div className="min-h-0 overflow-hidden">
        {/* Every file the task works on, by name and in the order sent: the user sees nothing was left out. */}
        {model.inputs?.files.length ? (
          <ul aria-label={t.files} data-testid={`${testId}-files`} className="flex flex-wrap gap-1.5 px-4 pt-3">
            {model.inputs.files.map((f, i) => (
              <li key={`${i}-${f.name}`} title={f.name} className="flex max-w-[11.5rem] items-center gap-1.5 rounded-full border border-app-border/20 px-2.5 py-1 text-[12px] leading-none text-app-text/85">
                {f.kind === 'audio' ? <Music2 size={12} aria-hidden="true" className="shrink-0 text-app-muted" />
                  : f.kind === 'voice' ? <Mic size={12} aria-hidden="true" className="shrink-0 text-app-muted" />
                  : f.kind === 'image' ? <ImageIcon size={12} aria-hidden="true" className="shrink-0 text-app-muted" />
                    : <Film size={12} aria-hidden="true" className="shrink-0 text-app-muted" />}
                <span className="truncate">{f.name}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <ol aria-label={t.steps} className="px-4 pb-1 pt-3">
          {model.steps.map((s, i) => {
            const last = i === model.steps.length - 1;
            const muted = s.state === 'pending' || s.state === 'skipped';
            return (
              <li key={s.key} data-step={s.key} data-state={s.state} aria-current={s.state === 'active' ? 'step' : undefined} className="relative flex gap-3 pb-3.5 last:pb-2 motion-safe:animate-fade-in">
                {/* The line that joins this step to the next: lit up to where the work has got. */}
                {!last ? (
                  <span aria-hidden="true" className={`absolute left-[9.5px] top-6 bottom-0.5 w-px motion-safe:transition-colors motion-safe:duration-500 ${s.state === 'done' ? 'bg-app-accent/60' : 'bg-app-border/30'}`} />
                ) : null}
                <StepIcon state={s.state} />
                <div className="min-w-0 flex-1 pt-px">
                  <p className={`text-[13.5px] leading-[1.35] ${
                    s.state === 'active' ? 'font-medium text-app-text'
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
        {/* What the words asked that this plan leaves out, by name and why: seen before Start, never dropped unseen. */}
        {model.notice ? (
          <p data-testid={`${testId}-notice`} role="note" className="px-4 pb-2 text-[12px] leading-[1.4] text-app-warning">{model.notice}</p>
        ) : null}
        {footer ? <div className="px-4 pb-2">{footer}</div> : null}
      </div>
      </div>
      {/* The buttons stay when the list is folded: Stop must never hide behind a fold. */}
      {children ? <div className="flex flex-wrap items-center gap-2 px-4 pb-4 pt-1">{children}</div> : null}
    </section>
  );
}
