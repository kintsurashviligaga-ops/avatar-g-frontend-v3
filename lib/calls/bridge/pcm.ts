/**
 * lib/calls/bridge/pcm.ts — the audio arithmetic between WhatsApp and Gemini Live. Pure, no I/O.
 *
 *   caller → WhatsApp WebRTC Opus → 48 kHz mono PCM → (÷3) → 16 kHz PCM → Gemini Live input
 *   Gemini Live output 24 kHz PCM → (×2) → 48 kHz mono PCM → 20 ms frames → Opus → caller
 *
 * Opus itself is decoded and encoded in the bridge's media adapter (services/wa-call-bridge); everything here is
 * 16-bit little-endian PCM, the format Gemini Live takes and returns ("audio/pcm;rate=16000" in, 24 kHz out).
 *
 * The resampler is a streaming polyphase FIR (windowed sinc), so chunk boundaries never click and anything above the
 * new Nyquist frequency is filtered out instead of folding back into the voice band.
 */

export const WA_RATE = 48_000;
export const LIVE_IN_RATE = 16_000;
export const LIVE_OUT_RATE = 24_000;
/** One Opus frame: 20 ms at 48 kHz. */
export const FRAME_48K = 960;

/** Base64 little-endian PCM16 → samples. An odd trailing byte is dropped. */
export function pcm16FromBase64(b64: string): Int16Array {
  const buf = Buffer.from(b64, 'base64');
  const out = new Int16Array(buf.length >> 1);
  for (let i = 0; i < out.length; i += 1) out[i] = buf.readInt16LE(i * 2);
  return out;
}

export function pcm16ToBase64(pcm: Int16Array): string {
  const buf = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length; i += 1) buf.writeInt16LE(pcm[i]!, i * 2);
  return buf.toString('base64');
}

/** Root mean square of a frame, 0..32768. */
export function rms(pcm: Int16Array): number {
  if (!pcm.length) return 0;
  let s = 0;
  for (let i = 0; i < pcm.length; i += 1) s += pcm[i]! * pcm[i]!;
  return Math.sqrt(s / pcm.length);
}

/** RMS in dBFS (silence → -Infinity). */
export function dbfs(pcm: Int16Array): number {
  const r = rms(pcm);
  return r > 0 ? 20 * Math.log10(r / 32768) : -Infinity;
}

const clamp16 = (v: number): number => (v > 32767 ? 32767 : v < -32768 ? -32768 : Math.round(v));

/**
 * Streaming rational resampler: rate × up ÷ down. Feed chunks of any length; the output is the same as feeding the
 * whole signal at once (the filter keeps its history between chunks). Delay: (taps − 1) / 2 samples at the
 * up-sampled rate.
 */
export class Resampler {
  private readonly h: Float64Array;
  private hist: Float64Array;
  /** Next output position, in the up-sampled domain, relative to the start of `hist`. */
  private pos: number;

  constructor(private readonly up: number, private readonly down: number, tapsPerPhase = 24) {
    if (!Number.isInteger(up) || !Number.isInteger(down) || up < 1 || down < 1) throw new Error('bad resampler ratio');
    const n = Math.max(up, down) * tapsPerPhase;
    // Cut-off just under the lower Nyquist frequency of the two rates, as a fraction of the up-sampled rate.
    const fc = 0.46 / Math.max(up, down);
    const h = new Float64Array(n);
    const mid = (n - 1) / 2;
    for (let j = 0; j < n; j += 1) {
      const x = j - mid;
      const sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
      const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * j) / (n - 1)) + 0.08 * Math.cos((4 * Math.PI * j) / (n - 1)); // Blackman
      h[j] = sinc * w;
    }
    // Unity gain at DC after zero-stuffing: each output sees 1/up of the taps, so scale the sum to `up`.
    let sum = 0;
    for (let j = 0; j < n; j += 1) sum += h[j]!;
    for (let j = 0; j < n; j += 1) h[j] = (h[j]! * up) / sum;
    this.h = h;
    this.hist = new Float64Array(Math.ceil(n / up));
    this.pos = this.hist.length * up;
  }

  process(input: Int16Array): Int16Array {
    const { up, down, h } = this;
    const n = h.length;
    const buf = new Float64Array(this.hist.length + input.length);
    buf.set(this.hist);
    for (let i = 0; i < input.length; i += 1) buf[this.hist.length + i] = input[i]!;
    const end = buf.length * up; // positions [0, end) are known (zero-stuffed between samples)
    const out: number[] = [];
    let p = this.pos;
    for (; p < end; p += down) {
      let acc = 0;
      // Only taps that land on a real (non-stuffed) sample contribute: (p − j) ≡ 0 (mod up).
      for (let j = p % up; j < n; j += up) {
        const q = p - j;
        if (q < 0) break;
        acc += h[j]! * buf[q / up]!;
      }
      out.push(acc);
    }
    const keep = this.hist.length;
    this.hist = buf.slice(buf.length - keep);
    this.pos = p - (buf.length - keep) * up;
    const res = new Int16Array(out.length);
    for (let i = 0; i < out.length; i += 1) res[i] = clamp16(out[i]!);
    return res;
  }
}

/** 48 kHz (WhatsApp) → 16 kHz (Gemini Live input). */
export const toLiveInput = (): Resampler => new Resampler(1, WA_RATE / LIVE_IN_RATE);
/** 24 kHz (Gemini Live output) → 48 kHz (WhatsApp). */
export const fromLiveOutput = (): Resampler => new Resampler(WA_RATE / LIVE_OUT_RATE, 1);
