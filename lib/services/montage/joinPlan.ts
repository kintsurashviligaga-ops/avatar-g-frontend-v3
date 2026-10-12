/**
 * lib/services/montage/joinPlan.ts — a montage with NO music: the pictures joined in the user's order, each clip with
 * its own sound.
 *
 * GG 2026-10-11 17:38Z: „თუ მუსიკა არ ავტვირთე, ვიდეოს დამონტაჟებას არ იწყებს". A beat plan (./beatPlan) cuts every
 * clip into beat-long shots and takes them in turns: right for a song, wrong without one, where the clips' own sound
 * (a voice, the street, the sea) is what plays and a two-second slice of speech is noise. So without a track:
 *
 *   · every clip is ONE stretch, in the order sent (a clip longer than one shot plays on as consecutive shots, cut
 *     where nothing changes), and every photo shows for STILL_SHOT_SEC (the lane turns it into a slow zoom);
 *   · with no length asked, every clip plays whole; past one edit's ceiling, each clip gives the same share of itself,
 *     from its middle, and the card says so (`shortened`);
 *   · an asked length is binding, as on the beat plan (Media Studio v2.0 §D): each clip gives the same share of its
 *     length from its middle and photos keep their time, to the output frame; footage too short or a length past one
 *     edit is refused with the numbers, never met by a quietly shorter master.
 *
 * Pure and total: no I/O, never throws. Returns the beat plan's own CutPlan shape (no beat, no music), so the request,
 * the manifest, the QC and the card read it exactly as they read a beat plan.
 */
import { OUTPUT_FPS, type CutPlan, type CutProblem, type PlannedCut } from './beatPlan';

/** How long a photo shows when nothing else decides it. */
export const STILL_SHOT_SEC = 3;
/** The shortest a photo may be squeezed to when an asked length is short. */
export const MIN_STILL_SEC = 1.5;
/** A clip's last frames can be missing in a real file: never plan to read its very end (beatPlan TAIL_GUARD_SEC). */
const TAIL_GUARD_SEC = 0.05;

export interface JoinInput {
  /** Each picture's real length in seconds, in the order sent (a photo's entry is ignored). */
  clipDurationsSec: readonly number[];
  /** Which pictures are photos (parallel to clipDurationsSec). */
  stills?: readonly boolean[];
  /** The length asked for; binding when present. */
  targetSec?: number;
  maxShots: number;
  maxTotalSec: number;
  minShotSec: number;
  maxShotSec: number;
}

const r3 = (n: number) => Number(n.toFixed(3));
const frames = (sec: number) => Math.round(sec * OUTPUT_FPS);
/** A clip's usable length in whole frames: rounded DOWN, so a stretch never reads past the tail guard. */
const fl = (sec: number) => Math.floor(sec * OUTPUT_FPS + 1e-6);
const up1 = (n: number) => Math.ceil(n * 10 - 1e-6) / 10;

function fail(error: string, problem?: CutProblem): CutPlan {
  return {
    ok: false, error, ...(problem ? { problem } : {}), cuts: [], musicStartSec: 0, leadInSec: 0, totalSec: 0,
    beatSynced: false, bpm: null, unitSec: 1 / OUTPUT_FPS, beatsPerShot: 0, unusedClips: [],
  };
}

/** What the join did beyond playing every clip whole: each clip's share, when one edit could not hold them all. */
export interface JoinPlan extends CutPlan {
  /** Set when no length was asked and the clips together run past one edit: every clip gives this share of itself. */
  shortened?: { footageSec: number; maxSec: number; share: number };
}

/**
 * Each picture's length on the master, in frames: photos `stillF` each, videos the same share of their own length,
 * so that the whole is exactly `wantF`. Null when it cannot be met inside the limits.
 */
function shareOut(lens: readonly number[], still: readonly boolean[], wantF: number, minF: number, stillF: number, minStillF: number, maxStillF: number): number[] | null {
  const vids = lens.map((_, i) => i).filter((i) => !still[i]);
  const pics = lens.map((_, i) => i).filter((i) => still[i]);
  const out = lens.map(() => 0);
  const footF = vids.reduce((s, i) => s + fl(lens[i]!), 0);
  // Photos first take their usual time, then give it up (to MIN_STILL_SEC) or take more (up to a shot) as needed.
  let photoF = stillF;
  if (!vids.length) {
    photoF = Math.floor(wantF / pics.length);
    if (photoF < minStillF || photoF > maxStillF) return null;
  } else if (wantF - pics.length * stillF > footF) {
    photoF = Math.min(maxStillF, Math.ceil((wantF - footF) / Math.max(1, pics.length)));
  } else if (wantF - pics.length * stillF < vids.length * minF) {
    photoF = Math.max(minStillF, Math.floor((wantF - vids.length * minF) / Math.max(1, pics.length)));
  }
  for (const i of pics) out[i] = photoF;
  let left = wantF - pics.length * photoF;
  if (vids.length) {
    if (left < vids.length * minF || left > footF) return null;
    // The same share of every clip, at least the shortest shot each; the frames rounding leaves go to the last clips.
    const share = left / footF;
    for (const i of vids) out[i] = Math.max(minF, Math.min(fl(lens[i]!), Math.floor(fl(lens[i]!) * share)));
    left -= vids.reduce((s, i) => s + out[i]!, 0);
    for (let k = vids.length - 1; k >= 0 && left !== 0; k -= 1) {
      const i = vids[k]!;
      const room = left > 0 ? fl(lens[i]!) - out[i]! : out[i]! - minF;
      const d = Math.sign(left) * Math.min(Math.abs(left), Math.max(0, room));
      out[i] = out[i]! + d;
      left -= d;
    }
  } else {
    // Photos only: the frames the even split leaves go to the last photos, one each.
    for (let k = pics.length - 1; k >= 0 && left > 0; k -= 1) { out[pics[k]!] = out[pics[k]!]! + 1; left -= 1; }
  }
  return left === 0 ? out : null;
}

