/**
 * lib/agent/media/layerCompose.ts — the ffmpeg arguments that lay Agent G's drawn layers (./layerRender) over a video or
 * a picture: ONE pass, ffmpeg's universal `overlay` (ffmpeg-static has no drawtext), FFmpeg only, no model.
 *
 * Each layer is one input. Its states (a typewriter's letters, a caption track's lines) are PNGs of one size played as a
 * timeline by the concat demuxer (`file … / duration …`), with transparent gaps, so a caption track of hundreds of lines
 * is still one input. Times are exact to the frame: the overlay is enabled on [start, end), the fade and the slide are
 * functions of the frame's time. Layers are stacked in their z order; a mask blurs or pixelates its region in place.
 *
 * Pure strings: no ffmpeg runs here (./editLive writes the files and runs the pass), so the graph is tested as text.
 */
import type { Rect } from './layers';

/** The frame rate a layer's timeline is sampled at (the overlay then takes, for each video frame, the latest one). */
export const LAYER_FPS = 30;

export interface TimelineEntry {
  path: string;
  fromSec: number;
  toSec: number;
}

const s3 = (n: number): string => String(Math.max(0, Math.round(n * 1000) / 1000));
/** A path inside an ffconcat file: single-quoted, a quote written as '\''. */
const quotePath = (p: string): string => `'${p.replace(/'/g, "'\\''")}'`;

/**
 * An ffconcat timeline of `entries` (in time order, not overlapping) on a `totalSec` result, a transparent `blank`
 * filling every gap. The last entry is written twice: the concat demuxer ignores the last file's duration.
 */
export function timeline(entries: readonly TimelineEntry[], blank: string, totalSec: number): string {
  const rows: string[] = ['ffconcat version 1.0'];
  let at = 0;
  const put = (path: string, sec: number) => {
    if (sec <= 0.0005) return;
    rows.push(`file ${quotePath(path)}`, `duration ${s3(sec)}`);
  };
  for (const e of entries) {
    if (e.fromSec > at) put(blank, e.fromSec - at);
    const from = Math.max(at, e.fromSec);
    put(e.path, e.toSec - from);
    at = Math.max(at, e.toSec);
  }
  put(blank, Math.max(0, totalSec - at) + 1);
  rows.push(`file ${quotePath(blank)}`);
  return `${rows.join('\n')}\n`;
}

export interface OverlayItem {
  kind: 'overlay';
  id: string;
  /** An ffconcat timeline (video), or one PNG (a still, or a layer with one state). */
  input: string;
  timeline: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  startSec: number;
  endSec: number;
  /** Alpha fade in / out, seconds (0 = none). */
  fadeInSec: number;
  fadeOutSec: number;
  /** A slide in: from `off` px away along `axis` to its place, eased out over `sec`. */
  slide?: { axis: 'x' | 'y'; off: number; sec: number };
}

export interface MaskItem {
  kind: 'mask';
  id: string;
  rect: Rect;
  mode: 'blur' | 'mosaic';
  startSec: number;
  endSec: number;
}

export type ComposeItem = OverlayItem | MaskItem;

const enableFor = (s: number, e: number): string => `gte(t,${s3(s)})*lt(t,${s3(e)})`;

function maskChain(m: MaskItem): string {
  const { x, y, w, h } = m.rect;
  if (m.mode === 'mosaic') {
    const sw = Math.max(2, Math.round(w / 24)), sh = Math.max(2, Math.round(h / 24));
    return `crop=${w}:${h}:${x}:${y},scale=${sw}:${sh}:flags=neighbor,scale=${w}:${h}:flags=neighbor`;
  }
  const r = Math.max(4, Math.min(40, Math.round(Math.min(w, h) / 10)));
  const cr = Math.max(1, Math.min(r, Math.floor(Math.min(w, h) / 4) - 1));
  return `crop=${w}:${h}:${x}:${y},boxblur=luma_radius=${r}:luma_power=2:chroma_radius=${cr}:chroma_power=2`;
}

