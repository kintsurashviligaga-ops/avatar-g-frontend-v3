/**
 * lib/video/longform/stitch.ts — the long-form stitch as an ffmpeg PLAN: argv arrays, never a shell string.
 *
 * Why not the existing assembler (lib/orchestrator/ffmpeg-assembly.ts): it is built for ≤ 60 s — every clip is
 * re-encoded with x264 ultrafast inside a 280 s exec timeout, the music bed is padded with silence after the track
 * ends (apad → a 30 s Lyria bed goes quiet 30 s in), and the master is squeezed under the ~50 MB Supabase upload
 * limit with a VBV cap. At 240 s all three break: the re-encode does not finish in time, three minutes play in
 * silence, and the size cap drives 1080p to an unwatchable bitrate. This module removes each:
 *
 *   • COPY, NOT RE-ENCODE — Veo clips of one job share codec, resolution, frame rate and audio layout, so the concat
 *     DEMUXER joins them with `-c copy`: seconds of I/O instead of minutes of CPU. Compatibility is PROVEN from each
 *     clip's probe (parseProbe), never assumed; any mismatch falls back to a re-encode plan (concat FILTER, scaled
 *     and padded to one frame, silent clips given a silent track so the concat stays aligned).
 *   • A LOOPED MUSIC BED — the track repeats for the whole film (`aloop` in the filtergraph), `-shortest` + `-t` end it
 *     with the picture, and a fade-out closes it. Only the audio is re-encoded; the video stays a stream copy.
 *     ⚠️ NOT `-stream_loop -1`, the obvious flag: with the bundled ffmpeg (ffmpeg-static, 6.0 on darwin) a looped input
 *     that is not fully drained when the output ends HANGS the process after the file is written — verified locally
 *     2026-10-01 with `-stream_loop -1`, `-stream_loop -1 -t N` and `-stream_loop 40` alike, while the same mix with
 *     `aloop` exits cleanly. A hang would burn the function to its timeout and fail every stitch with music.
 *   • A SIZE GUARD — the output size is estimated (measured clip bytes when known) and checked against the upload
 *     limit: fits → standard upload; resumable upload available → keep the copy; otherwise re-encode to fit when the
 *     bitrate that fits stays above a quality floor, else refuse with `needs_resumable_upload` rather than ship mush.
 *
 * Pure: builds argv and file contents, runs nothing. runtime.ts executes the plan with ffmpeg-static.
 */

export const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
/** Headroom under the limit for container overhead and VBV overshoot. */
const UPLOAD_HEADROOM = 0.95;
export const DEFAULT_AUDIO_KBPS = 192;
/**
 * ⚠️ UNVERIFIED: Veo's output bitrate is not documented. Used ONLY when a clip's size and probe are both unknown;
 * the runtime records each delivered clip's real byte size, which always wins.
 */
export const ASSUMED_CLIP_KBPS = { '720p': 6_000, '1080p': 12_000 } as const;
/** The lowest video bitrate the fit-to-size re-encode may pick; below it the plan asks for a resumable upload. */
export const MIN_VIDEO_KBPS = { '720p': 1_000, '1080p': 2_000 } as const;
/** The re-encode ceiling (it never inflates a clip beyond a sensible delivery bitrate). */
export const MAX_VIDEO_KBPS = { '720p': 4_000, '1080p': 8_000 } as const;

export const DEFAULT_TARGET = Object.freeze({ width: 1920, height: 1080, fps: 24 });

// ── Probe parsing ────────────────────────────────────────────────────────────────────────────────────────────

export interface VideoSignature {
  codec: string;
  width: number;
  height: number;
  fps: number;
  pixFmt: string | null;
}

export interface AudioSignature {
  codec: string;
  sampleRate: number;
  channels: number;
}

export interface ProbedClip {
  durationSec: number | null;
  bitrateKbps: number | null;
  video: VideoSignature | null;
  audio: AudioSignature | null;
}

/** `ffmpeg -i <clip>` with no output (exits non-zero) prints the stream header to stderr. */
export function buildProbeArgs(source: string): string[] {
  return ['-hide_banner', '-nostdin', '-i', source];
}

