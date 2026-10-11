/**
 * lib/agent/media/montageAsk.ts — the pure decisions of Agent G's "cut my clips to this music": which attachment is a
 * clip and which is the track, which frame shape the edit takes, the montage request it becomes, and whether the
 * finished master passes QC. No I/O (./montageExec does that), so every rule here is unit-tested.
 */
import type { BannerProbe, StreamDurations } from '@/lib/video/probeBanner';
import { displaysPortrait } from '@/lib/video/probeBanner';
import type { CutPlan } from '@/lib/services/montage/beatPlan';
import type { MontageAspect, MontageShot } from '@/lib/services/montage/montagePlan';
import { MAX_SHOTS, shotDuration, transitionOverlap } from '@/lib/services/montage/montagePlan';
import type { AgentMontageRequest, MontageManifestItem } from './montageManifest';

/** One track plus at most MAX_SHOTS clips (a clip is used at least once, so more could never all appear). */
export const MAX_CLIPS = MAX_SHOTS;
export const MAX_FILES = MAX_CLIPS + 1;

export type InputSort =
  /** `clips`: every picture in the order sent, videos AND photos; `stills`: which of them are photos (manifest indices). */
  | { ok: true; clips: number[]; stills: number[]; track: number }
  | { ok: false; error: 'unreadable' | 'no_clip' | 'no_track' | 'several_tracks' | 'too_many_clips'; files?: number[] };

/** Codecs ffmpeg reports for a still picture (a JPEG, PNG, WebP, HEIF, BMP or TIFF file is a one-frame „video"). */
const STILL_CODECS = new Set(['mjpeg', 'png', 'webp', 'bmp', 'tiff', 'hevc', 'heif', 'av1', 'jpegxl', 'jpeg2000']);
/** A real clip lasts longer than this; a still picture reads as one frame (~0.04 s) or as no length at all. */
const STILL_MAX_SEC = 0.5;

/**
 * Is this probe a PHOTO (a still picture), not a clip? One picture stream of an image codec, no sound, no length to
 * speak of. An MJPEG camera clip lasts seconds, so it stays a clip; a track's cover art is not a picture stream here
 * (lib/video/probeBanner skips „attached pic").
 */
export function isStillProbe(p: Pick<BannerProbe, 'hasVideo' | 'hasAudio' | 'videoCodec' | 'durationSec'> | null): boolean {
  return !!p && p.hasVideo && !p.hasAudio && STILL_CODECS.has((p.videoCodec ?? '').toLowerCase()) && !(p.durationSec > STILL_MAX_SEC);
}

/**
 * Sort probed attachments: a video stream is a clip, a photo is a still shot, sound without a picture is the track.
 * Exactly one track, and at least one video (a montage of photos only is a slideshow, not this edit).
 */
