/**
 * lib/music/producer/peaks.ts — the waveform the Music Card draws. Pure, browser-safe.
 *
 * The browser decodes the MP3 (AudioContext.decodeAudioData) and hands the channels here; we return `bars` heights in
 * 0–1. Each bar is the loudest sample in its slice, averaged over channels, then scaled so the loudest bar is 1. A
 * silent track returns flat zeros (never NaN).
 */
export function computePeaks(channels: ReadonlyArray<ArrayLike<number>>, bars: number): number[] {
  const n = Math.max(1, Math.floor(bars));
  const len = channels.length ? Math.min(...channels.map((c) => c.length)) : 0;
  const out = new Array<number>(n).fill(0);
  if (!len) return out;
  for (let b = 0; b < n; b++) {
    const from = Math.floor((b * len) / n);
    const to = Math.max(from + 1, Math.floor(((b + 1) * len) / n));
    let sum = 0;
    for (const ch of channels) {
      let peak = 0;
      for (let i = from; i < to && i < len; i++) {
        const v = Math.abs(ch[i] ?? 0);
        if (v > peak) peak = v;
      }
      sum += peak;
    }
    out[b] = sum / channels.length;
  }
  const max = Math.max(...out);
  return max > 0 ? out.map((v) => Math.round((v / max) * 1000) / 1000) : out;
}

/** The bar index a tap at `x` (0–1 of the width) seeks to, and the time. */
export function seekAt(x: number, durationSec: number): number {
  const f = Math.min(1, Math.max(0, x));
  return Math.round(f * durationSec * 100) / 100;
}
