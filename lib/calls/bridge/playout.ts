/**
 * lib/calls/bridge/playout.ts — what Agent G says, queued as 20 ms frames and sent to the caller in real time.
 *
 * Gemini sends its answer faster than real time, so seconds of speech can be waiting here. When the caller talks over
 * Agent G, Gemini sends `interrupted`, and `flush()` drops everything not yet sent: the caller hears Agent G stop
 * within one frame instead of finishing a sentence nobody is listening to (barge-in).
 */
import { FRAME_48K } from './pcm';

export interface PlayoutFrame {
  pcm: Int16Array;
  /** When the Gemini chunk this frame came from arrived (for the output-path latency). */
  receivedAt: number;
  /** The first frame of a new answer (for the reply latency). */
  firstOfTurn: boolean;
}

/** At most 60 s of answer waiting; older audio is dropped first (a runaway stream must not grow memory). */
const MAX_FRAMES = 3000;

export class Playout {
  private frames: PlayoutFrame[] = [];
  private partial: Int16Array = new Int16Array(0);
  private partialAt = 0;
  private turnOpen = false;

  /** Queue 48 kHz PCM. `newTurn` marks the first audio of an answer. */
  push(pcm48: Int16Array, receivedAt: number, newTurn: boolean): void {
    if (newTurn) this.turnOpen = true;
    const joined = new Int16Array(this.partial.length + pcm48.length);
    joined.set(this.partial);
    joined.set(pcm48, this.partial.length);
    const at = this.partial.length ? this.partialAt : receivedAt;
    let i = 0;
    for (; i + FRAME_48K <= joined.length; i += FRAME_48K) {
      this.frames.push({ pcm: joined.slice(i, i + FRAME_48K), receivedAt: i === 0 ? at : receivedAt, firstOfTurn: this.turnOpen });
      this.turnOpen = false;
    }
    this.partial = joined.slice(i);
    this.partialAt = this.partial.length ? receivedAt : 0;
    if (this.frames.length > MAX_FRAMES) this.frames.splice(0, this.frames.length - MAX_FRAMES);
  }

  /** The end of an answer: pad the last partial frame with silence so it is sent too. */
  endTurn(): void {
    if (!this.partial.length) return;
    const pcm = new Int16Array(FRAME_48K);
    pcm.set(this.partial);
    this.frames.push({ pcm, receivedAt: this.partialAt, firstOfTurn: this.turnOpen });
    this.turnOpen = false;
    this.partial = new Int16Array(0);
  }

  next(): PlayoutFrame | null {
    return this.frames.shift() ?? null;
  }

  /** Barge-in: drop what is not sent yet. Returns how many 20 ms frames were dropped. */
  flush(): number {
    const dropped = this.frames.length + (this.partial.length ? 1 : 0);
    this.frames = [];
    this.partial = new Int16Array(0);
    this.turnOpen = false;
    return dropped;
  }

  get queuedMs(): number {
    return this.frames.length * 20;
  }
}

/** 20 ms of silence (sent while Agent G is quiet, so the caller's jitter buffer keeps a steady stream). */
export const SILENCE_FRAME = new Int16Array(FRAME_48K);