/** Join the pictures in their order with their own sound (no beat). Every picture gets a shot, or no plan. */
export function planJoin(input: JoinInput): JoinPlan {
  const n = input.clipDurationsSec.length;
  if (!n) return fail('no clips');
  if (n > input.maxShots) return fail(`${n} clips need ${n} shots; an edit takes at most ${input.maxShots}`, { kind: 'too_many_clips', clips: n, maxShots: input.maxShots });
  const still = input.clipDurationsSec.map((_, i) => input.stills?.[i] === true);
  const frameSec = 1 / OUTPUT_FPS;
  const minF = frames(input.minShotSec + frameSec) + 1;
  const maxShotF = frames(input.maxShotSec - frameSec);
  const stillF = frames(STILL_SHOT_SEC);
  const minStillF = Math.max(minF, frames(MIN_STILL_SEC));
  const lens = input.clipDurationsSec.map((d, i) => (still[i] ? 0 : Number.isFinite(d) && d > 0 ? Math.max(0, d - TAIL_GUARD_SEC) : 0));
  const short = lens.flatMap((len, i) => (!still[i] && fl(len) < minF ? [i] : []));
  if (short.length) {
    return fail(`clip ${short.map((c) => c + 1).join(', ')} shorter than one shot`, { kind: 'clip_too_short', clips: short, minShotSec: up1(minF / OUTPUT_FPS + TAIL_GUARD_SEC) });
  }
  const pics = still.filter(Boolean).length;
  const footageSec = lens.reduce((s, len) => s + len, 0);
  const naturalF = lens.reduce((s, len, i) => s + (still[i] ? stillF : fl(len)), 0);
  const maxF = frames(input.maxTotalSec);

  const explicit = Number.isFinite(input.targetSec) && (input.targetSec ?? 0) > 0;
  let wantF: number;
  let shortened: JoinPlan['shortened'];
  if (explicit) {
    const asked = input.targetSec!;
    if (asked > input.maxTotalSec + 1e-6) {
      return fail(`the length asked (${r3(asked)}s) is longer than one edit (${input.maxTotalSec}s)`, { kind: 'target_too_long', targetSec: r3(asked), maxSec: input.maxTotalSec });
    }
    wantF = frames(asked);
    const neededF = (n - pics) * minF + pics * minStillF;
    if (wantF < neededF) {
      return fail(`the length asked (${r3(asked)}s) is shorter than the ${up1(neededF / OUTPUT_FPS)}s ${n} picture(s) need`, { kind: 'target_too_short', clips: n, targetSec: r3(asked), neededSec: up1(neededF / OUTPUT_FPS) });
    }
    const roomF = lens.reduce((s, len, i) => s + (still[i] ? maxShotF : fl(len)), 0);
    if (wantF > roomF) {
      return fail(`the clips together last ${r3(footageSec)}s, shorter than the ${r3(asked)}s asked`, { kind: 'footage_too_short', clips: n, footageSec: r3(footageSec), targetSec: r3(asked) });
    }
  } else if (naturalF > maxF) {
    wantF = maxF;
    shortened = { footageSec: r3(footageSec), maxSec: input.maxTotalSec, share: r3((maxF - pics * stillF) / Math.max(1, naturalF - pics * stillF)) };
  } else {
    wantF = naturalF;
  }

  const shares = shareOut(lens, still, wantF, minF, stillF, minStillF, maxShotF);
  if (!shares) {
    return fail(`the pictures cannot fill ${r3(wantF / OUTPUT_FPS)}s`, { kind: 'footage_too_short', clips: n, footageSec: r3(footageSec), targetSec: r3(wantF / OUTPUT_FPS) });
  }

  // Each picture's stretch: a clip's from its middle (its start when it plays whole), split into shots no longer than
  // one shot may be, cut where nothing changes (the next shot starts on the frame the last one ended).
  const cuts: PlannedCut[] = [];
  for (let i = 0; i < n; i += 1) {
    const lenF = shares[i]!;
    if (still[i]) {
      cuts.push({ clip: i, startSec: 0, endSec: r3(lenF / OUTPUT_FPS), beats: 0 });
      continue;
    }
    const startF = Math.max(0, Math.floor((fl(lens[i]!) - lenF) / 2));
    const pieces = Math.max(1, Math.ceil(lenF / maxShotF));
    for (let k = 0; k < pieces; k += 1) {
      const a = startF + Math.round((lenF * k) / pieces);
      const b = startF + Math.round((lenF * (k + 1)) / pieces);
      cuts.push({ clip: i, startSec: r3(a / OUTPUT_FPS), endSec: r3(b / OUTPUT_FPS), beats: 0 });
    }
  }
  if (cuts.length > input.maxShots) {
    return fail(`the clips need ${cuts.length} shots; an edit takes at most ${input.maxShots}`, { kind: 'too_many_clips', clips: cuts.length, maxShots: input.maxShots });
  }
  return {
    ok: true,
    cuts,
    musicStartSec: 0,
    leadInSec: 0,
    totalSec: r3(wantF / OUTPUT_FPS),
    beatSynced: false,
    bpm: null,
    unitSec: r3(frameSec),
    beatsPerShot: 0,
    unusedClips: [],
    ...(shortened ? { shortened } : {}),
  };
}
