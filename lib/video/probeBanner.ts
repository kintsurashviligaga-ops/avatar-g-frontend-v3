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
