/**
 * lib/services/montage/assemblyPlan.ts — Intro + Content + Outro, each cut to where it really starts and ends.
 *
 * GG 2026-11-05 09:03Z: „[Clip A: Intro] + [Clip B: Content] + [Clip A: Outro]". The montage's join (./joinPlan) plays
 * every clip whole, dead frames included. An assembly instead takes three ROLES, each from a file the user named:
 *
 *   intro   from `intro` — when the same file is also the outro, only its first part (up to the first break inside it,
 *           ./segmentDetect splitIntroOutro); otherwise the whole file minus the black at its ends;
 *   body    from `body` — the whole file minus its black ends AND the silence before the first and after the last
 *           sound heard (the voice), less a short pad so no word is clipped;
 *   outro   from `outro` — the same file's last part, or the whole outro file minus its black ends.
 *
 * Times the user gave (`cuts`, the tool's cut_timestamps) win over what was detected, bound by bound. Every window is on
 * the 30 fps grid of the master, so the stitch (lib/video/surgicalOps) cuts picture and sound at the same frame and
 * nothing is lost or doubled at a join. A body longer than one shot plays on as consecutive shots cut where nothing
 * changes (frame-exact, no gap).
 *
 * Pure and total: no I/O, never throws. Returns the beat plan's own CutPlan shape, so the request, the manifest, the QC
 * and the card read it exactly as they read the other plans.
 */
import { OUTPUT_FPS, type CutPlan, type PlannedCut } from './beatPlan';
import {
  MIN_PART_SEC,
  frameDown,
  frameUp,
  splitIntroOutro,
  trimmedWindow,
  usableEnd,
  type ClipSignals,
  type DetectedWindow,
} from './segmentDetect';

export type AssemblyRole = 'intro' | 'body' | 'outro';

/** A window the user asked for, in source seconds; either bound may be left to detection. */
export interface AskedWindow {
  startSec?: number;
  endSec?: number;
}

export interface AssemblyInput {
  /** Per clip (index = clip index): its real length and what the detection pass found (null = not analysed/unreadable). */
  clips: ReadonlyArray<{ durationSec: number; signals: ClipSignals | null }>;
  intro?: number;
  body: number;
  outro?: number;
  /** The tool's cut_timestamps: per role, the times that override detection. */
  cuts?: Partial<Record<AssemblyRole, AskedWindow>>;
  maxShots: number;
  maxTotalSec: number;
  minShotSec: number;
  maxShotSec: number;
}

export interface AssemblyPart extends DetectedWindow {
  role: AssemblyRole;
  clip: number;
}

export type AssemblyProblem =
  | { kind: 'no_boundary'; clip: number }
  | { kind: 'not_analysed'; clip: number; role: AssemblyRole }
  | { kind: 'bad_cut'; role: AssemblyRole; durationSec: number }
  | { kind: 'part_too_short'; role: AssemblyRole; clip: number; sec: number; minSec: number }
  | { kind: 'too_long'; totalSec: number; maxSec: number }
  | { kind: 'too_many_shots'; shots: number; maxShots: number }
  | { kind: 'bad_roles' };

export interface AssemblyPlan extends CutPlan {
  /** The three roles as planned, in master order (intro and outro only when asked). */
  parts: AssemblyPart[];
  assemblyProblem?: AssemblyProblem;
}

const r3 = (n: number) => Number(n.toFixed(3));
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function fail(error: string, assemblyProblem: AssemblyProblem): AssemblyPlan {
  return {
    ok: false, error, assemblyProblem, parts: [], cuts: [], musicStartSec: 0, leadInSec: 0, totalSec: 0,
    beatSynced: false, bpm: null, unitSec: r3(1 / OUTPUT_FPS), beatsPerShot: 0, unusedClips: [],
  };
}

/** A role's detected window overridden by the user's times, bound by bound; null = the times are not inside the clip. */
function withAsked(w: DetectedWindow, asked: AskedWindow | undefined, durationSec: number): DetectedWindow | null {
  if (!asked) return w;
  const end = usableEnd({ durationSec });
  const s = fin(asked.startSec) ? asked.startSec : undefined;
  const e = fin(asked.endSec) ? asked.endSec : undefined;
  if (s !== undefined && (s < 0 || s >= durationSec)) return null;
  if (e !== undefined && (e <= 0 || e > durationSec + 0.001)) return null;
  const startSec = s !== undefined ? frameUp(s) : w.startSec;
  const endSec = e !== undefined ? Math.min(end, frameDown(e)) : w.endSec;
  if (!(endSec > startSec)) return null;
  return { startSec, endSec, startBy: s !== undefined ? 'asked' : w.startBy, endBy: e !== undefined ? 'asked' : w.endBy };
}