const CHANNELS: Record<string, number> = { mono: 1, stereo: 2, '2.1': 3, quad: 4, '5.0': 5, '5.1': 6, '7.1': 8 };

/** Parse that header (the first video and the first audio stream). Unknown fields are null; never throws. */
export function parseProbe(stderr: string): ProbedClip {
  const log = typeof stderr === 'string' ? stderr.slice(0, 64_000) : '';
  const dm = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(log);
  const durationSec = dm ? Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number.parseFloat(dm[3] ?? '0') : null;
  const bm = /Duration:[^\n]*?bitrate:\s*(\d+)\s*kb\/s/.exec(log);
  const bitrateKbps = bm ? Number(bm[1]) : null;

  let video: VideoSignature | null = null;
  const vl = /Stream #\d+:\d+[^\n]*?:\s*Video:\s*([A-Za-z0-9_]+)([^\n]*)/.exec(log);
  if (vl) {
    const rest = vl[2] ?? '';
    const size = /,\s*(\d{2,5})x(\d{2,5})\b/.exec(rest);
    const fps = /,\s*(\d+(?:\.\d+)?)\s*fps\b/.exec(rest) ?? /,\s*(\d+(?:\.\d+)?)\s*tbr\b/.exec(rest);
    const pix = /,\s*((?:yuvj?|nv|rgb|bgr|gray)[a-z0-9]*)\b/i.exec(rest);
    if (size && fps) {
      video = {
        codec: (vl[1] ?? '').toLowerCase(),
        width: Number(size[1]),
        height: Number(size[2]),
        fps: Number.parseFloat(fps[1] ?? '0'),
        pixFmt: pix?.[1]?.toLowerCase() ?? null,
      };
    }
  }

  let audio: AudioSignature | null = null;
  const al = /Stream #\d+:\d+[^\n]*?:\s*Audio:\s*([A-Za-z0-9_]+)([^\n]*)/.exec(log);
  if (al) {
    const rest = al[2] ?? '';
    const hz = /(\d+)\s*Hz/.exec(rest);
    const layout = /Hz,\s*([^,]+)/.exec(rest)?.[1]?.trim().toLowerCase() ?? '';
    const channels = CHANNELS[layout] ?? Number(/(\d+)\s*channels/.exec(layout)?.[1] ?? NaN);
    if (hz && Number.isFinite(channels)) audio = { codec: (al[1] ?? '').toLowerCase(), sampleRate: Number(hz[1]), channels };
  }
  return { durationSec, bitrateKbps, video, audio };
}

// ── Compatibility + size ─────────────────────────────────────────────────────────────────────────────────────

export interface StitchClip {
  /** An absolute local path or an https URL (our own signed storage URL). */
  source: string;
  durationSec: number;
  /** Measured size (the runtime records it at delivery). Wins over any estimate. */
  bytes?: number | null;
  probe?: ProbedClip | null;
}

export interface Compatibility {
  compatible: boolean;
  reasons: string[];
}

/** True only when EVERY clip is probed and they all share codec, size, frame rate, pixel format and audio layout. */
export function copyCompatibility(clips: readonly StitchClip[]): Compatibility {
  const reasons: string[] = [];
  const first = clips[0]?.probe;
  if (!first?.video) return { compatible: false, reasons: [clips.length ? 'clip 0 is not probed' : 'no clips'] };
  const fv = first.video;
  clips.forEach((c, i) => {
    const v = c.probe?.video;
    if (!v) {
      reasons.push(`clip ${i} is not probed`);
      return;
    }
    if (v.codec !== fv.codec) reasons.push(`clip ${i}: video codec ${v.codec} ≠ ${fv.codec}`);
    if (v.width !== fv.width || v.height !== fv.height) reasons.push(`clip ${i}: ${v.width}x${v.height} ≠ ${fv.width}x${fv.height}`);
    if (Math.abs(v.fps - fv.fps) > 0.01) reasons.push(`clip ${i}: ${v.fps} fps ≠ ${fv.fps} fps`);
    if ((v.pixFmt ?? '') !== (fv.pixFmt ?? '')) reasons.push(`clip ${i}: pixel format ${v.pixFmt ?? '?'} ≠ ${fv.pixFmt ?? '?'}`);
    const a = c.probe?.audio ?? null;
    const fa = first.audio;
    if (!!a !== !!fa) reasons.push(`clip ${i}: audio ${a ? 'present' : 'absent'} unlike clip 0`);
    else if (a && fa && (a.codec !== fa.codec || a.sampleRate !== fa.sampleRate || a.channels !== fa.channels)) {
      reasons.push(`clip ${i}: audio ${a.codec}/${a.sampleRate}/${a.channels} ≠ ${fa.codec}/${fa.sampleRate}/${fa.channels}`);
    }
  });
  return { compatible: reasons.length === 0, reasons };
}

