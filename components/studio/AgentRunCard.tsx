'use client';

/**
 * AgentRunCard — a multi-step Agent G run (lib/agent/run, PART 6) in the chat thread as one task card (AgentTaskCard):
 * the upload, the plan, one row per run step with what it is doing or made, check and save; under them the run's
 * credits (held while a step runs, spent when it delivers) and what Agent G did, in words; and the buttons the moment
 * needs.
 *
 *   planned            [Start ✦ price]  [Cancel]
 *   running            [Stop]; a step priced above its approval waits: [Yes, ✦ price]
 *   ended, not all     [Retry]: a new run that keeps every delivered step and runs the rest (never twice the same)
 *   done · stopped · failed before it began   the whole list, ticked up to where it ended
 *
 * The card stays after the run; the results are the bubble's own players under it (Download, Share, Library).
 */
import { Check, RotateCcw, Sparkle, Square, X } from 'lucide-react';
import { priceLabel } from '@/lib/agent/media/montageChat';
import { canRetry, retryCredits, runTask, type AgentRunState } from '@/lib/agent/run/runCard';
import { AgentTaskCard } from './AgentTaskCard';
import { primaryBtn, quietBtn, useStopArmed } from './agentCardButtons';

type Lang = 'ka' | 'en' | 'ru';
const L: Record<Lang, { start: string; cancel: string; stop: string; yes: string; retry: string; log: string }> = {
  ka: { start: 'დაწყება', cancel: 'გაუქმება', stop: 'შეჩერება', yes: 'კი, გააგრძელე', retry: 'თავიდან ცდა', log: 'რა გააკეთა Agent G-მ' },
  en: { start: 'Start', cancel: 'Cancel', stop: 'Stop', yes: 'Yes, go on', retry: 'Retry', log: 'What Agent G did' },
  ru: { start: 'Начать', cancel: 'Отмена', stop: 'Остановить', yes: 'Да, продолжай', retry: 'Повторить', log: 'Что сделал Agent G' },
};

export function AgentRunCard({
  state, locale, onStart, onCancel, onApprove, onRetry,
}: {
  state: AgentRunState;
  locale: string;
  onStart: () => void;
  /** Cancel a plan (nothing happens), or Stop a running run (its steps' jobs stop and are paid back). */
  onCancel: () => void;
  /** The user's yes to a step's own price, bound to that quote. */
  onApprove: (step: string, quoteId: string) => void;
  /** Carry an ended run on. */
  onRetry: () => void;
}) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = L[lang];
  const stopArmed = useStopArmed(state.phase === 'running' ? state.t0 : undefined);
  const model = runTask(state, locale);

  let buttons = null;
  if (state.phase === 'planned' && state.plan) {
    const price = priceLabel(state.plan.credits, locale);
    buttons = (
      <>
        <button type="button" onClick={onStart} data-testid="agent-run-start" data-price={state.plan.credits} aria-label={`${t.start} — ${price}`} className={primaryBtn}>
          <Sparkle size={14} aria-hidden="true" />
          <span>{t.start}</span>
          <span className="tabular-nums" aria-hidden="true">{state.plan.credits > 0 ? price : `· ${price}`}</span>
        </button>
        <button type="button" onClick={onCancel} data-testid="agent-run-cancel" className={quietBtn}>
          <X size={14} aria-hidden="true" /> {t.cancel}
        </button>
      </>
    );
  } else if (state.phase === 'running' && !state.stopping) {
    const a = model.approval;
    buttons = (
      <>
        {a ? (
          <button type="button" onClick={() => onApprove(a.step, a.quoteId)} disabled={state.approving === a.step} data-testid="agent-run-approve" data-step={a.step} data-price={a.credits}
            aria-label={`${t.yes} — ${a.label} — ${priceLabel(a.credits, locale)}`} className={`${primaryBtn} disabled:opacity-60`}>
            <Check size={14} aria-hidden="true" />
            <span>{t.yes}</span>
            <span className="tabular-nums" aria-hidden="true">{priceLabel(a.credits, locale)}</span>
          </button>
        ) : null}
        <button type="button" onClick={onCancel} disabled={!stopArmed} data-testid="agent-run-stop" className={quietBtn}>
          <Square size={12} aria-hidden="true" /> {t.stop}
        </button>
      </>
    );
  } else if (canRetry(state)) {
    const up = retryCredits(state);
    buttons = (
      <button type="button" onClick={onRetry} disabled={!!state.resuming} data-testid="agent-run-retry" data-price={up} className={`${quietBtn}`}>
        <RotateCcw size={13} aria-hidden="true" /> {t.retry}
        {up > 0 ? <span className="tabular-nums text-app-muted">· {priceLabel(up, locale)}</span> : null}
      </button>
    );
  }

  const footer = model.credits || model.log.length ? (
    <div className="space-y-1.5 border-t border-app-border/15 pt-2">
      {model.credits ? <p data-testid="agent-run-credits" className="text-[12px] tabular-nums text-app-muted">{model.credits}</p> : null}
      {model.log.length ? (
        <details data-testid="agent-run-log" className="group text-[12px] text-app-muted">
          <summary className="cursor-pointer select-none rounded-md py-0.5 outline-none hover:text-app-text focus-visible:ring-2 focus-visible:ring-app-accent/50">
            {t.log} <span className="tabular-nums">({model.log.length})</span>
          </summary>
          <ol className="mt-1 space-y-0.5 pl-3">
            {model.log.map((line, i) => <li key={i} className="list-disc">{line}</li>)}
          </ol>
        </details>
      ) : null}
    </div>
  ) : null;

  return (
    <AgentTaskCard model={model} locale={locale} testId="agent-run-card" phase={state.phase} footer={footer}>
      {buttons}
    </AgentTaskCard>
  );
}
