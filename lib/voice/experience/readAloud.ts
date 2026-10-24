/**
 * lib/voice/experience/readAloud.ts — the read-aloud controls of one message (components/voice/experience/ReadAloudControls)
 * on the page's one player (lib/speech/player).
 *
 * The controls read a message as written: every character once and in order, nothing cut off and nothing skipped, at the
 * speed the user picks for that read. A chunk that fails stops the read there, and "try again" reads on from it. They used
 * to own a player of their own; now a read here stops any other read, and any other read (or Live taking the microphone)
 * stops this one. A read does not start while a Live call has the speakers.
 */
import type { SpeechLocale } from '@/lib/speech/contract';
import { speechPlayer, type SpeechPlayer, type SpeechRequest, type SpeechState } from '@/lib/speech/player';

export type ReaderStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'completed' | 'error';
export interface ReaderSnapshot { status: ReaderStatus; chunk: number; total: number; speed: number; error?: string }

/** The longest text one tap reads (the spend guard): longer is refused, not cut. */
export const READ_ALOUD_MAX_CHARS = 200_000;

/** The player's state as one message's controls show it: `chunk` counts from 1; another owner's read is idle here. */
export function readerSnapshot(s: SpeechState, owner: string, speed: number): ReaderSnapshot {
  if (s.owner !== owner || s.status === 'idle') return { status: 'idle', chunk: 0, total: 0, speed };
  if (s.status === 'done') return { status: 'completed', chunk: s.total, total: s.total, speed };
  if (s.status === 'failed') {
    return { status: 'error', chunk: s.total ? s.index + 1 : 0, total: s.total, speed, error: s.fault === 'live_call' ? 'live_call_active' : 'read_failed' };
  }
  return { status: s.status, chunk: s.index + 1, total: s.total, speed };
}

/** One message's controls, named by `owner`. Call `play` and `retry` from the tap: they unlock the audio inside it. */
export function createReadAloud(owner: string, locale: SpeechLocale, player: SpeechPlayer = speechPlayer()) {
  const mine = () => player.getState().owner === owner;
  let last: SpeechRequest | null = null;
  return {
    /** Read `text` at `speed`. False, and nothing read, for an empty or over-long text. */
    play(text: string, speed = 1): boolean {
      if (!text.trim() || text.length > READ_ALOUD_MAX_CHARS) return false;
      last = { owner, text, locale, rate: speed };
      player.play(last);
      return true;
    },
    /** Read on from the chunk that failed (a read that never started is started again). */
    retry(): void {
      if (mine() && player.getState().status === 'failed' && last) player.toggle(last);
    },
    pause: () => { if (mine()) player.pause(); },
    resume: () => { if (mine()) player.resume(); },
    stop: () => player.stop(owner),
    setSpeed: (speed: number) => { if (mine()) player.setRate(speed); },
  };
}