type Grade = '720p' | '1080p';
const gradeOf = (height: number, width: number): Grade => (Math.min(height, width) >= 1000 ? '1080p' : '720p');
const kbpsToBytes = (kbps: number, sec: number): number => Math.ceil((kbps * 1000 * sec) / 8);

export interface SizeEstimate {
  bytes: number;
  /** measured = every clip's real size; probed = container bitrate × duration; assumed = ASSUMED_CLIP_KBPS. */
  basis: 'measured' | 'probed' | 'assumed';
}

/** The size of a stream-copy of these clips (copy keeps every byte; the container adds ~1 %). */
export function estimateCopyBytes(clips: readonly StitchClip[]): SizeEstimate {
  let basis: SizeEstimate['basis'] = 'measured';
  let total = 0;
  for (const c of clips) {
    const sec = Number.isFinite(c.durationSec) && c.durationSec > 0 ? c.durationSec : 0;
    if (typeof c.bytes === 'number' && Number.isFinite(c.bytes) && c.bytes > 0) {
      total += c.bytes;
    } else if (c.probe?.bitrateKbps) {
      total += kbpsToBytes(c.probe.bitrateKbps, c.probe.durationSec ?? sec);
      if (basis === 'measured') basis = 'probed';
    } else {
      const v = c.probe?.video;
      total += kbpsToBytes(ASSUMED_CLIP_KBPS[v ? gradeOf(v.height, v.width) : '1080p'], sec);
      basis = 'assumed';
    }
  }
  return { bytes: Math.ceil(total * 1.01), basis };
}

export interface EncodeDecisionInput {
  durationSec: number;
  copyCompatible: boolean;
  copyBytes: number;
  grade: Grade;
  maxUploadBytes?: number;
  resumableUploadAvailable?: boolean;
  audioKbps?: number;
}

export type EncodeDecision =
  | { mode: 'copy'; upload: 'standard' | 'resumable'; estimatedBytes: number; videoKbps: null }
  | { mode: 'reencode'; upload: 'standard' | 'resumable'; estimatedBytes: number; videoKbps: number; reason: 'incompatible' | 'fit_to_upload_limit' }
  | { mode: 'none'; needsResumableUpload: true; estimatedBytes: number; fitKbps: number };

/**
 * The size guard. Prefers, in order: copy that fits → copy over a resumable upload → re-encode at the bitrate that
 * fits (never below MIN_VIDEO_KBPS) → refuse with needsResumableUpload. An incompatible set re-encodes at the
 * ceiling bitrate when that fits, else the same ladder.
 */
