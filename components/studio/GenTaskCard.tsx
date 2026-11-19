'use client';

/**
 * GenTaskCard — an image, a track, a video or an avatar clip made in the chat, as Agent G's timeline card
 * (lib/agent/media/genSteps; GG 2026-11-06 11:22Z „კი, ყველგან"). While it renders: the steps, the loading loop, the
 * clock and Stop. Once the result lands: the same card folded to one line above it (9/9-style count, „მზადაა", the time).
 */
import { Square } from 'lucide-react';
import { genTask, type GenTaskInput } from '@/lib/agent/media/genSteps';
import { AgentTaskCard } from './AgentTaskCard';
import { quietBtn } from './agentCardButtons';

const STOP = { ka: 'გაჩერება', en: 'Stop', ru: 'Стоп' } as const;

export function GenTaskCard({ input, locale, onStop }: { input: GenTaskInput; locale: string; onStop?: () => void }) {
  const lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const model = genTask(input, locale);
  return (
    <AgentTaskCard model={model} locale={locale} testId={`gen-${input.kind}-card`} phase={input.phase} defaultFolded={input.phase === 'done'}>
      {input.phase === 'working' && onStop ? (
        <button type="button" onClick={onStop} data-testid={`gen-${input.kind}-stop`} className={quietBtn}>
          <Square size={12} aria-hidden="true" /> {STOP[lang]}
        </button>
      ) : null}
    </AgentTaskCard>
  );
}
