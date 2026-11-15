/**
 * lib/music/producer/extend.ts — "Add 30 s (new section, same style)". Pure: the plan and the ffmpeg arguments.
 *
 * LYRIA CANNOT CONTINUE A TRACK. Neither Lyria 3 model on Vertex takes audio input, and Google's docs say iterative
 * editing of a generated clip is not supported. So a true extension (the same melody carried on) is impossible today.
 * What we do instead, and say on the button:
 *   1. Ask Lyria 3 Clip for 30 s more with the SAME genre, moods, instruments, tempo and (when known) key, written as the
 *      next section: no intro, starts at full energy, ends with a clear ending.
 *   2. Cut the current track at its last whole bar before the fade-out tail, and crossfade the new part in over two bars
 *      (ffmpeg acrossfade), so the join lands on the beat.
 * The melody of the new part is NEW. If Google ever accepts audio input, only this file and the route change.
 */
import { CLIP_SEC, type ProducerSpec } from './spec';

/** A finished track may grow to 8 minutes (Suno v6's ceiling) by repeated extends. */
export const MAX_TOTAL_SEC = 480;
/** Tempo we assume for the bar grid when the user set none (a common pop tempo). */
export const DEFAULT_BPM = 100;
/** Lyria clips end with a fade; we cut before it. */
export const TAIL_SEC = 1.5;

export const barSec = (bpm: number): number => (4 * 60) / bpm;

export interface ExtendPlan {
  bpm: number;
  /** Where the current track is cut (a whole bar). */
  cutAtSec: number;
  /** Crossfade length: two bars, kept within 1–4 s. */
  crossfadeSec: number;
  addSec: number;
  totalSec: number;
}

export type ExtendCheck = { ok: true; plan: ExtendPlan } | { ok: false; reason: 'too_long' | 'too_short' };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function planExtend(currentSec: number, bpm: number | null, addSec: number = CLIP_SEC): ExtendCheck {
  const tempo = bpm && bpm > 0 ? bpm : DEFAULT_BPM;
  const bar = barSec(tempo);
  if (!(currentSec > bar * 2 + TAIL_SEC)) return { ok: false, reason: 'too_short' };
  const cutAtSec = r3(Math.floor((currentSec - TAIL_SEC) / bar) * bar);
  const crossfadeSec = r3(Math.min(4, Math.max(1, bar * 2)));
  const totalSec = r3(cutAtSec + addSec - crossfadeSec);
  if (totalSec > MAX_TOTAL_SEC) return { ok: false, reason: 'too_long' };
  return { ok: true, plan: { bpm: tempo, cutAtSec, crossfadeSec, addSec, totalSec } };
}

export const CONTINUE_DIRECTION =
  'Continue the same piece as its next section: same key, same tempo, same instruments and the same sound. '
  + 'No intro and no fade-in; start at full energy, as if mid-song, and end with a clear, natural ending.';

/** The spec the new 30 s is made from: the original's choices, clip length, and the continuation direction. */
export function extendSpec(spec: ProducerSpec, part: number): ProducerSpec {
  const brief = [spec.brief, `${CONTINUE_DIRECTION} This is part ${part + 1}.`].filter(Boolean).join(' ');
  return {
    ...spec,
    brief: brief.slice(0, 1000),
    // A sung extension writes new lines in the same style; the user's own lyrics were sung in the first part.
    lyrics: '',
    autoLyrics: spec.vocals,
    lengthSec: CLIP_SEC,
  };
}

/** ffmpeg arguments that cut `a` at the bar and crossfade `b` in. Output MP3 192 kbps, Lyria's own format. */
export function joinArgs(a: string, b: string, out: string, plan: ExtendPlan): string[] {
  const filter = `[0:a]atrim=0:${plan.cutAtSec},asetpts=N/SR/TB[a0];[a0][1:a]acrossfade=d=${plan.crossfadeSec}:c1=tri:c2=tri[out]`;
  return ['-hide_banner', '-y', '-i', a, '-i', b, '-filter_complex', filter, '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '192k', out];
}
