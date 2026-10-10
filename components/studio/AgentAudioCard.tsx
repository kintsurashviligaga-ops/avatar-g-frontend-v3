'use client';

/**
 * AgentAudioCard — Agent G's "take the MP3 out of this" (lib/agent/media/audioExtract) in the chat thread itself, as a
 * task card (AgentTaskCard) next to AgentMontageCard and built the same way.
 *
 *   checking  the link (or the upload) spinning from the moment the message is sent
 *   quoted    source · rights · the plan on their steps                      [Start · free]  [Cancel]
 *   running   the job's stage as the step in progress, its percent as the bar [Stop]
 *   failed    a refusal the user can answer with their own file               [Upload a file]
 *   done · cancelled · dismissed   the whole list, ticked up to where it ended
 *
 * Start is the user's confirmation, and for a source whose rights could not be checked it is also their word that the
 * file is theirs or licensed to them (the rights step says so, in the caution colour). Nothing is fetched or decoded
 * before it. The result is the bubble's own player under the card (Download, Save to Library).
 */
import { Sparkle, Square, Upload, X } from 'lucide-react';
import { uploadOfferLabel, type AgentAudioState } from '@/lib/agent/media/audioChat';
import { audioTask } from '@/lib/agent/media/taskSteps';
import { AgentTaskCard } from './AgentTaskCard';
import { primaryBtn, quietBtn, useStopArmed } from './agentCardButtons';

type Lang = 'ka' | 'en' | 'ru';
const L: Record<Lang, { start: string; cancel: string; stop: string; free: string }> = {
  ka: { start: 'დაწყება', cancel: 'გაუქმება', stop: 'შეჩერება', free: 'უფასო' },
  en: { start: 'Start', cancel: 'Cancel', stop: 'Stop', free: 'free' },
  ru: { start: 'Начать', cancel: 'Отмена', stop: 'Остановить', free: 'бесплатно' },
};

export function AgentAudioCard({
  state, locale, onStart, onCancel, onUpload,
}: {
  state: AgentAudioState;
  locale: string;
  onStart: () => void;
  /** Cancel a plan (nothing happens), or Stop a running extraction (its worker kills ffmpeg). */
  onCancel: () => void;
  /** The upload offer after a refusal: opens the file picker with the request ready in the composer. */
  onUpload: () => void;
}) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = L[lang];
  const stopArmed = useStopArmed(state.phase === 'running' ? state.t0 : undefined);
  const q = state.quote;
  const model = audioTask(state, locale);

  let buttons = null;
  if (state.phase === 'quoted' && q) {
    buttons = (
      <>
        <button type="button" onClick={onStart} data-testid="agent-audio-start" data-price={q.credits} className={primaryBtn}>
          <Sparkle size={14} aria-hidden="true" />
          <span>{t.start}</span>
          <span aria-hidden="true">· {q.credits > 0 ? `✦ ${q.credits}` : t.free}</span>
        </button>
        <button type="button" onClick={onCancel} data-testid="agent-audio-cancel" className={quietBtn}>
          <X size={14} aria-hidden="true" /> {t.cancel}
        </button>
      </>
    );
  } else if (state.phase === 'running' && !state.stopping) {
    buttons = (
      <button type="button" onClick={onCancel} disabled={!stopArmed} data-testid="agent-audio-stop" className={quietBtn}>
        <Square size={12} aria-hidden="true" /> {t.stop}
      </button>
    );
  } else if (state.phase === 'failed' && state.offerUpload) {
    buttons = (
      <button type="button" onClick={onUpload} data-testid="agent-audio-upload" className={primaryBtn}>
        <Upload size={14} aria-hidden="true" /> {uploadOfferLabel(locale)}
      </button>
    );
  }

  return (
    <AgentTaskCard model={model} locale={locale} testId="agent-audio-card" phase={state.phase}>
      {buttons}
    </AgentTaskCard>
  );
}
