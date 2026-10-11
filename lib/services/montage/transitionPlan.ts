/**
 * lib/services/montage/transitionPlan.ts — transitions between the shots of a planned montage (GG 2026-10-11 17:38Z:
 * „ქაფქათს და სხვა ფუნქციებს რაც აკლია"): which style goes where, how long each lasts, and where its frames come from.
 * PURE + TOTAL: no imports beyond the plan's own types, never throws.
 *
 * A transition is two shots OVERLAPPING (lib/video/surgicalOps runSequence: one `xfade` per boundary). Left alone that
 * overlap makes the edit shorter by its length at every boundary, and moves every later cut off its beat. So each one is
 * paid for with footage the shots did not use:
 *
 *   pre-roll   the incoming shot starts that much earlier in its clip: the transition ENDS where the hard cut was, so
 *              the frame the plan chose lands on its beat, and every later cut stays where it was;
 *   post-roll  else the outgoing shot plays that much longer: the transition STARTS where the cut was;
 *   shorter    else the longest transition the footage allows (never under MIN_DRAWN_SEC);
 *   overlap    else, when the length is free (no beat, no length asked), the shots overlap and the edit is shorter;
 *   cut        else the boundary stays a hard cut, and the summary counts it, so the card says so before Start.
 *
 * On the beat the planner leaves that footage free on purpose (./beatPlan `rollSec`), so every boundary gets its
 * transition whenever the clips are long enough. A photo has footage to spare by definition (its shot is just longer). Two consecutive windows of one clip that join
 * without a gap are one continuous stretch, not a boundary: no transition is drawn there.
 */
import { MAX_TRANSITION_SEC, type MontageTransition, type TransitionStyle } from './montagePlan';
import { TAIL_GUARD_SEC, TRANSITION_SHOT_SHARE } from './beatPlan';

/** The length a transition gets when none is asked: CapCut's own default, half a second. */
export const DEFAULT_TRANSITION_SEC = 0.5;
/** Shorter than this a transition reads as a glitched cut: the boundary stays a cut instead. */
export const MIN_DRAWN_SEC = 0.2;
/**
 * A transition takes at most this share of either shot it joins, so the middle of every shot is clean picture: the
 * montage QC looks for each clip there (lib/agent/media/montageAsk clipCheckPoints), and a shot that is all transition
 * is not a shot.
 */
export const MAX_SHOT_SHARE = TRANSITION_SHOT_SHARE;
/** „Different transitions" with no styles named: this cycle, one style per boundary. */
export const MIXED_STYLES: readonly TransitionStyle[] = ['crossfade', 'slide', 'zoom', 'wipe', 'flash', 'circle'];

export interface TransitionAsk {
  /** The styles in the order named, used in turn at each boundary (one style = every boundary). Never empty. */
  styles: TransitionStyle[];
  /** The length asked, in seconds; absent = DEFAULT_TRANSITION_SEC. */
  sec?: number;
  /** The styles were not named, only „different": MIXED_STYLES. */
  mixed?: boolean;
}

/** One planned shot, the fields this reads (lib/services/montage/beatPlan PlannedCut, ./joinPlan). */
export interface CutWindow {
  clip: number;
  startSec: number;
  endSec: number;
  speed?: number;
}

export interface TransitionInput {
  cuts: readonly CutWindow[];
  /** Each clip's real length (ignored for a photo). */
  clipDurationsSec: readonly number[];
  stills?: readonly boolean[];
  ask: TransitionAsk;
  /** The length is held (cuts on the beat, or a length asked): a boundary with no footage to spare stays a cut. */
  keepLength: boolean;
  maxShotSec: number;
}

/** The shot as the request carries it: its window (maybe longer by a pre- or post-roll) and the transition into it. */
export interface TransitionShot {
  startSec: number;
  endSec: number;
  transition: MontageTransition;
  transitionSec?: number;
}

export interface TransitionSummary {
  styles: TransitionStyle[];
  mixed: boolean;
  /** The length asked (or the default). */
  sec: number;
  /** Places one picture gives way to another (continuous stretches of one clip are not counted). */
  boundaries: number;
  applied: number;
  /** The shortest transition drawn, when one had to be shorter than asked to fit its footage. */
  minSec?: number;
  /** Kept as cuts: the shots there are too short for a transition worth seeing. */
  tooShort: number;
  /** Kept as cuts: no footage to spare there, and the length is held (the beat, or a length asked). */
  noFootage: number;
  /** How much shorter the edit is for overlaps no footage paid for (only when the length is free). */
  shortenedSec: number;
}

export interface TransitionResult {
  shots: TransitionShot[];
  summary: TransitionSummary;
  /** The edit's length with the transitions, folded the way the lane folds it. */
  totalSec: number;
}

const r3 = (n: number) => Number(n.toFixed(3));
/** Whole tenths (three frames at 30 fps), rounded DOWN: a transition never asks for footage it was not given. */
const tenthsDown = (n: number) => Math.floor(n * 10 + 1e-6) / 10;
const speedOf = (c: CutWindow) => (typeof c.speed === 'number' && Number.isFinite(c.speed) && c.speed > 0 ? c.speed : 1);
const outLen = (c: CutWindow) => Math.max(0, (c.endSec - c.startSec) / speedOf(c));

