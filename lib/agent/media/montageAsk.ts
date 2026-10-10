/**
 * lib/agent/media/montageAsk.ts — the pure decisions of Agent G's "cut my clips to this music": which attachment is a
 * clip and which is the track, which frame shape the edit takes, the montage request it becomes, and whether the
 * finished master passes QC. No I/O (./montageExec does that), so every rule here is unit-tested.
 */
import type { BannerProbe } from '@/lib/video/probeBanner';
import { displaysPortrait } from '@/lib/video/probeBanner';
import type { CutPlan } from '@/lib/services/montage/beatPlan';
import type { MontageAspect } from '@/lib/services/montage/montagePlan';
import { MAX_SHOTS } from '@/lib/services/montage/montagePlan';

/** One track plus at most MAX_SHOTS clips (a clip is used at least once, so more could never all appear). */
export const MAX_CLIPS = MAX_SHOTS;
export const MAX_FILES = MAX_CLIPS + 1;

export type InputSort =
  | { ok: true; clips: number[]; track: number }
  | { ok: false; error: 'unreadable' | 'no_clip' | 'no_track' | 'several_tracks' | 'too_many_clips'; files?: number[] };

/** Sort probed attachments: a video stream is a clip, sound without one is the track. Exactly one track. */
export function sortInputs(probes: ReadonlyArray<BannerProbe | null>): InputSort {
  const unreadable = probes.flatMap((p, i) => (!p || (!p.hasVideo && !p.hasAudio) || !(p.durationSec > 0) ? [i] : []));
  if (unreadable.length) return { ok: false, error: 'unreadable', files: unreadable };
  const clips = probes.flatMap((p, i) => (p!.hasVideo ? [i] : []));
  const tracks = probes.flatMap((p, i) => (!p!.hasVideo && p!.hasAudio ? [i] : []));
  if (!clips.length) return { ok: false, error: 'no_clip' };
  if (!tracks.length) return { ok: false, error: 'no_track' };
  if (tracks.length > 1) return { ok: false, error: 'several_tracks', files: tracks };
  if (clips.length > MAX_CLIPS) return { ok: false, error: 'too_many_clips' };
  return { ok: true, clips, track: tracks[0]! };
}

const VERTICAL = /(?:reels?|tik\s?tok|shorts|stor(?:y|ies)|vertical|portrait|9\s*[:x/]\s*16|ვერტიკალ|სთორი|რილს|вертикал|сторис|рилс)/iu;
const SQUARE = /(?:square|1\s*[:x/]\s*1|კვადრატ|квадрат)/iu;
const WIDE = /(?:youtube|horizontal|landscape|widescreen|16\s*[:x/]\s*9|ჰორიზონტალ|горизонтал)/iu;

/** The frame shape the user named, if any. */
export function aspectFromPrompt(text: string | undefined): MontageAspect | null {
  const t = typeof text === 'string' ? text : '';
  if (VERTICAL.test(t)) return '9:16';
  if (SQUARE.test(t)) return '1:1';
  if (WIDE.test(t)) return '16:9';
  return null;
}

/** With no shape named, the shape most of the clips were shot in (as displayed: a phone's rotation counts). */
export function aspectFromClips(probes: ReadonlyArray<Pick<BannerProbe, 'width' | 'height' | 'rotation'>>): MontageAspect {
  const portrait = probes.filter((p) => displaysPortrait(p)).length;
  return portrait * 2 > probes.length ? '9:16' : '16:9';
}

/** The montage request body (./montagePlan validateMontageRequest takes it): hard cuts, the track only, from its first beat. */
export function montageBody(plan: CutPlan, clipUrls: readonly string[], musicUrl: string, aspect: MontageAspect): Record<string, unknown> {
  return {
    shots: plan.cuts.map((c) => ({
      url: clipUrls[c.clip],
      kind: 'video',
      startSec: c.startSec,
      endSec: c.endSec,
      transition: 'cut',
      muted: true,
    })),
    aspect,
    musicUrl,
    musicStartSec: plan.musicStartSec,
    musicDuckDb: 0,
    musicOnly: true,
  };
}

export interface QcVerdict {
  ok: boolean;
  problems: string[];
  durationSec: number;
}

/**
 * QC of a finished master before it is delivered: a picture and a sound stream, the codecs every browser plays, and a
 * length within a second (or 3 %) of the plan. A master that fails is not delivered.
 */
export function qcMaster(probe: BannerProbe | null, expectedSec: number): QcVerdict {
  if (!probe) return { ok: false, problems: ['the finished file could not be read'], durationSec: 0 };
  const problems: string[] = [];
  if (!probe.hasVideo) problems.push('no picture');
  if (!probe.hasAudio) problems.push('no sound');
  if (probe.hasVideo && probe.videoCodec !== 'h264') problems.push(`picture codec ${probe.videoCodec ?? 'unknown'}`);
  if (probe.hasAudio && probe.audioCodec !== 'aac') problems.push(`sound codec ${probe.audioCodec ?? 'unknown'}`);
  const tolerance = Math.max(1, expectedSec * 0.03);
  if (!(Math.abs(probe.durationSec - expectedSec) <= tolerance)) {
    problems.push(`length ${probe.durationSec.toFixed(1)}s, planned ${expectedSec.toFixed(1)}s`);
  }
  return { ok: problems.length === 0, problems, durationSec: probe.durationSec };
}
