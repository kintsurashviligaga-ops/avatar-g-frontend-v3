/**
 * lib/services/montage/insertCompose.ts — the ffmpeg graph that lays the planned cutaways (./insertPlan) over the master
 * as a split screen: footage in the top half, the speaker in the bottom half, a cyan line between; full speaker outside.
 *
 * Input 0 is the master; input k+1 is cutaway k's clip, already seeked to its start and cut to its length by the input
 * options (`-ss`/`-t`, fast and frame-exact enough on a re-encode), then shifted onto the master's timeline. The bottom
 * half is the speaker's frame cropped around his face (`focusY`: the top of the crop as a share of the height; a
 * presenter's head sits in the upper third), so he is not squashed. The master's SOUND is copied untouched: the voice
 * never stops and nothing is resynced.
 *
 * Pure: builds argv, runs nothing.
 */
import { OUTPUT_FPS } from './beatPlan';
import type { PlannedInsert } from './insertPlan';

export interface InsertComposeOptions {
  w: number;
  h: number;
  /** Top of the speaker's crop, 0..0.5 of the height. */
  focusY?: number;
  /** The divider, as ffmpeg colour. */
  lineColor?: string;
}

/** Even pixel counts (yuv420p). */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const t3 = (n: number) => Number(n.toFixed(3));

/** `between(t,a,b)+…` for the given windows: ffmpeg's enable expression. */
export function enableExpr(inserts: readonly Pick<PlannedInsert, 'startSec' | 'endSec'>[]): string {
  return inserts.map((x) => `between(t,${t3(x.startSec)},${t3(x.endSec - 1 / (2 * OUTPUT_FPS))})`).join('+');
}

export function buildInsertArgs(
  master: string,
  clipUrls: readonly string[],
  inserts: readonly PlannedInsert[],
  out: string,
  o: InsertComposeOptions,
): string[] {
  const W = even(o.w), H = even(o.h);
  const half = even(H / 2);
  const focus = Math.min(0.5, Math.max(0, o.focusY ?? 0.12));
  const cropY = even(Math.min(H - half, focus * H));
  const line = o.lineColor ?? '0x22D3EE';
  const lineH = even(H / 213);
  const inputs: string[] = ['-i', master];
  const graph: string[] = [];
  const any = enableExpr(inserts);
  graph.push(`[0:v]fps=${OUTPUT_FPS},scale=${W}:${H},setsar=1,split=2[base][pres]`);
  graph.push(`[pres]crop=${W}:${half}:0:${cropY}[pb]`);
  graph.push(`[base][pb]overlay=0:${H - half}:enable='${any}'[s0]`);
  inserts.forEach((x, k) => {
    inputs.push('-ss', String(t3(x.clipStartSec)), '-t', String(t3(x.endSec - x.startSec + 0.1)), '-i', clipUrls[x.clip]!);
    graph.push(
      `[${k + 1}:v]fps=${OUTPUT_FPS},scale=${W}:${half}:force_original_aspect_ratio=increase,crop=${W}:${half},setsar=1,` +
      `setpts=PTS-STARTPTS+${t3(x.startSec)}/TB[c${k}]`,
    );
    graph.push(`[s${k}][c${k}]overlay=0:0:eof_action=pass:enable='${enableExpr([x])}'[s${k + 1}]`);
  });
  graph.push(`[s${inserts.length}]drawbox=x=0:y=${half - lineH / 2}:w=${W}:h=${lineH}:color=${line}:t=fill:enable='${any}',format=yuv420p[v]`);
  return [
    '-y', ...inputs,
    '-filter_complex', graph.join(';'),
    '-map', '[v]', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-r', String(OUTPUT_FPS),
    '-c:a', 'copy', '-movflags', '+faststart', out,
  ];
}
