/**
 * lib/services/montage/insertPlan.ts — cutaway footage over a speaker, in a split screen (GG 2026-11-05 14:32Z).
 *
 * GG's reference (a 13 s news Reel): the presenter talks the whole time, and on most of his sentences the TOP half of
 * the frame shows footage of what he is talking about, a cyan line under it, the presenter in the bottom half; between
 * those the presenter fills the frame again. His voice never stops. This plans WHERE each cutaway lands:
 *
 *   · one cutaway per spoken line (the line's own start, a breath after it, so the cut follows the words);
 *   · 1.2–3 s each, never past the line's end, never in the first or last second of the edit (the hook and the end stay
 *     on the speaker), and a gap of at least a second between two cutaways (the viewer sees the speaker again);
 *   · each line's footage is the clip matched to it (`clip`), else the next clip not used yet, in the order sent;
 *   · the clip plays from its middle (a stock clip's first and last frames are its weakest), or from where it was asked.
 *
 * Times are on the MASTER's timeline and on its 30 fps grid, so the overlay (./insertCompose) switches exactly on a
 * frame. Pure and total: no I/O, never throws.
 */
import { OUTPUT_FPS } from './beatPlan';

export interface InsertLine {
  /** On the master's timeline. */
  startSec: number;
  endSec: number;
  /** What is said, as heard (for the card: why this footage is here). */
  text: string;
  /** The footage chosen for this line (index into `clips`); absent = the next unused clip. */
  clip?: number;
}

export interface InsertClip {
  durationSec: number;
  /** Where in the clip to start (seconds); absent = its middle. */
  fromSec?: number;
}

export interface PlannedInsert {
  startSec: number;
  endSec: number;
  clip: number;
  /** Where in the clip the cutaway starts. */
  clipStartSec: number;
  /** Index of the line it covers. */
  line: number;
  text: string;
}

export interface InsertPlanInput {
  masterSec: number;
  lines: readonly InsertLine[];
  clips: readonly InsertClip[];
  minSec?: number;
  maxSec?: number;
  gapSec?: number;
  edgeSec?: number;
}

export const INSERT_MIN_SEC = 1.2;
export const INSERT_MAX_SEC = 3;
/** The cut comes this long after the line starts: the word is heard first, then the picture answers it. */
const LEAD_SEC = 0.15;

const up = (s: number) => Math.ceil(s * OUTPUT_FPS - 1e-6) / OUTPUT_FPS;
const down = (s: number) => Math.floor(s * OUTPUT_FPS + 1e-6) / OUTPUT_FPS;
const r3 = (n: number) => Number(n.toFixed(3));
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function planInserts(input: InsertPlanInput): PlannedInsert[] {
  const minSec = input.minSec ?? INSERT_MIN_SEC;
  const maxSec = input.maxSec ?? INSERT_MAX_SEC;
  const gapSec = input.gapSec ?? 0.6;
  const edgeSec = input.edgeSec ?? 1;
  const master = fin(input.masterSec) ? input.masterSec : 0;
  const clips = input.clips;
  if (!(master > 2 * edgeSec + minSec) || !clips.length) return [];

  const lines = input.lines
    .map((l, i) => ({ ...l, i }))
    .filter((l) => fin(l.startSec) && fin(l.endSec) && l.endSec > l.startSec)
    .sort((a, b) => a.startSec - b.startSec);
  const used = new Set<number>();
  const out: PlannedInsert[] = [];
  let nextFree = 0;
  let lastEnd = -Infinity;
  for (const l of lines) {
    let clip = Number.isInteger(l.clip) && l.clip! >= 0 && l.clip! < clips.length ? l.clip! : -1;
    if (clip < 0) {
      // The next clip nobody has used; when all are used, they come round again.
      for (let k = 0; k < clips.length && clip < 0; k += 1) {
        const c = (nextFree + k) % clips.length;
        if (!used.has(c) || used.size >= clips.length) clip = c;
      }
    }
    if (clip < 0) continue;
    const c = clips[clip]!;
    const start = up(Math.max(l.startSec + LEAD_SEC, edgeSec, lastEnd + gapSec));
    const limit = Math.min(l.endSec, master - edgeSec, start + maxSec, start + (fin(c.durationSec) ? c.durationSec : 0));
    const end = down(limit);
    if (end - start < minSec - 1e-6) continue;
    const len = end - start;
    const room = Math.max(0, (c.durationSec || 0) - len);
    const clipStart = fin(c.fromSec) ? Math.min(Math.max(0, c.fromSec), room) : room / 2;
    out.push({ startSec: r3(start), endSec: r3(end), clip, clipStartSec: r3(clipStart), line: l.i, text: l.text });
    used.add(clip);
    nextFree = (clip + 1) % clips.length;
    lastEnd = end;
  }
  return out;
}

/** How much of the edit the cutaways cover (0..1): the card says it, the QC skips those windows on the speaker. */
export function insertShare(inserts: readonly PlannedInsert[], masterSec: number): number {
  if (!(masterSec > 0)) return 0;
  return r3(inserts.reduce((s, x) => s + (x.endSec - x.startSec), 0) / masterSec);
}

/** Is a master time inside a cutaway? */
export function inInsert(inserts: readonly PlannedInsert[], t: number): PlannedInsert | null {
  return inserts.find((x) => t >= x.startSec - 1e-6 && t < x.endSec + 1e-6) ?? null;
}
