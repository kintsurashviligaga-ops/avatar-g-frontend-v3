/**
 * lib/services/montage/smart/beat.ts — the editor's "Auto-cut clips to the beat" button. PURE.
 *
 * The beat finder and the cut planner already exist and are proven (lib/services/montage/beatPlan: onset strength →
 * tempo → phase; every clip used; "no clear beat" reported, never faked). Agent G used them only inside its own
 * montage route; this bridges them to the editor's clip list, so the same cut lands on the TIMELINE where the person can
 * still move it. The server decodes the song (beatAnalysis.analyzeTrack) and sends the grid; the cut itself runs here,
 * in the browser too.
 */
import { planBeatCuts, type BeatGrid, type CutProblem } from '../beatPlan';
import { MAX_SHOTS, MAX_SHOT_SEC, MAX_TOTAL_SEC, MIN_SHOT_SEC } from '../montagePlan';

export interface BeatClip { id: string; sourceId: string; kind: 'video' | 'image'; sourceSec: number }

export interface BeatLaidClip { id: string; sourceId: string; startSec: number; endSec: number; speed?: number }

export type BeatSyncResult =
  | { ok: true; clips: BeatLaidClip[]; musicStartSec: number; bpm: number | null; beatSynced: boolean; totalSec: number }
  | { ok: false; error: string; problem?: CutProblem };

/**
 * Lay `clips` on the song. `targetSec` absent = the planner's own default (a 30 s Reel, shrunk to the footage/song).
 * `beatSynced: false` means the song has no clear pulse and the cuts are even — the UI says so ("no clear beat").
 */
export function syncClipsToBeat(o: {
  clips: readonly BeatClip[];
  musicSec: number;
  grid: BeatGrid | null;
  musicFromSec?: number;
  targetSec?: number;
  idOf: (i: number) => string;
}): BeatSyncResult {
  if (!o.clips.length) return { ok: false, error: 'no_clips' };
  if (!(o.musicSec > 0)) return { ok: false, error: 'no_music' };
  const plan = planBeatCuts({
    clipDurationsSec: o.clips.map((c) => c.sourceSec),
    stills: o.clips.map((c) => c.kind === 'image'),
    musicSec: o.musicSec,
    grid: o.grid,
    ...(o.targetSec ? { targetSec: o.targetSec } : {}),
    ...(o.musicFromSec ? { musicFromSec: o.musicFromSec } : {}),
    maxShots: MAX_SHOTS,
    maxTotalSec: MAX_TOTAL_SEC,
    minShotSec: MIN_SHOT_SEC,
    maxShotSec: MAX_SHOT_SEC,
  });
  if (!plan.ok) return { ok: false, error: plan.error ?? 'plan_failed', ...(plan.problem ? { problem: plan.problem } : {}) };
  const seen = new Map<number, number>();
  const laid = plan.cuts.map((cut, i) => {
    const src = o.clips[cut.clip]!;
    const n = seen.get(cut.clip) ?? 0;
    seen.set(cut.clip, n + 1);
    return { id: n === 0 ? src.id : o.idOf(i), sourceId: src.sourceId, startSec: cut.startSec, endSec: cut.endSec, ...(cut.speed ? { speed: cut.speed } : {}) };
  });
  return { ok: true, clips: laid, musicStartSec: plan.musicStartSec, bpm: plan.bpm, beatSynced: plan.beatSynced, totalSec: plan.totalSec };
}
