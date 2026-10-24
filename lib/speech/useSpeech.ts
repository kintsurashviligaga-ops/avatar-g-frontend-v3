'use client';

/**
 * lib/speech/useSpeech.ts — the page's read-aloud state for React (lib/speech/player has the one player).
 *
 * Every speaker button reads the same state, so a button shows "reading" only while its own read is under way, and
 * stops showing it the moment another button's read (or Live) takes over.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { SpeechLocale } from './contract';
import { IDLE_SPEECH, isSpeaking, speechPlayer, type SpeechState } from './player';

const subscribe = (onChange: () => void) => speechPlayer().subscribe(onChange);
const snapshot = () => speechPlayer().getState();
const serverSnapshot = () => IDLE_SPEECH;

/** The state of the page's one player. */
export function useSpeechState(): SpeechState {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/**
 * One speaker button, named by `owner`: its status ('idle' while another owner's read is under way), and `toggle`,
 * which stops its read, tries its failed read again, or starts reading `text`.
 */
export function useSpeaker(owner: string) {
  const state = useSpeechState();
  const mine = state.owner === owner;
  const toggle = useCallback((text: string, locale: SpeechLocale) => speechPlayer().toggle({ owner, text, locale }), [owner]);
  const stop = useCallback(() => speechPlayer().stop(owner), [owner]);
  return {
    status: mine ? state.status : 'idle',
    speaking: mine && isSpeaking(state),
    state: mine ? state : IDLE_SPEECH,
    toggle,
    stop,
  } as const;
}