/**
 * The filtergraph and the extra inputs of one composition pass. Input 0 is the base (the edit's first pass); each
 * overlay item is the next input. `still` = a picture: no time, no motion, every layer shown.
 */
export function composeGraph(items: readonly ComposeItem[], opts: { still: boolean }): { inputs: string[][]; graph: string; out: string } {
  // A picture ends as full-colour JPEG (4:4:4: coloured text keeps its edges); a video as H.264's 4:2:0.
  const finalFormat = opts.still ? 'yuvj444p' : 'yuv420p';
  const inputs: string[][] = [];
  const chains: string[] = [];
  let cur = '0:v';
  let n = 0;
  for (const it of items) {
    const next = `b${++n}`;
    if (it.kind === 'mask') {
      const en = opts.still ? '' : `:enable='${enableFor(it.startSec, it.endSec)}'`;
      chains.push(`[${cur}]split[m${n}a][m${n}b]`, `[m${n}b]${maskChain(it)}[m${n}c]`, `[m${n}a][m${n}c]overlay=x=${it.rect.x}:y=${it.rect.y}${en}[${next}]`);
      cur = next;
      continue;
    }
    const idx = inputs.length + 1;
    inputs.push(it.timeline ? ['-f', 'concat', '-safe', '0', '-i', it.input] : ['-i', it.input]);
    const src: string[] = [];
    if (!opts.still) {
      src.push(`fps=${LAYER_FPS}`, 'format=rgba');
      if (it.fadeInSec > 0) src.push(`fade=t=in:st=${s3(it.startSec)}:d=${s3(it.fadeInSec)}:alpha=1`);
      if (it.fadeOutSec > 0) src.push(`fade=t=out:st=${s3(Math.max(it.startSec, it.endSec - it.fadeOutSec))}:d=${s3(it.fadeOutSec)}:alpha=1`);
    } else {
      src.push('format=rgba');
    }
    chains.push(`[${idx}:v]${src.join(',')}[l${n}]`);
    let x = String(it.x), y = String(it.y);
    if (!opts.still && it.slide && it.slide.sec > 0) {
      const p = `pow(1-clip((t-${s3(it.startSec)})/${s3(it.slide.sec)},0,1),3)`;
      if (it.slide.axis === 'x') x = `'${it.x}+${Math.round(it.slide.off)}*${p}'`;
      else y = `'${it.y}+${Math.round(it.slide.off)}*${p}'`;
    }
    // shortest=1: the result ends with the base (a layer's timeline runs past it on purpose; overlay would otherwise
    // keep the base's last frame up until every layer input ended).
    const timed = opts.still ? '' : `:eval=frame:shortest=1:enable='${enableFor(it.startSec, it.endSec)}'`;
    chains.push(`[${cur}][l${n}]overlay=x=${x}:y=${y}${timed}:format=auto[${next}]`);
    cur = next;
  }
  chains.push(`[${cur}]format=${finalFormat}[vout]`);
  return { inputs, graph: chains.join(';'), out: 'vout' };
}

const X264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p'];

/** The composition pass over a video: the layers on the first pass's output, its sound copied as it is. */
export function composeVideoArgs(base: string, items: readonly ComposeItem[], out: string): string[] {
  const g = composeGraph(items, { still: false });
  return [
    '-hide_banner', '-y', '-i', base, ...g.inputs.flat(),
    '-filter_complex', g.graph, '-map', `[${g.out}]`, '-map', '0:a?',
    ...X264, '-c:a', 'copy', '-shortest', '-movflags', '+faststart', '-f', 'mp4', out,
  ];
}

/** The composition pass over a picture: one frame, a JPEG. */
export function composeStillArgs(base: string, items: readonly ComposeItem[], out: string): string[] {
  const g = composeGraph(items, { still: true });
  return [
    '-hide_banner', '-y', '-i', base, ...g.inputs.flat(),
    '-filter_complex', g.graph, '-map', `[${g.out}]`, '-frames:v', '1',
    '-c:v', 'mjpeg', '-q:v', '2', '-strict', 'unofficial', '-f', 'image2', out,
  ];
}
