/**
 * lib/calls/bridge/meter.ts — the measurements one call reports (lib/calls/whatsapp/lifecycle CallMetrics).
 *
 * Reply latency is measured where the caller feels it: from the end of their speech (an energy detector on the
 * 16 kHz input, used ONLY for this measurement; Gemini's own voice activity detection decides the turns) to the first
 * answer frame handed to WhatsApp. Token counts are Gemini's usageMetadata, summed per message: each turn's prompt
 * count already includes the context re-read that turn, which is what Google bills.
 */
import type { CallMetrics } from '@/lib/calls/whatsapp/lifecycle';
import { dbfs } from './pcm';

/** Below this the caller is treated as silent (phone speech sits around -30…-15 dBFS). */
export const SPEECH_DBFS = -45;
/** Silence this long after speech = the end of an utterance. */
const HANGOVER_MS = 300;
const KEEP = 500;

const pct = (xs: readonly number[], p: number): number | undefined => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};

const push = (xs: number[], v: number) => {
  if (!Number.isFinite(v) || v < 0) return;
  xs.push(v);
  if (xs.length > KEEP) xs.shift();
};

export class CallMeter {
  private reply: number[] = [];
  private inPath: number[] = [];
  private outPath: number[] = [];
  bargeIns = 0;
  reconnects = 0;
  promptTokens = 0;
  responseTokens = 0;
  totalTokens = 0;

  private speaking = false;
  private lastVoiceAt = 0;
  /** End of the caller's last utterance not yet answered (0 = none pending). */
  private pendingSpeechEnd = 0;

  /** One 16 kHz input chunk, as it is handed to Gemini. */
  heardChunk(pcm16k: Int16Array, at: number): void {
    const voiced = dbfs(pcm16k) > SPEECH_DBFS;
    if (voiced) {
      this.speaking = true;
      this.lastVoiceAt = at;
      this.pendingSpeechEnd = 0;
    } else if (this.speaking && at - this.lastVoiceAt >= HANGOVER_MS) {
      this.speaking = false;
      this.pendingSpeechEnd = this.lastVoiceAt;
    }
  }

  /** The first frame of an answer was handed to WhatsApp. */
  answerStarted(at: number): void {
    // An answer that starts inside the hangover still ends the utterance at its last voiced chunk.
    const end = this.pendingSpeechEnd || this.lastVoiceAt;
    if (end && at >= end) push(this.reply, at - end);
    this.pendingSpeechEnd = 0;
    this.lastVoiceAt = 0;
    this.speaking = false;
  }

  inputPath(ms: number): void { push(this.inPath, ms); }
  outputPath(ms: number): void { push(this.outPath, ms); }

  usage(u: { prompt?: number; response?: number; total?: number }): void {
    this.promptTokens += u.prompt ?? 0;
    this.responseTokens += u.response ?? 0;
    this.totalTokens += u.total ?? (u.prompt ?? 0) + (u.response ?? 0);
  }

  snapshot(): CallMetrics {
    const m: CallMetrics = { bargeIns: this.bargeIns, reconnects: this.reconnects, promptTokens: this.promptTokens, responseTokens: this.responseTokens, totalTokens: this.totalTokens };
    const r50 = pct(this.reply, 50); if (r50 !== undefined) m.replyLatencyP50Ms = r50;
    const r95 = pct(this.reply, 95); if (r95 !== undefined) m.replyLatencyP95Ms = r95;
    const i50 = pct(this.inPath, 50); if (i50 !== undefined) m.inputPathP50Ms = i50;
    const o50 = pct(this.outPath, 50); if (o50 !== undefined) m.outputPathP50Ms = o50;
    return m;
  }
}