export function decideEncode(input: EncodeDecisionInput): EncodeDecision {
  const sec = Math.max(1, input.durationSec);
  const limit = input.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  const budget = Math.floor(limit * UPLOAD_HEADROOM);
  const audioKbps = input.audioKbps ?? DEFAULT_AUDIO_KBPS;
  const resumable = input.resumableUploadAvailable === true;
  const ceiling = MAX_VIDEO_KBPS[input.grade];
  const floor = MIN_VIDEO_KBPS[input.grade];
  const fitKbps = Math.floor((budget * 8) / 1000 / sec) - audioKbps;
  const encodedBytes = (videoKbps: number) => kbpsToBytes(videoKbps + audioKbps, sec);

  if (input.copyCompatible) {
    if (input.copyBytes <= budget) return { mode: 'copy', upload: 'standard', estimatedBytes: input.copyBytes, videoKbps: null };
    if (resumable) return { mode: 'copy', upload: 'resumable', estimatedBytes: input.copyBytes, videoKbps: null };
  } else {
    const atCeiling = encodedBytes(ceiling);
    if (atCeiling <= budget || resumable) {
      return { mode: 'reencode', upload: atCeiling <= budget ? 'standard' : 'resumable', estimatedBytes: atCeiling, videoKbps: ceiling, reason: 'incompatible' };
    }
  }
  if (fitKbps >= floor) {
    const videoKbps = Math.min(fitKbps, ceiling);
    return {
      mode: 'reencode',
      upload: 'standard',
      estimatedBytes: encodedBytes(videoKbps),
      videoKbps,
      reason: input.copyCompatible ? 'fit_to_upload_limit' : 'incompatible',
    };
  }
  return { mode: 'none', needsResumableUpload: true, estimatedBytes: input.copyCompatible ? input.copyBytes : encodedBytes(ceiling), fitKbps };
}

// ── argv ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A source ffmpeg may open: an absolute local path without `..` segments, or an https URL. No control characters
 * (a newline in a concat list would inject a directive), no quotes or backslashes in URLs, nothing starting with
 * `-` (an argv option).
 */
export function isSafeSource(source: unknown): source is string {
  if (typeof source !== 'string' || source.length === 0 || source.length > 4096) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(source)) return false;
  if (/^https:\/\//i.test(source)) return /^https:\/\/[^\s'"\\]+$/i.test(source);
  return source.startsWith('/') && !source.split('/').includes('..');
}

const isRemote = (s: string): boolean => /^https:\/\//i.test(s);

/** One concat-demuxer line: `file '<path>'`, a quote written as '\'' (ffmpeg's quoting rule). */
export function concatListLine(source: string): string {
  return `file '${source.replace(/'/g, "'\\''")}'`;
}

/** The last frame of a clip as a JPEG — the seed of the next act's first scene. */
export function buildLastFrameArgs(source: string, outPath: string): string[] {
  return ['-hide_banner', '-nostdin', '-y', '-sseof', '-0.5', '-i', source, '-frames:v', '1', '-q:v', '2', '-update', '1', outPath];
}

export interface StitchMusic {
  source: string;
  /** The track's length (probe it). Sizes the loop buffer; a track at least as long as the film is not looped. */
  durationSec?: number | null;
  /** Bed level. Default 0.3 under Veo's own audio (dialogue / SFX), 0.9 when the clips are silent. */
  volume?: number;
  /** Fade-out at the end, seconds. Default 2. */
  fadeOutSec?: number;
}

export interface StitchPlanInput {
  clips: readonly StitchClip[];
  /** Absolute local directory for the concat list and the output. */
  workDir: string;
  outName?: string;
  music?: StitchMusic | null;
  maxUploadBytes?: number;
  resumableUploadAvailable?: boolean;
  audioKbps?: number;
  /** x264 threads for a re-encode (memory scales with it — see ffmpeg-assembly's OOM note). Default 2. */
  threads?: number;
  /** The re-encode frame; default the first clip's probe, else 1920×1080 @ 24. */
  target?: { width: number; height: number; fps: number };
}

export interface StitchPlan {
  mode: 'copy' | 'reencode';
  /** Why a re-encode was needed (incompatibilities, or fitting the upload limit); empty for a copy. */
  modeReasons: string[];
  upload: 'standard' | 'resumable';
  /** Write `content` to `path` before running (copy mode). */
  concatList: { path: string; content: string } | null;
  /** ffmpeg arguments (without the binary). */
  argv: string[];
  outPath: string;
  totalDurationSec: number;
  estimatedBytes: number;
  videoKbps: number | null;
}

export type StitchPlanResult =
  | { ok: true; plan: StitchPlan }
  | { ok: false; reason: 'no_clips' | 'unsafe_source' | 'needs_resumable_upload'; detail: string; estimatedBytes?: number };

const num = (n: number): string => String(Math.round(n * 1000) / 1000);

const BED_RATE = 48_000;

