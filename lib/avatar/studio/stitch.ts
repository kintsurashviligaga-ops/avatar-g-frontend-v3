/**
 * lib/avatar/studio/stitch.ts — one presentation from its scenes, and the 16:9 frame for a Live presenter. Pure,
 * client-safe (argv builders; the server runs ffmpeg).
 *
 *  - The presentation is joined by the Director's Workflow stitcher (lib/video/longform/stitch buildStitchPlan): a
 *    stream copy when every scene matches, else one re-encode. This file only orders and checks the scenes and gives
 *    the chapter marks the Presenter Card and the SRT use.
 *  - Live renders 704×1280 portrait. For 16:9 the take is composed onto a 1920×1080 frame: KEYED onto the background
 *    when the take was recorded on the green screen, else PILLARED (the portrait beside the background image).
 *    ⚠️ Keying Live's own output is unverified until the paid probe (D4); pillar is the safe default.
 */
import { isSafeSource, type StitchClip, type StitchMusic, type StitchPlanInput } from '@/lib/video/longform/stitch';
import { CHROMA_GREEN } from './prompts';

export interface RenderedScene {
  index: number;
  /** Our own storage URL or a local path. */
  source: string | null;
  durationSec: number | null;
  bytes?: number | null;
  title?: string;
}

export type StudioStitchResult =
  | { ok: true; input: StitchPlanInput; chapters: Chapter[]; totalSec: number }
  | { ok: false; reason: 'no_scenes' | 'scene_missing' | 'unsafe_source'; detail: string; missing?: number[] };

export interface Chapter { index: number; start: number; end: number; title: string }

/** The stitch input for a presentation: every scene rendered, in order, from a safe source. */
export function studioStitchInput(
  scenes: readonly RenderedScene[],
  opts: { workDir: string; outName?: string; music?: StitchMusic | null },
): StudioStitchResult {
  if (scenes.length === 0) return { ok: false, reason: 'no_scenes', detail: 'the presentation has no scenes' };
  const ordered = [...scenes].sort((a, b) => a.index - b.index);
  const missing = ordered.filter((s) => !s.source || !(s.durationSec && s.durationSec > 0)).map((s) => s.index);
  if (missing.length) return { ok: false, reason: 'scene_missing', detail: `scenes not ready: ${missing.map((i) => i + 1).join(', ')}`, missing };
  const unsafe = ordered.find((s) => !isSafeSource(s.source));
  if (unsafe) return { ok: false, reason: 'unsafe_source', detail: `scene ${unsafe.index + 1} has an unsafe source` };
  const clips: StitchClip[] = ordered.map((s) => ({ source: s.source!, durationSec: s.durationSec!, bytes: s.bytes ?? null }));
  const chapters: Chapter[] = [];
  let t = 0;
  for (const s of ordered) {
    chapters.push({ index: s.index, start: round3(t), end: round3(t + s.durationSec!), title: s.title ?? `Scene ${s.index + 1}` });
    t += s.durationSec!;
  }
  return {
    ok: true,
    input: { clips, workDir: opts.workDir, outName: opts.outName ?? 'presentation.mp4', music: opts.music ?? null },
    chapters,
    totalSec: round3(t),
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface ComposeInput {
  /** The Live take (portrait). */
  foreground: string;
  /** The background image; null = the take's own frame, blurred and filled (pillar only). */
  background: string | null;
  outPath: string;
  mode: 'key' | 'pillar';
  /** Where the presenter stands in the wide frame. */
  placement?: 'left' | 'center' | 'right';
  width?: number;
  height?: number;
  /** chromakey similarity / blend (ffmpeg defaults for broadcast green). */
  similarity?: number;
  blend?: number;
}

export type ComposeResult = { ok: true; argv: string[] } | { ok: false; reason: 'unsafe_source'; detail: string };

/** ffmpeg argv (without the binary) composing a portrait Live take onto a 16:9 background. Audio is the take's own. */
export function composeWideArgs(c: ComposeInput): ComposeResult {
  if (c.mode === 'key' && !c.background) return { ok: false, reason: 'unsafe_source', detail: 'keying needs a background image' };
  for (const s of c.background ? [c.foreground, c.background] : [c.foreground]) {
    if (!isSafeSource(s)) return { ok: false, reason: 'unsafe_source', detail: 'a compose input is not a safe source' };
  }
  const W = c.width ?? 1920, H = c.height ?? 1080;
  const place = c.placement ?? (c.mode === 'key' ? 'right' : 'center');
  // The presenter fills the frame height; x by placement, with a 6 % margin at the sides.
  const margin = Math.round(W * 0.06);
  const x = place === 'left' ? String(margin) : place === 'right' ? `W-w-${margin}` : '(W-w)/2';
  const key = CHROMA_GREEN.replace('#', '0x');
  const fg = c.mode === 'key'
    ? `[0:v]chromakey=${key}:${c.similarity ?? 0.12}:${c.blend ?? 0.08},scale=-2:${H}[fg]`
    : `[0:v]scale=-2:${H}[fg]`;
  const fill = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1${c.mode === 'pillar' ? ',boxblur=12:2' : ''}[bg]`;
  const self = !c.background;
  const graph = self
    ? `[0:v]split[s0][s1];[s0]${fill};[s1]scale=-2:${H}[fg];[bg][fg]overlay=x=${x}:y=(H-h)/2,format=yuv420p[v]`
    : `[1:v]${fill};${fg};[bg][fg]overlay=x=${x}:y=(H-h)/2:shortest=1,format=yuv420p[v]`;
  return {
    ok: true,
    argv: [
      '-y', '-i', c.foreground, ...(self ? [] : ['-loop', '1', '-i', c.background as string]),
      '-filter_complex', graph,
      '-map', '[v]', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-r', '24',
      '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
      c.outPath,
    ],
  };
}