/** Plan the assembly. Every named role gets a window, or there is no plan (the problem says which and why). */
export function planAssembly(input: AssemblyInput): AssemblyPlan {
  const n = input.clips.length;
  const ok = (i: number | undefined) => i === undefined || (Number.isInteger(i) && i >= 0 && i < n);
  if (!ok(input.intro) || !ok(input.outro) || !ok(input.body) || input.body === input.intro || input.body === input.outro) {
    return fail('the intro, body and outro must name different attached clips (intro and outro may be the same one)', { kind: 'bad_roles' });
  }
  const shared = input.intro !== undefined && input.intro === input.outro;
  const roles: Array<{ role: AssemblyRole; clip: number }> = [
    ...(input.intro !== undefined ? [{ role: 'intro' as const, clip: input.intro }] : []),
    { role: 'body', clip: input.body },
    ...(input.outro !== undefined ? [{ role: 'outro' as const, clip: input.outro }] : []),
  ];

  // A clip that holds both the intro and the outro is split once, by its own breaks; both roles read that split.
  let split: ReturnType<typeof splitIntroOutro> | null = null;
  const parts: AssemblyPart[] = [];
  for (const { role, clip } of roles) {
    const c = input.clips[clip]!;
    const asked = input.cuts?.[role];
    const fullyAsked = !!asked && fin(asked.startSec) && fin(asked.endSec);
    const sig = c.signals;
    let detected: DetectedWindow;
    if (fullyAsked) {
      detected = { startSec: 0, endSec: usableEnd(c), startBy: 'asked', endBy: 'asked' };
    } else if (!sig) {
      return fail(`clip ${clip + 1} could not be analysed; give the ${role} times`, { kind: 'not_analysed', clip, role });
    } else if (shared && role !== 'body') {
      split ??= splitIntroOutro(sig);
      if (!split.ok) {
        // One role's times given are enough for the other side of the same clip only when both are given; say so.
        return fail(`no break found inside clip ${clip + 1} between its intro and outro; give the times`, { kind: 'no_boundary', clip });
      }
      detected = role === 'intro' ? split.intro : split.outro;
    } else {
      detected = trimmedWindow(sig, role === 'body');
    }
    const w = withAsked(detected, asked, c.durationSec);
    if (!w) return fail(`the ${role} times are not inside clip ${clip + 1} (${r3(c.durationSec)}s)`, { kind: 'bad_cut', role, durationSec: r3(c.durationSec) });
    const minSec = Math.max(input.minShotSec, MIN_PART_SEC);
    if (w.endSec - w.startSec < minSec) {
      return fail(`the ${role} is ${r3(w.endSec - w.startSec)}s, shorter than ${minSec}s`, { kind: 'part_too_short', role, clip, sec: r3(w.endSec - w.startSec), minSec });
    }
    parts.push({ ...w, role, clip });
  }

  // Frames, not seconds: the master is exactly the sum of the parts' frames (surgicalOps conforms each to its count).
  const framesOf = (p: Span2) => Math.round((p.endSec - p.startSec) * OUTPUT_FPS);
  const totalF = parts.reduce((s, p) => s + framesOf(p), 0);
  const totalSec = r3(totalF / OUTPUT_FPS);
  if (totalSec > input.maxTotalSec + 1e-6) {
    return fail(`the assembly lasts ${totalSec}s, longer than one edit (${input.maxTotalSec}s)`, { kind: 'too_long', totalSec, maxSec: input.maxTotalSec });
  }
  const maxShotF = Math.floor(input.maxShotSec * OUTPUT_FPS) - 1;
  const cuts: PlannedCut[] = [];
  for (const p of parts) {
    const lenF = framesOf(p);
    const pieces = Math.max(1, Math.ceil(lenF / maxShotF));
    const a0 = Math.round(p.startSec * OUTPUT_FPS);
    for (let k = 0; k < pieces; k += 1) {
      const a = a0 + Math.round((lenF * k) / pieces);
      const b = a0 + Math.round((lenF * (k + 1)) / pieces);
      cuts.push({ clip: p.clip, startSec: r3(a / OUTPUT_FPS), endSec: r3(b / OUTPUT_FPS), beats: 0 });
    }
  }
  if (cuts.length > input.maxShots) {
    return fail(`the assembly needs ${cuts.length} shots; an edit takes at most ${input.maxShots}`, { kind: 'too_many_shots', shots: cuts.length, maxShots: input.maxShots });
  }
  return {
    ok: true, parts, cuts, musicStartSec: 0, leadInSec: 0, totalSec,
    beatSynced: false, bpm: null, unitSec: r3(1 / OUTPUT_FPS), beatsPerShot: 0, unusedClips: [],
  };
}

type Span2 = { startSec: number; endSec: number };
