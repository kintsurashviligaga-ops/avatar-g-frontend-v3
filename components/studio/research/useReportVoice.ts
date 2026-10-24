'use client';

/**
 * useReportVoice — the viewer's read-aloud, on the page's one player (lib/speech/player). A read started here stops any
 * other, and any other (or Live taking the microphone) stops this one; it also stops when the viewer closes. `activity` is
 * what commands.planReportCommand needs to decide whether "stop" / "pause" / "resume" mean anything right now.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpeechLocale } from '@/lib/speech/contract';
import { speechPlayer, type SpeechRequest } from '@/lib/speech/player';
import { useSpeechState } from '@/lib/speech/useSpeech';
import type { VoiceActivity } from './commands';
import { planAnswerSpeech, planReportSpeech, viewerPlayerState } from './speech';

/** The owner of a read the report viewer started. */
export const RESEARCH_OWNER = 'research';

const ours = () => speechPlayer().getState().owner === RESEARCH_OWNER;

export function useReportVoice(locale: string) {
  const speech = useSpeechState();
  const state = useMemo(() => viewerPlayerState(speech, RESEARCH_OWNER), [speech]);
  const [partial, setPartial] = useState(false);
  const last = useRef<SpeechRequest | null>(null);
  const lang: SpeechLocale = locale === 'en' || locale === 'ru' ? locale : 'ka';

  useEffect(() => () => speechPlayer().stop(RESEARCH_OWNER), []);

  const read = useCallback((text: string) => {
    const req: SpeechRequest = { owner: RESEARCH_OWNER, text, locale: lang };
    last.current = req;
    speechPlayer().play(req);
  }, [lang]);
  const readReport = useCallback((markdown: string) => {
    const plan = planReportSpeech(markdown);
    setPartial(plan.partial);
    read(plan.text);
  }, [read]);
  const readAnswer = useCallback((markdown: string) => {
    setPartial(false);
    read(planAnswerSpeech(markdown).text);
  }, [read]);

  const activity: VoiceActivity = state.status === 'loading' ? 'loading' : state.status === 'playing' ? 'playing' : state.status === 'paused' ? 'paused' : 'idle';

  return {
    state,
    activity,
    partial,
    /** Call inside the tap that will start a read after an await (a spoken answer). */
    prime: useCallback(() => speechPlayer().prime(), []),
    readReport,
    readAnswer,
    /** Read on from the chunk that failed (a read that never started is started again). Call it from the tap. */
    retry: useCallback(() => {
      if (ours() && speechPlayer().getState().status === 'failed' && last.current) speechPlayer().toggle(last.current);
    }, []),
    pause: useCallback(() => { if (ours()) speechPlayer().pause(); }, []),
    resume: useCallback(() => { if (ours()) speechPlayer().resume(); }, []),
    stop: useCallback(() => { speechPlayer().stop(RESEARCH_OWNER); setPartial(false); }, []),
  };
}
