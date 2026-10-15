/**
 * lib/video/probeBanner.ts — read what ffmpeg says about an input: length, streams, frame size, rotation, codecs.
 *
 * PURE: the text is ffmpeg's own stderr banner (`ffmpeg -hide_banner -i <file>`, the trick lib/video/surgicalOps uses
 * because ffmpeg-static ships no ffprobe). One parser, so the planner reading a user's clips and the QC reading a
 * finished master agree on what a stream is.
 */
import { parseFfmpegDuration } from './sequenceWindows';

export interface BannerProbe {
  durationSec: number;
  hasVideo: boolean;
  hasAudio: boolean;
  /** Coded frame size of the first video stream (0 when there is none). */
  width: number;
  height: number;
  /** Display rotation in degrees (phone portrait clips are coded landscape with ±90). */
  rotation: number;
  videoCodec: string | null;
  audioCodec: string | null;
}

export function parseProbeBanner(stderr: string): BannerProbe {
  const text = typeof stderr === 'string' ? stderr : '';
  // An mp3's or m4a's cover art is a one-frame `Video: mjpeg … (attached pic)` stream: a track, not a clip.
  const video = [...text.matchAll(/Stream #\d+:\d+(?:\[[^\]]*\])?(?:\([^)]*\))?: Video: ([a-z0-9_]+)[^\n]*/gi)]
    .find((m) => !/attached pic/i.test(m[0])) ?? null;
  const audio = /Stream #\d+:\d+(?:\[[^\]]*\])?(?:\([^)]*\))?: Audio: ([a-z0-9_]+)/i.exec(text);
  const size = video ? /[,\s](\d{2,5})x(\d{2,5})[,\s\]]/.exec(video[0]) : null;
  const rot = /displaymatrix: rotation of (-?\d+(?:\.\d+)?) degrees/i.exec(text) ?? /\brotate\s*:\s*(-?\d+)/i.exec(text);
  const rotation = rot ? Math.round(Number(rot[1])) : 0;
  return {
    durationSec: parseFfmpegDuration(text),
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    width: size ? Number(size[1]) : 0,
    height: size ? Number(size[2]) : 0,
    rotation: Number.isFinite(rotation) ? rotation : 0,
    videoCodec: video?.[1]?.toLowerCase() ?? null,
    audioCodec: audio?.[1]?.toLowerCase() ?? null,
  };
}

/** Portrait as the viewer sees it: a ±90° rotation swaps the coded width and height. */
export function displaysPortrait(p: Pick<BannerProbe, 'width' | 'height' | 'rotation'>): boolean {
  const quarter = Math.abs(Math.round(p.rotation / 90)) % 2 === 1;
  const w = quarter ? p.height : p.width;
  const h = quarter ? p.width : p.height;
  return h > w;
}

/** The real length of a file's first picture and first sound stream (null = no such stream). */
export interface StreamDurations {
  videoSec: number | null;
  audioSec: number | null;
  /**
   * How many packets the picture stream holds — for H.264 in MP4 one packet is one frame, so this is the frame count the
   * frame-exact QC compares with round(planned × OUTPUT_FPS) (Video Core v1.0 §4). Absent on a reader that does not count.
   */
  videoFrames?: number | null;
}

/**
 * Stream lengths out of `ffmpeg -map 0:v:0? -map 0:a:0? -c copy -f framecrc -` (the banner only has the container's
 * length): per stream, its time base and media type from the header lines, then the end of its last packet (pts +
 * duration) less where its first packet starts (encoder priming before 0 does not count).
 */
export function parseFrameCrc(text: string): StreamDurations {
  const tb = new Map<number, number>();
  const type = new Map<number, string>();
  const span = new Map<number, { start: number; end: number }>();
  const packets = new Map<number, number>();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const h = /^#(tb|media_type)\s+(\d+):\s*(\S+)/.exec(line);
    if (h) {
      const s = Number(h[2]);
      if (h[1] === 'tb') {
        const [num, den] = h[3]!.split('/').map(Number);
        if (num && den) tb.set(s, num / den);
      } else {
        type.set(s, h[3]!);
      }
      continue;
    }
    const p = /^\s*(\d+),\s*(-?\d+),\s*(-?\d+),\s*(\d+),/.exec(line);
    if (!p) continue;
    const s = Number(p[1]);
    const base = tb.get(s);
    if (!base) continue;
    const pts = Number(p[3]) * base;
    const end = pts + Number(p[4]) * base;
    packets.set(s, (packets.get(s) ?? 0) + 1);
    const cur = span.get(s);
    span.set(s, cur ? { start: Math.min(cur.start, pts), end: Math.max(cur.end, end) } : { start: pts, end });
  }
  const lengthOf = (kind: string): number | null => {
    for (const [s, t] of type) {
      const sp = span.get(s);
      if (t === kind && sp) return Number((sp.end - Math.max(0, sp.start)).toFixed(3));
    }
    return null;
  };
  const framesOf = (kind: string): number | null => {
    for (const [s, t] of type) if (t === kind && packets.has(s)) return packets.get(s)!;
    return null;
  };
  return { videoSec: lengthOf('video'), audioSec: lengthOf('audio'), videoFrames: framesOf('video') };
}
