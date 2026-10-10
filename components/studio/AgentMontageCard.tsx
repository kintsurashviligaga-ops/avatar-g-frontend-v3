'use client';

/**
 * AgentMontageCard — Agent G's montage (lib/agent/media, slice 1) in the chat thread itself, as a task card
 * (AgentTaskCard): every step from the upload to the saved master, and the buttons the step in front of the user needs.
 *
 *   reading  upload (2/4) → analysis, spinning from the moment the message is sent
 *   quoted   the plan's numbers on its step                                    [Start ✦ price]  [Cancel]
 *   running  the job's stage as the step in progress, its percent as the bar  [Stop]
 *   done · cancelled · failed · dismissed   the whole list, ticked up to where it ended; no buttons
 *
 * Start is the user's confirmation: nothing renders before it (the quote spent nothing). The card stays after the run:
 * the result is the bubble's own video under it (Download, Share, Library).
 */
import { Sparkle, Square, X } from 'lucide-react';
import { priceLabel, type AgentMontageState } from '@/lib/agent/media/montageChat';
import { jobCreditsText, montageTask } from '@/lib/agent/media/taskSteps';
import { AgentTaskCard } from './AgentTaskCard';
import { primaryBtn, quietBtn, useStopArmed } from './agentCardButtons';
import { CreditsLine, RetryButton } from './agentCardExtras';

type Lang = 'ka' | 'en' | 'ru';
const L: Record<Lang, { start: string; cancel: string; stop: string }> = {
  ka: { start: 'დაწყება', cancel: 'გაუქმება', stop: 'შეჩერება' },
  en: { start: 'Start', cancel: 'Cancel', stop: 'Stop' },
  ru: { start: 'Начать', cancel: 'Отмена', stop: 'Остановить' },
};

export function AgentMontageCard({
  state, locale, onStart, onCancel, onRetry,
}: {
  state: AgentMontageState;
  locale: string;
  onStart: () => void;
  /** Cancel a plan (nothing happens), or Stop a running edit (the server stops it between steps). */
  onCancel: () => void;
  /** Ask again with the same files and words (a card that was stopped, or failed while it ran). Absent: no Retry. */
  onRetry?: () => void;
}) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = L[lang];
  const stopArmed = useStopArmed(state.phase === 'running' ? state.t0 : undefined);
  const q = state.quote;
  const model = montageTask(state, locale);

  let buttons = null;
  if (state.phase === 'quoted' && q) {
    const price = priceLabel(q.credits, locale);
    buttons = (
      <>
        <button type="button" onClick={onStart} data-testid="agent-montage-start" data-price={q.credits} aria-label={`${t.start} — ${price}`} className={primaryBtn}>
          <Sparkle size={14} aria-hidden="true" />
          <span>{t.start}</span>
          <span className="tabular-nums" aria-hidden="true">{q.credits > 0 ? price : `· ${price}`}</span>
        </button>
        <button type="button" onClick={onCancel} data-testid="agent-montage-cancel" className={quietBtn}>
          <X size={14} aria-hidden="true" /> {t.cancel}
        </button>
      </>
    );
  } else if (state.phase === 'running' && !state.stopping) {
    buttons = (
      <button type="button" onClick={onCancel} disabled={!stopArmed} data-testid="agent-montage-stop" className={quietBtn}>
        <Square size={12} aria-hidden="true" /> {t.stop}
      </button>
    );
  }

  if (!buttons && onRetry && (state.phase === 'failed' || state.phase === 'cancelled')) {
    buttons = <RetryButton onRetry={onRetry} locale={locale} testId="agent-montage-retry" />;
  }
  const footer = <CreditsLine text={jobCreditsText(state.phase, q?.credits, locale)} testId="agent-montage-credits" />;

  return (
    <AgentTaskCard model={model} locale={locale} testId="agent-montage-card" phase={state.phase} footer={footer}>
      {buttons}
    </AgentTaskCard>
  );
}
