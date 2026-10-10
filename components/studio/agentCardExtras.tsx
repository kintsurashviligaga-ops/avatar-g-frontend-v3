'use client';

/**
 * What every Agent G card shows under its steps and beside its buttons (AgentMontageCard, AgentAudioCard, AgentEditCard):
 * the credits line (held while it runs, spent when it delivers, paid back when it does not) and Retry on a card that was
 * stopped or failed while it ran (a fresh plan with the same files and words; nothing runs before Start).
 */
import { RotateCcw } from 'lucide-react';
import { quietBtn } from './agentCardButtons';

const RETRY: Record<'ka' | 'en' | 'ru', string> = { ka: 'თავიდან ცდა', en: 'Retry', ru: 'Повторить' };

export function CreditsLine({ text, testId }: { text: string | null; testId: string }) {
  if (!text) return null;
  return <p data-testid={testId} className="border-t border-app-border/15 pt-2 text-[12px] tabular-nums text-app-muted">{text}</p>;
}

export function RetryButton({ onRetry, locale, testId }: { onRetry: () => void; locale: string; testId: string }) {
  const lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  return (
    <button type="button" onClick={onRetry} data-testid={testId} className={quietBtn}>
      <RotateCcw size={13} aria-hidden="true" /> {RETRY[lang]}
    </button>
  );
}