/**
 * The bed: resampled to 48 kHz, looped (aloop keeps `size` samples and replays them from the track's end, forever),
 * levelled and faded out at the film's end. A track known to outlast the film is not looped; an unknown length loops
 * at most the film's length (the buffer aloop holds — ≈ 92 MB of float stereo for 240 s, fine on a 3 GB function).
 */
function musicChain(m: StitchMusic, inputIndex: number, totalSec: number, clipsHaveAudio: boolean): string {
  const vol = Number.isFinite(m.volume) && (m.volume as number) >= 0 ? Math.min(2, m.volume as number) : clipsHaveAudio ? 0.3 : 0.9;
  const fade = Number.isFinite(m.fadeOutSec) && (m.fadeOutSec as number) >= 0 ? Math.min(10, m.fadeOutSec as number) : 2;
  const fadeStart = Math.max(0, totalSec - fade);
  const known = typeof m.durationSec === 'number' && Number.isFinite(m.durationSec) && m.durationSec > 0 ? m.durationSec : null;
  const loop = known !== null && known >= totalSec
    ? ''
    : `,aloop=loop=-1:size=${Math.ceil(Math.min(known ?? totalSec, totalSec) * BED_RATE)}`;
  return `[${inputIndex}:a]aresample=${BED_RATE}${loop},volume=${num(vol)}${fade > 0 ? `,afade=t=out:st=${num(fadeStart)}:d=${num(fade)}` : ''}[bed]`;
}

/** Joins the clip audio with the bed; `normalize=0` keeps the clips' own dialogue at full level. */
const MIX = (clipAudio: string) => `${clipAudio}[bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`;

/**
 * Build the stitch. Copy when compatible (and the guard agrees), else a re-encode; music looped either way.
 * Refuses unsafe sources and an output no upload path can carry.
 */