export function planTransitions(input: TransitionInput): TransitionResult {
  const n = input.cuts.length;
  const styles = input.ask.styles.length ? [...input.ask.styles] : ['crossfade' as const];
  const askedSec = typeof input.ask.sec === 'number' && Number.isFinite(input.ask.sec) ? input.ask.sec : DEFAULT_TRANSITION_SEC;
  const want = Math.max(MIN_DRAWN_SEC, Math.min(MAX_TRANSITION_SEC, askedSec));
  const still = (k: number) => input.stills?.[input.cuts[k]!.clip] === true;
  // Working windows (start/end move with the rolls); the ORIGINAL lengths set every cap, so one boundary's roll never
  // lets the next one take more of a shot than its share.
  const win = input.cuts.map((c) => ({ startSec: c.startSec, endSec: c.endSec }));
  const orig = input.cuts.map(outLen);
  const shots: TransitionShot[] = input.cuts.map((c) => ({ startSec: c.startSec, endSec: c.endSec, transition: 'cut' }));
  const summary: TransitionSummary = {
    styles, mixed: input.ask.mixed === true, sec: r3(want), boundaries: 0, applied: 0, tooShort: 0, noFootage: 0, shortenedSec: 0,
  };
  const lenNow = (k: number) => Math.max(0, (win[k]!.endSec - win[k]!.startSec) / speedOf(input.cuts[k]!));
  const sourceEnd = (k: number) => {
    const d = input.clipDurationsSec[input.cuts[k]!.clip];
    return Number.isFinite(d) && (d as number) > 0 ? (d as number) - TAIL_GUARD_SEC : win[k]!.endSec;
  };
  /** Would this window of shot k show footage another shot of the same clip already shows? */
  const repeats = (k: number, s: number, e: number) => input.cuts.some((c, j) => j !== k && c.clip === input.cuts[k]!.clip && !still(k)
    && s < win[j]!.endSec - 1e-6 && e > win[j]!.startSec + 1e-6);
  /** Output seconds shot k can start earlier by (a photo: as long as it stays one shot). */
  const preRoom = (k: number) => {
    const head = input.maxShotSec - lenNow(k);
    if (still(k)) return Math.max(0, head);
    return Math.max(0, Math.min(head, win[k]!.startSec / speedOf(input.cuts[k]!)));
  };
  const postRoom = (k: number) => {
    const head = input.maxShotSec - lenNow(k);
    if (still(k)) return Math.max(0, head);
    return Math.max(0, Math.min(head, (sourceEnd(k) - win[k]!.endSec) / speedOf(input.cuts[k]!)));
  };
  const pre = (k: number, dd: number) => {
    if (still(k)) { win[k]!.endSec = r3(win[k]!.endSec + dd); return; }
    win[k]!.startSec = r3(win[k]!.startSec - dd * speedOf(input.cuts[k]!));
  };
  const post = (k: number, dd: number) => { win[k]!.endSec = r3(win[k]!.endSec + dd * (still(k) ? 1 : speedOf(input.cuts[k]!))); };
  const preOk = (k: number, dd: number) => still(k) || !repeats(k, win[k]!.startSec - dd * speedOf(input.cuts[k]!), win[k]!.endSec);
  const postOk = (k: number, dd: number) => still(k) || !repeats(k, win[k]!.startSec, win[k]!.endSec + dd * speedOf(input.cuts[k]!));

  let turn = 0;
  for (let k = 1; k < n; k += 1) {
    const a = input.cuts[k - 1]!, b = input.cuts[k]!;
    // One clip running on across a shot boundary (a long clip split into shots): nothing changes there.
    if (a.clip === b.clip && !still(k) && Math.abs(b.startSec - a.endSec) < 1e-3 && speedOf(a) === speedOf(b)) continue;
    summary.boundaries += 1;
    const style = styles[turn % styles.length]!;
    turn += 1;
    const dd0 = tenthsDown(Math.min(want, MAX_SHOT_SHARE * orig[k - 1]!, MAX_SHOT_SHARE * orig[k]!));
    if (dd0 < MIN_DRAWN_SEC - 1e-9) { summary.tooShort += 1; continue; }
    let dd = 0;
    const roomIn = preRoom(k), roomOut = postRoom(k - 1);
    if (roomIn >= dd0 - 1e-9 && preOk(k, dd0)) { dd = dd0; pre(k, dd); }
    else if (roomOut >= dd0 - 1e-9 && postOk(k - 1, dd0)) { dd = dd0; post(k - 1, dd); }
    else {
      const inFit = tenthsDown(Math.min(dd0, roomIn)), outFit = tenthsDown(Math.min(dd0, roomOut));
      if (inFit >= outFit && inFit >= MIN_DRAWN_SEC - 1e-9 && preOk(k, inFit)) { dd = inFit; pre(k, dd); }
      else if (outFit >= MIN_DRAWN_SEC - 1e-9 && postOk(k - 1, outFit)) { dd = outFit; post(k - 1, dd); }
      else if (!input.keepLength) { dd = dd0; summary.shortenedSec = r3(summary.shortenedSec + dd); }
      else { summary.noFootage += 1; continue; }
    }
    shots[k]!.transition = style;
    shots[k]!.transitionSec = r3(dd);
    summary.applied += 1;
    if (dd + 1e-9 < want && (summary.minSec === undefined || dd < summary.minSec)) summary.minSec = r3(dd);
  }
  win.forEach((w, k) => { shots[k]!.startSec = r3(w.startSec); shots[k]!.endSec = r3(w.endSec); });

  // The length, folded as the lane folds it: every transition overlaps by exactly its own length (it is within half of
  // either side by MAX_SHOT_SHARE, so the fold's own clamp never shortens it).
  let total = 0;
  shots.forEach((s, k) => {
    const len = (s.endSec - s.startSec) / speedOf(input.cuts[k]!);
    total += k === 0 || s.transition === 'cut' ? len : len - (s.transitionSec ?? 0);
  });
  return { shots, summary, totalSec: r3(total) };
}