export function sortInputs(probes: ReadonlyArray<BannerProbe | null>): InputSort {
  const unreadable = probes.flatMap((p, i) => (!p || (!p.hasVideo && !p.hasAudio) || (!(p.durationSec > 0) && !isStillProbe(p)) ? [i] : []));
  if (unreadable.length) return { ok: false, error: 'unreadable', files: unreadable };
  const clips = probes.flatMap((p, i) => (p!.hasVideo ? [i] : []));
  const stills = clips.filter((i) => isStillProbe(probes[i]!));
  const tracks = probes.flatMap((p, i) => (!p!.hasVideo && p!.hasAudio ? [i] : []));
  if (clips.length === stills.length) return { ok: false, error: 'no_clip' };
  if (!tracks.length) return { ok: false, error: 'no_track' };
  if (tracks.length > 1) return { ok: false, error: 'several_tracks', files: tracks };
  if (clips.length > MAX_CLIPS) return { ok: false, error: 'too_many_clips' };
  return { ok: true, clips, stills, track: tracks[0]! };
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

/**
 * The montage request body (./montageManifest parseAgentRequest takes it): hard cuts, the track only, from its first
 * beat. `clips[c]` is the plan's clip c: its URL and its index in the manifest, which every shot carries as `source`;
 * a photo's shot is an `image` shot (the lane turns it into a slow zoom of the shot's length).
 */
export function montageBody(
  plan: CutPlan,
  clips: ReadonlyArray<{ url: string; source: number; still?: boolean }>,
  musicUrl: string,
  aspect: MontageAspect,
  manifest: readonly MontageManifestItem[],
): Record<string, unknown> {
  return {
    shots: plan.cuts.map((c) => ({
      url: clips[c.clip]?.url,
      source: clips[c.clip]?.source,
      kind: clips[c.clip]?.still ? 'image' : 'video',
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
    manifest,
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

// ── per-clip contribution QC (the owner's invariant, ./montageManifest) ──────────────────────────────────────────────

const r3 = (n: number) => Number(n.toFixed(3));

/** One shot on the master's timeline: where it sits in the OUTPUT and which window of which manifest file it shows. */
export interface TimelineShot {
  shot: number;
  source: number;
  outStartSec: number;
  outEndSec: number;
  srcStartSec: number;
  srcEndSec: number;
}

/**
 * Where every shot lands in the master: cumulative shot lengths, folded the way the lane folds them (a cut adds the
 * shot; a transition overlaps it, lib/services/montage/montagePlan timelineDuration). Agent G's montages are all cuts.
 */
export function outputTimeline(shots: ReadonlyArray<MontageShot & { source: number }>): TimelineShot[] {
  const out: TimelineShot[] = [];
  let total = 0;
  shots.forEach((s, i) => {
    const dur = shotDuration(s);
    const start = i === 0 || s.transition === 'cut' ? total : total - transitionOverlap(total, dur);
    out.push({ shot: i, source: s.source, outStartSec: r3(start), outEndSec: r3(start + dur), srcStartSec: s.startSec, srcEndSec: s.endSec });
    total = start + dur;
  });
  return out;
}

/** Where one manifest video is looked for: the middle of its longest shot, in the master and in the source. */
export interface ClipProbePoint {
  index: number;
  name: string;
  /** The source's URL as the plan holds it (the live wiring re-signs it before reading). */
  url: string;
  shot: number;
  outT: number;
  srcT: number;
}

/**
 * A photo is looked for this far into its shot: the lane's slow zoom starts at 1× (lib/video/remixOps kenBurnsClip), so
 * a few frames in, the master shows the photo itself, conformed to the frame the way the QC conforms the source.
 */
export const STILL_QC_OFFSET_SEC = 0.1;

/**
 * One probe point per manifest picture (video or photo), in manifest order. A picture with no shot gets none (coverage
 * refused it earlier). A video is looked for in the middle of its longest shot; a photo just after its shot starts.
 */
export function clipCheckPoints(request: AgentMontageRequest): ClipProbePoint[] {
  const timeline = outputTimeline(request.shots);
  const points: ClipProbePoint[] = [];
  for (const item of request.manifest) {
    if (item.kind !== 'video' && item.kind !== 'image') continue;
    const mine = timeline.filter((t) => t.source === item.index);
    if (!mine.length) continue;
    const best = mine.reduce((a, b) => (b.outEndSec - b.outStartSec > a.outEndSec - a.outStartSec ? b : a));
    const len = best.outEndSec - best.outStartSec;
    const into = item.kind === 'image' ? Math.min(STILL_QC_OFFSET_SEC, len / 4) : len / 2;
    points.push({
      index: item.index, name: item.name, url: request.shots[best.shot]!.url, shot: best.shot,
      outT: r3(best.outStartSec + into), srcT: item.kind === 'image' ? 0 : r3(best.srcStartSec + into),
    });
  }
  return points;
}

/** Each checked frame is this many pixels square, 8-bit grey: small enough to ignore codec noise, big enough to see a scene. */
export const CLIP_QC_SIZE = 32;
/**
 * The largest mean absolute difference (0–255 grey levels over CLIP_QC_SIZE² pixels) at which an output frame still
 * counts as the source frame it should show. CALIBRATION (real ffmpeg, lib/agent/media/montageExec.ffmpeg.test.ts,
 * 2026-10-11): a clip that IS in the master measured 0.01–0.05 (testsrc, testsrc2, smptebars, rgbtestsrc, mandelbrot);
 * a clip swapped out for another measured 52.8. 12 sits well between, with room for real footage and codec noise.
 */
export const CLIP_QC_MAX_DIFF = 12;

/** Mean absolute difference of two equal-length grey frames; Infinity when they cannot be compared. */
export function frameDiff(a: Uint8Array | null | undefined, b: Uint8Array | null | undefined): number {
  if (!a || !b || a.length !== b.length || !a.length) return Number.POSITIVE_INFINITY;
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += Math.abs(a[i]! - b[i]!);
  return s / a.length;
}

/** The evidence one clip's check leaves on the job (result.qc.clips). `diff` null = a frame could not be read. */
export interface ClipEvidence {
  index: number;
  name: string;
  outT: number;
  srcT: number;
  diff: number | null;
  ok: boolean;
  /** The source moment that matched best, when it was not `srcT` (./montageWorker checkClips). */
  matchT?: number;
}

export interface ClipVerdict {
  ok: boolean;
  clips: ClipEvidence[];
  /** Clips whose frames were read and are NOT in the output (manifest indices). */
  missing: number[];
  /** Clips that could not be checked (a frame did not read). */
  unchecked: number[];
  problems: string[];
}

/**
 * Did every manifest video really contribute frames? For each probe point: the master's frame at `outT` against the
 * source's frame at `srcT` (conformed to the master's frame the way the lane conformed it). Fails closed: a frame that
 * cannot be read is a problem too, so a master is delivered only when every clip was SEEN in it.
 */
export function qcClips(
  points: readonly ClipProbePoint[],
  outFrames: ReadonlyArray<Uint8Array | null>,
  srcFrames: ReadonlyArray<Uint8Array | null>,
  maxDiff = CLIP_QC_MAX_DIFF,
): ClipVerdict {
  const clips: ClipEvidence[] = points.map((p, i) => {
    const d = frameDiff(outFrames[i], srcFrames[i]);
    const diff = Number.isFinite(d) ? Number(d.toFixed(2)) : null;
    return { index: p.index, name: p.name, outT: p.outT, srcT: p.srcT, diff, ok: diff !== null && diff <= maxDiff };
  });
  const missing = clips.filter((c) => c.diff !== null && !c.ok).map((c) => c.index);
  const unchecked = clips.filter((c) => c.diff === null).map((c) => c.index);
  const problems = [
    ...clips.filter((c) => c.diff !== null && !c.ok).map((c) => `clip ${c.index + 1} "${c.name}" is not in the output at ${c.outT}s (diff ${c.diff} > ${maxDiff})`),
    ...clips.filter((c) => c.diff === null).map((c) => `clip ${c.index + 1} "${c.name}" could not be checked at ${c.outT}s`),
  ];
  return { ok: problems.length === 0, clips, missing, unchecked, problems };
}

/** Sound and picture may end this far apart (an AAC frame is 23 ms; the mux ends the bed with the picture). */
export const AV_SYNC_TOLERANCE_SEC = 0.25;

export interface AvVerdict {
  ok: boolean;
  problems: string[];
  videoSec: number | null;
  audioSec: number | null;
}

/**
 * A/V check of the master from its real stream lengths: a picture and a soundtrack, the picture as long as the plan
 * (qcMaster's tolerance) and the sound as long as the picture (AV_SYNC_TOLERANCE_SEC).
 */
export function qcAvSync(d: StreamDurations | null, expectedSec: number): AvVerdict {
  if (!d) return { ok: false, problems: ['the stream lengths could not be read'], videoSec: null, audioSec: null };
  const problems: string[] = [];
  if (d.videoSec === null) problems.push('no picture stream');
  if (d.audioSec === null) problems.push('no soundtrack stream');
  if (d.videoSec !== null && !(Math.abs(d.videoSec - expectedSec) <= Math.max(1, expectedSec * 0.03))) {
    problems.push(`picture ${d.videoSec.toFixed(2)}s, planned ${expectedSec.toFixed(2)}s`);
  }
  if (d.videoSec !== null && d.audioSec !== null && !(Math.abs(d.audioSec - d.videoSec) <= AV_SYNC_TOLERANCE_SEC)) {
    problems.push(`sound ${d.audioSec.toFixed(2)}s against picture ${d.videoSec.toFixed(2)}s`);
  }
  return { ok: problems.length === 0, problems, videoSec: d.videoSec, audioSec: d.audioSec };
}