export function buildStitchPlan(input: StitchPlanInput): StitchPlanResult {
  const clips = input.clips;
  if (clips.length === 0) return { ok: false, reason: 'no_clips', detail: 'nothing to stitch' };
  const unsafe = clips.findIndex((c) => !isSafeSource(c.source));
  if (unsafe >= 0) return { ok: false, reason: 'unsafe_source', detail: `clip ${unsafe} is not an absolute path or an https URL` };
  if (input.music && !isSafeSource(input.music.source)) return { ok: false, reason: 'unsafe_source', detail: 'the music source is not an absolute path or an https URL' };
  if (!isSafeSource(input.workDir) || isRemote(input.workDir)) return { ok: false, reason: 'unsafe_source', detail: 'workDir must be an absolute local path' };

  const dir = input.workDir.replace(/\/+$/, '');
  const outName = (input.outName ?? 'longform.mp4').replace(/[^A-Za-z0-9._-]/g, '_') || 'longform.mp4';
  const outPath = `${dir}/${outName}`;
  const totalSec = clips.reduce((s, c) => s + (Number.isFinite(c.durationSec) && c.durationSec > 0 ? c.durationSec : 0), 0);
  const audioKbps = input.audioKbps ?? DEFAULT_AUDIO_KBPS;
  const compat = copyCompatibility(clips);
  const fv = clips[0]?.probe?.video;
  const target = input.target ?? (fv ? { width: fv.width, height: fv.height, fps: fv.fps } : DEFAULT_TARGET);
  const grade = gradeOf(target.height, target.width);
  const copyBytes = estimateCopyBytes(clips).bytes;
  const decision = decideEncode({
    durationSec: totalSec,
    copyCompatible: compat.compatible,
    copyBytes,
    grade,
    ...(input.maxUploadBytes !== undefined ? { maxUploadBytes: input.maxUploadBytes } : {}),
    ...(input.resumableUploadAvailable !== undefined ? { resumableUploadAvailable: input.resumableUploadAvailable } : {}),
    audioKbps,
  });
  if (decision.mode === 'none') {
    return {
      ok: false,
      reason: 'needs_resumable_upload',
      detail: `a ${Math.round(totalSec)} s ${grade} film is ~${Math.round(decision.estimatedBytes / 1048576)} MB; the bitrate that fits the upload limit (${decision.fitKbps} kb/s) is below the ${MIN_VIDEO_KBPS[grade]} kb/s floor`,
      estimatedBytes: decision.estimatedBytes,
    };
  }

  const base = ['-hide_banner', '-nostdin', '-y'];
  const music = input.music ?? null;
  const tail = ['-t', num(totalSec), '-movflags', '+faststart', outPath];

  if (decision.mode === 'copy') {
    const listPath = `${dir}/concat.txt`;
    const content = `ffconcat version 1.0\n${clips.map((c) => concatListLine(c.source)).join('\n')}\n`;
    const remote = clips.some((c) => isRemote(c.source));
    const argv = [
      ...base,
      '-f', 'concat', '-safe', '0',
      // The concat demuxer opens each listed URL itself; the whitelist (copied to the nested opens) lets it.
      ...(remote ? ['-protocol_whitelist', 'file,http,https,tcp,tls,crypto'] : []),
      '-i', listPath,
    ];
    const clipsHaveAudio = !!clips[0]?.probe?.audio;
    if (music) {
      argv.push('-i', music.source);
      const bed = musicChain(music, 1, totalSec, clipsHaveAudio);
      argv.push('-filter_complex', clipsHaveAudio ? `${bed};${MIX('[0:a]')}` : bed);
      argv.push('-map', '0:v:0', '-map', clipsHaveAudio ? '[aout]' : '[bed]');
      argv.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ar', '48000', '-shortest');
    } else {
      argv.push('-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy');
    }
    argv.push(...tail);
    return {
      ok: true,
      plan: {
        mode: 'copy', modeReasons: [], upload: decision.upload, concatList: { path: listPath, content }, argv, outPath,
        totalDurationSec: totalSec, estimatedBytes: decision.estimatedBytes, videoKbps: null,
      },
    };
  }

  // Re-encode: concat FILTER over every clip, normalised to one frame; silent clips get a silent track.
  const argv = [...base];
  for (const c of clips) argv.push('-i', c.source);
  if (music) argv.push('-i', music.source);
  const { width: W, height: H } = target;
  const fps = Number.isFinite(target.fps) && target.fps > 0 ? target.fps : DEFAULT_TARGET.fps;
  const parts: string[] = [];
  clips.forEach((c, i) => {
    const d = num(c.durationSec);
    parts.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,` +
        `fps=${num(fps)},format=yuv420p,trim=duration=${d},setpts=PTS-STARTPTS[v${i}]`,
    );
    parts.push(
      c.probe?.audio
        ? `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=duration=${d},asetpts=PTS-STARTPTS[a${i}]`
        : `anullsrc=channel_layout=stereo:sample_rate=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=duration=${d}[a${i}]`,
    );
  });
  parts.push(`${clips.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${clips.length}:v=1:a=1[vcat][acat]`);
  if (music) parts.push(musicChain(music, clips.length, totalSec, true), MIX('[acat]'));
  const kbps = decision.videoKbps;
  argv.push(
    '-filter_complex', parts.join(';'),
    '-map', '[vcat]', '-map', music ? '[aout]' : '[acat]',
    // ⚠️ superfast, not veryfast/fast: x264's rc-lookahead buffers are what OOM-killed the serverless assembler
    // (ffmpeg-assembly.ts v331). superfast has no lookahead (like ultrafast) but keeps CABAC — better quality at the
    // capped bitrate the fit-to-size path runs at.
    '-c:v', 'libx264', '-preset', 'superfast', '-crf', '21',
    '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`,
    '-threads', String(Math.max(1, Math.min(8, Math.floor(input.threads ?? 2)))),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ar', '48000',
    ...tail,
  );
  return {
    ok: true,
    plan: {
      mode: 'reencode',
      modeReasons: decision.reason === 'incompatible' ? compat.reasons : [`fit the ${Math.round((input.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES) / 1048576)} MB upload limit`],
      upload: decision.upload,
      concatList: null,
      argv,
      outPath,
      totalDurationSec: totalSec,
      estimatedBytes: decision.estimatedBytes,
      videoKbps: kbps,
    },
  };
}
