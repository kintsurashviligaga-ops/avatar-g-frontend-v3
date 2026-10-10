'use client';

/**
 * AgentEditCard — Agent G's own edit of one video (lib/agent/media/editExec: trim, speed, frame shape, colour, fades,
 * sound, a caption, a still) in the chat thread, as a task card (AgentTaskCard) next to the montage and MP3 cards and
 * built the same way.
 *
 *   reading   the file (uploaded first) or Agent G's own last result, while the plan is asked for
 *   quoted    source · the edits in words · what comes out              [Start · free]  [Cancel]
 *   running   the job's stage as the step in progress, its percent as the bar [Stop]
 *   done · failed · cancelled · dismissed   the whole list, ticked up to where it ended
 *
 * Start is the user's confirmation: nothing is decoded before it. The result is the bubble's own player (or picture)
 * under the card, with Download and the Library.
 */
import { Sparkle, Square, X } from 'lucide-react';
import type { AgentEditState } from '@/lib/agent/media/editChat';
import { jobCreditsText, editTask } from '@/lib/agent/media/taskSteps';
import { AgentTaskCard } from './AgentTaskCard';
import { primaryBtn, quietBtn, useStopArmed } from './agentCardButtons';
import { CreditsLine, RetryButton } from './agentCardExtras';

type Lang = 'ka' | 'en' | 'ru';
const L: Record<Lang, { start: string; cancel: string; stop: string; free: string }> = {
  ka: { start: 'დაწყება', cancel: 'გაუქმება', stop: 'შეჩერება', free: 'უფასო' },
  en: { start: 'Start', cancel: 'Cancel', stop: 'Stop', free: 'free' },
  ru: { start: 'Начать', cancel: 'Отмена', stop: 'Остановить', free: 'бесплатно' },
};

export function AgentEditCard({
  state, locale, onStart, onCancel, onRetry,
}: {
  state: AgentEditState;
  locale: string;
  onStart: () => void;
  /** Cancel a plan (nothing happens), or Stop a running edit (its worker kills ffmpeg). */
  onCancel: () => void;
  /** Ask again with the same files and words (a card that was stopped, or failed while it ran). Absent: no Retry. */
  onRetry?: () => void;
}) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = L[lang];
  const stopArmed = useStopArmed(state.phase === 'running' ? state.t0 : undefined);
  const q = state.quote;
  const model = editTask(state, locale);

  let buttons = null;
  if (state.phase === 'quoted' && q) {
    buttons = (
      <>
        <button type="button" onClick={onStart} data-testid="agent-edit-start" data-price={q.credits} className={primaryBtn}>
          <Sparkle size={14} aria-hidden="true" />
          <span>{t.start}</span>
          <span aria-hidden="true">· {q.credits > 0 ? `✦ ${q.credits}` : t.free}</span>
        </button>
        <button type="button" onClick={onCancel} data-testid="agent-edit-cancel" className={quietBtn}>
          <X size={14} aria-hidden="true" /> {t.cancel}
        </button>
      </>
    );
  } else if (state.phase === 'running' && !state.stopping) {
    buttons = (
      <button type="button" onClick={onCancel} disabled={!stopArmed} data-testid="agent-edit-stop" className={quietBtn}>
        <Square size={12} aria-hidden="true" /> {t.stop}
      </button>
    );
  }

  if (!buttons && onRetry && (state.phase === 'failed' || state.phase === 'cancelled')) {
    buttons = <RetryButton onRetry={onRetry} locale={locale} testId="agent-edit-retry" />;
  }
  const footer = <CreditsLine text={jobCreditsText(state.phase, q?.credits, locale)} testId="agent-edit-credits" />;

  return (
    <AgentTaskCard model={model} locale={locale} testId="agent-edit-card" phase={state.phase} footer={footer}>
      {buttons}
    </AgentTaskCard>
  );
}
