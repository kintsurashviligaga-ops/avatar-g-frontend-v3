'use client';

/**
 * useReportVoice — the viewer's read-aloud, as a hook around ReadAloudPlayer (speech.ts): one player per open report, torn
 * down when the viewer closes or Live takes the microphone and speakers. `activity` is what commands.planReportCommand needs
 * to decide whether "stop" / "pause" / "resume" mean anything right now.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceActivity } from './commands';
import { browserSpeechDeps, planAnswerSpeech, planReportSpeech, ReadAloudPlayer, type PlayerState } from './speech';

const IDLE: PlayerState = { status: 'idle', index: 0, total: 0 };

export function useReportVoice(locale: string) {
  const [state, setState] = useState<PlayerState>(IDLE);
  const [partial, setPartial] = useState(false);
  const player = useRef<ReadAloudPlayer | null>(null);

  const get = useCallback((): ReadAloudPlayer => {
    if (!player.current) player.current = new ReadAloudPlayer(browserSpeechDeps(locale), setState);
    return player.current;
  }, [locale]);

  useEffect(() => () => { player.current?.dispose(); player.current = null; }, []);

  const readReport = useCallback((markdown: string) => {
    const plan = planReportSpeech(markdown);
    setPartial(plan.partial);
    get().start(plan.chunks);
  }, [get]);
  const readAnswer = useCallback((markdown: string) => {
    setPartial(false);
    get().start(planAnswerSpeech(markdown).chunks);
  }, [get]);

  const activity: VoiceActivity = state.status === 'loading' ? 'loading' : state.status === 'playing' ? 'playing' : state.status === 'paused' ? 'paused' : 'idle';

  return {
    state,
    activity,
    partial,
    /** Call inside the tap that will start a read after an await (a spoken answer). */
    prime: useCallback(() => get().prime(), [get]),
    readReport,
    readAnswer,
    pause: useCallback(() => player.current?.pause(), []),
    resume: useCallback(() => player.current?.resume(), []),
    stop: useCallback(() => { player.current?.stop(); setPartial(false); }, []),
  };
}
