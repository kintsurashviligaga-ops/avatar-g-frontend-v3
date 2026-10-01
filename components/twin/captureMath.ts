/**
 * components/twin/captureMath.ts — the pure arithmetic behind TwinCapture (crop, downscale, the voice timer's rules, the
 * level meter), kept out of the component so it is tested without a camera, a microphone or a canvas.
 */
import { TWIN_LIMITS } from '@/lib/twin/types';

/** The photo frame: 3:4 portrait, the shape of the oval guide and of the presenter cards. */
export const PHOTO_ASPECT = 3 / 4;
export const COUNTDOWN_FROM = 3;

/** The centred source rectangle of a `w`×`h` frame with the given aspect (width / height). */
export function centerCrop(w: number, h: number, aspect: number = PHOTO_ASPECT): { sx: number; sy: number; sw: number; sh: number } {
  if (!(w > 0) || !(h > 0)) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  if (w / h > aspect) {
    const sw = Math.round(h * aspect);
    return { sx: Math.round((w - sw) / 2), sy: 0, sw, sh: h };
  }
  const sh = Math.round(w / aspect);
  return { sx: 0, sy: Math.round((h - sh) / 2), sw: w, sh };
}

/** Scale `w`×`h` down so the longest edge is at most `max` (never up — a small photo stays small). */
export function fitWithin(w: number, h: number, max: number = TWIN_LIMITS.photoMaxEdgePx): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: 0, height: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** The Stop button unlocks at the 12 s minimum — a shorter sample is not enough voice to be worth keeping. */
export function canStopRecording(elapsedMs: number): boolean {
  return elapsedMs >= TWIN_LIMITS.voiceMinSec * 1000;
}

/** The recorder stops itself at 30 s, so a forgotten tab never records on (or uploads a long file). */
export function shouldAutoStop(elapsedMs: number): boolean {
  return elapsedMs >= TWIN_LIMITS.voiceMaxSec * 1000;
}

/** `m:ss` for the recording timer. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 0…1 loudness from an AnalyserNode's time-domain bytes (128 = silence), scaled so speech fills most of the bar. */
export function levelFromSamples(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = ((samples[i] ?? 128) - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

/** `40917263` → `4091 7263` — two groups are easier to read aloud than eight digits in a row. */
export function groupDigits(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/**
 * The first recording type this browser supports, in the order MediaRecorder implementations prefer (Chrome / Android
 * webm-opus, Firefox ogg, Safari mp4). null → no voice slot is requested and the voice step offers a skip.
 */
export function pickVoiceMime(isTypeSupported: ((t: string) => boolean) | null | undefined): string | null {
  if (typeof isTypeSupported !== 'function') return null;
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg']) {
    try {
      if (isTypeSupported(t)) return t;
    } catch {
      /* a throwing probe is a "no" */
    }
  }
  return null;
}
