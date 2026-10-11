/**
 * lib/agent/media/layerPass.ts — the composition pass of Agent G's edit (Media Studio v2.1): the edit's text, picture
 * and mask layers and its caption track drawn (./layerRender), laid over the first pass's output in ONE ffmpeg run
 * (./layerCompose), then measured on the rendered file (./layerQc) before anything is delivered. FFmpeg and resvg only:
 * no model, no provider, free like the rest of the edit.
 *
 *   base     the first pass's output (the trimmed / reframed / graded video, or the picture): the layers' only input,
 *            so a revision that moves or removes a layer starts again from the source and leaves no trace;
 *   result   base + every layer, in z order, captions on top;
 *   clean    base + every layer but the captions (the captions' `both`); the base itself when captions were all;
 *   files    the caption track as .srt and .vtt (every delivery).
 */
import 'server-only';
import type { ExecFileOptions } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ffmpegExec, type FfmpegIo } from '@/lib/video/ffmpegExec';
import { analyzeTrack, probeMedia } from '@/lib/services/montage/beatAnalysis';
import type { MediaEdit } from './editPlan';
import { displayDims } from './editPlan';
import {
  maskRect, placeBox, safeArea, toSrt, toVtt,
  type CaptionTrack, type ImageLayer, type Layer, type Rect, type TextLayer,
} from './layers';
import { blankPng, drawCaptions, drawText, layoutText } from './layerRender';
import { composeStillArgs, composeVideoArgs, timeline, type ComposeItem, type OverlayItem } from './layerCompose';
import { checkLayers, grabFrame, meanDiff, meanLuminance, type LayerQcRecord, type QcSample } from './layerQc';

export interface LayerPassInput {
  bin: string;
  dir: string;
  /** The first pass's output. */
  base: string;
  out: string;
  /** Where the clean copy goes when one is asked for. */
  cleanOut: string;
  still: boolean;
  fw: number;
  fh: number;
  durationSec: number;
  edits: readonly MediaEdit[];
  /** The picture layers' files: ref → a URL or path ffmpeg may read. */
  assets: Readonly<Record<string, string>>;
  wantClean: boolean;
  exec: ExecFileOptions;
  io?: FfmpegIo;
}

export type LayerPassResult =
  | { ok: true; layerQc: LayerQcRecord; subtitles?: { srt: string; vtt: string }; clean?: string }
  | { ok: false; error: 'render_failed' | 'text_does_not_fit' | 'missing_glyphs' | 'layer_picture' | 'qc_failed'; detail: string };

/** The old one-line caption (the `caption` op) as a text layer: bottom, cinematic, the whole result. */
export function legacyCaptionLayer(text: string, durationSec: number, still: boolean): TextLayer {
  return {
    id: 't0', kind: 'text', role: 'text', text, anchor: 'bottom', size: 55, style: 'cinematic',
    motionIn: 'none', motionOut: 'none', motionSec: 0, z: 0, startSec: 0, endSec: still ? 0 : durationSec,
  };
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
/** A layer's way out, when it fades: half a second, or a quarter of a short layer. */
const fadeOutOf = (l: { motionOut: string; startSec: number; endSec: number }): number =>
  l.motionOut === 'fade' ? r3(Math.min(0.5, (l.endSec - l.startSec) / 4)) : 0;

/** Beats of the base's own sound inside [from, to), as seconds from `from` (null: no sound, or no pulse). */
async function beatsIn(base: string, from: number, to: number): Promise<number[] | null> {
  const a = await analyzeTrack(base).catch(() => null);
  if (!a?.grid) return null;
  const { periodSec, phaseSec } = a.grid;
  const out: number[] = [];
  for (let t = phaseSec; t < to; t += periodSec) if (t >= from - 0.001) out.push(r3(t - from));
  return out;
}

export async function runLayerPass(input: LayerPassInput): Promise<LayerPassResult> {
  const { bin, dir, base, still, fw, fh, durationSec: dur, exec, io = {} } = input;
  const layers: Layer[] = [];
  const legacy = input.edits.find((e) => e.op === 'caption');
  if (legacy?.op === 'caption') layers.push(legacyCaptionLayer(legacy.text, dur, still));
  const lop = input.edits.find((e) => e.op === 'layers');
  if (lop?.op === 'layers') layers.push(...lop.layers);
  const cop = input.edits.find((e) => e.op === 'captions');
  const track: CaptionTrack | null = cop?.op === 'captions' ? cop.track : null;
  const burnCaptions = Boolean(track) && cop?.op === 'captions' && cop.deliver !== 'file';

  const items: Array<ComposeItem & { z: number; caption?: boolean }> = [];
  const samples: Array<QcSample & { z: number; caption?: boolean }> = [];
  const partial: string[] = [];
  const area = safeArea(fw, fh);
  const blanks = new Map<string, string>();
  const blankFor = async (w: number, h: number): Promise<string> => {
    const key = `${w}x${h}`;
    let p = blanks.get(key);
    if (!p) {
      p = join(dir, `blank-${key}.png`);
      await writeFile(p, blankPng(w, h));
      blanks.set(key, p);
    }
    return p;
  };
  // The picture behind a box, once per instant (the legibility check of each text).
  let baseFrames: Map<number, Buffer> | null = null;
  const lumAt = async (t: number | null, box: Rect): Promise<number | null> => {
    baseFrames ??= new Map();
    const key = t ?? -1;
    let f = baseFrames.get(key);
    if (!f) {
      f = await grabFrame(bin, base, t, fw, fh).catch(() => Buffer.alloc(0));
      baseFrames.set(key, f);
    }
    return f.length === fw * fh * 3 ? meanLuminance(f, fw, box) : null;
  };

  for (const l of layers) {
    if (l.kind === 'text') {
      const laid = layoutText(l, fw, fh);
      if (!laid.ok) return { ok: false, error: laid.error, detail: laid.detail };
      const { layout } = laid;
      const midT = still ? null : r3((l.startSec + l.endSec) / 2);
      const lum = await lumAt(midT, layout.box);
      let beats: number[] | undefined;
      if (l.motionIn === 'words' && l.beats && !still) {
        const n = l.text.split(/\s+/).filter(Boolean).length;
        const b = await beatsIn(base, l.startSec, l.endSec);
        if (b && b.length >= n) beats = b.slice(0, n);
        else partial.push(`${l.id}: no beat found in the sound, the words are evenly spaced`);
      }
      const drawn = drawText(l, layout, lum, beats);
      const paths: string[] = [];
      for (const [k, st] of drawn.states.entries()) {
        const p = join(dir, `${l.id}-${k}.png`);
        await writeFile(p, st.png);
        paths.push(p);
      }
      const finalPng = paths[paths.length - 1]!;
      const revealEnd = drawn.revealAt ? drawn.revealAt[drawn.revealAt.length - 1]! + 0.05 : l.motionSec;
      const fadeIn = ['fade', 'slide-up', 'slide-left', 'scale'].includes(l.motionIn) ? l.motionSec : 0;
      const fadeOut = fadeOutOf(l);
      let input: string = finalPng;
      let isTimeline = false;
      if (!still) {
        const entries = drawn.states.map((st, k) => ({
          path: paths[k]!, fromSec: r3(l.startSec + st.atSec), toSec: r3(k + 1 < drawn.states.length ? l.startSec + drawn.states[k + 1]!.atSec : l.endSec),
        }));
        input = join(dir, `${l.id}.ffconcat`);
        await writeFile(input, timeline(entries, await blankFor(layout.box.w, layout.box.h), dur));
        isTimeline = true;
      }
      const item: OverlayItem = {
        kind: 'overlay', id: l.id, input, timeline: isTimeline, ...layout.box, startSec: l.startSec, endSec: l.endSec,
        fadeInSec: still ? 0 : fadeIn, fadeOutSec: still ? 0 : fadeOut,
        ...(!still && l.motionIn === 'slide-up' ? { slide: { axis: 'y' as const, off: Math.round(Math.max(layout.box.h * 0.8, fh * 0.04)), sec: l.motionSec } } : {}),
        ...(!still && l.motionIn === 'slide-left' ? { slide: { axis: 'x' as const, off: Math.round(fw * 0.08), sec: l.motionSec } } : {}),
      };
      items.push({ ...item, z: l.z });
      samples.push({
        id: l.id, kind: 'text', text: l.text, box: layout.box, startSec: l.startSec, endSec: l.endSec, z: l.z,
        shownFrom: r3(l.startSec + Math.max(revealEnd, fadeIn) + 0.05), shownTo: r3(l.endSec - fadeOut - 0.05),
        png: finalPng, contrast: drawn.panel.contrast, panelAdded: drawn.panel.added, fontPx: layout.fontPx,
        fitted: layout.fontPx < layout.askedPx, needsSafe: true,
      });
      continue;
    }
    if (l.kind === 'image') {
      const pic = await placePicture(input, l, area);
      if (!pic.ok) return pic;
      const fadeIn = l.motionIn !== 'none' ? l.motionSec : 0;
      const fadeOut = fadeOutOf(l);
      let src = pic.png;
      let isTimeline = false;
      if (!still) {
        src = join(dir, `${l.id}.ffconcat`);
        await writeFile(src, timeline([{ path: pic.png, fromSec: l.startSec, toSec: l.endSec }], await blankFor(pic.box.w, pic.box.h), dur));
        isTimeline = true;
      }
      items.push({
        kind: 'overlay', id: l.id, input: src, timeline: isTimeline, ...pic.box, startSec: l.startSec, endSec: l.endSec,
        fadeInSec: still ? 0 : fadeIn, fadeOutSec: still ? 0 : fadeOut, z: l.z,
        ...(!still && l.motionIn === 'slide-up' ? { slide: { axis: 'y' as const, off: Math.round(Math.max(pic.box.h * 0.8, fh * 0.04)), sec: l.motionSec } } : {}),
        ...(!still && l.motionIn === 'slide-left' ? { slide: { axis: 'x' as const, off: Math.round(fw * 0.08), sec: l.motionSec } } : {}),
      });
      samples.push({
        id: l.id, kind: 'image', box: pic.box, startSec: l.startSec, endSec: l.endSec, z: l.z,
        shownFrom: r3(l.startSec + fadeIn + 0.05), shownTo: r3(l.endSec - fadeOut - 0.05), png: pic.png,
        contrast: null, panelAdded: false, needsSafe: true,
      });
      continue;
    }
    const rect = maskRect(l, fw, fh);
    items.push({ kind: 'mask', id: l.id, rect, mode: l.mode, startSec: l.startSec, endSec: l.endSec, z: l.z });
    samples.push({
      id: l.id, kind: 'mask', box: rect, startSec: l.startSec, endSec: l.endSec, z: l.z, shownFrom: r3(l.startSec + 0.05),
      shownTo: r3(l.endSec - 0.05), png: null, contrast: null, panelAdded: false, needsSafe: false,
    });
  }

  let subtitles: { srt: string; vtt: string } | undefined;
  if (track) {
    subtitles = { srt: toSrt(track), vtt: toVtt(track) };
    if (burnCaptions && !still) {
      const drawn = drawCaptions(track, fw, fh);
      if (!drawn.ok) return { ok: false, error: drawn.error, detail: drawn.detail };
      const { box, states } = drawn.drawn;
      const entries: Array<{ path: string; fromSec: number; toSec: number }> = [];
      for (const [k, st] of states.entries()) {
        const p = join(dir, `cap-${k}.png`);
        await writeFile(p, st.png);
        entries.push({ path: p, fromSec: st.startSec, toSec: st.endSec });
      }
      const list = join(dir, 'captions.ffconcat');
      await writeFile(list, timeline(entries, await blankFor(box.w, box.h), dur));
      // Captions sit above every layer: they are read, the layers are looked at.
      items.push({ kind: 'overlay', id: 'captions', input: list, timeline: true, ...box, startSec: 0, endSec: dur, fadeInSec: 0, fadeOutSec: 0, z: 10_000, caption: true });
      // QC: up to eight lines spread over the track, each checked as drawn, in its own time.
      const pickN = Math.min(8, entries.length);
      for (let i = 0; i < pickN; i += 1) {
        const k = Math.round((i * (entries.length - 1)) / Math.max(1, pickN - 1));
        const e = entries[k]!;
        samples.push({
          id: `c${k + 1}`, kind: 'caption', text: states[k]!.text, box, startSec: e.fromSec, endSec: e.toSec, z: 10_000, caption: true,
          shownFrom: r3(e.fromSec + 0.04), shownTo: r3(e.toSec - 0.04), png: e.path, contrast: null, panelAdded: false, needsSafe: true,
        });
      }
      if (drawn.drawn.shrunk) partial.push(`${drawn.drawn.shrunk} caption line(s) set smaller to fit two lines`);
    }
  }

  const order = (a: { z: number }, b: { z: number }) => a.z - b.z;
  items.sort(order);
  samples.sort(order);
  const run = async (list: readonly ComposeItem[], out: string): Promise<string | null> => {
    try {
      await ffmpegExec(bin, still ? composeStillArgs(base, list, out) : composeVideoArgs(base, list, out), exec, io);
      return null;
    } catch (e) {
      const text = String((e as { stderr?: string })?.stderr ?? (e as Error)?.message ?? '');
      return text.trim().split('\n').filter(Boolean).pop()?.slice(0, 160) ?? 'ffmpeg failed';
    }
  };
  const failed = await run(items, input.out);
  if (failed) return { ok: false, error: 'render_failed', detail: `layers: ${failed}` };

  let clean: string | undefined;
  if (input.wantClean) {
    const rest = items.filter((i) => !i.caption);
    if (rest.length) {
      const f = await run(rest, input.cleanOut);
      if (f) return { ok: false, error: 'render_failed', detail: `clean copy: ${f}` };
      clean = input.cleanOut;
    } else {
      clean = base;
    }
  }

  const qc = await checkLayers({ bin, base, result: input.out, fw, fh, durationSec: dur, still, samples });
  // The clean copy: no caption line anywhere it was sampled.
  if (clean && clean !== base) {
    const cleanQc = await checkLayers({ bin, base, result: clean, fw, fh, durationSec: dur, still, samples: samples.filter((s) => !s.caption) });
    if (cleanQc.outcome === 'FAIL') qc.problems.push(...cleanQc.problems.map((p) => `clean copy: ${p}`));
  }
  if (clean) {
    for (const s of samples.filter((x) => x.caption).slice(0, 3)) {
      const t = r3((s.shownFrom + s.shownTo) / 2);
      const [c, b] = [await grabFrame(bin, clean, t, fw, fh), await grabFrame(bin, base, t, fw, fh)];
      const d = meanDiff(c, b, fw, s.box);
      if (d > 2.5) qc.problems.push(`clean copy: a caption is visible at ${t} s (diff ${Math.round(d * 100) / 100})`);
    }
  }
  if (qc.problems.length) qc.outcome = 'FAIL';
  else if (partial.length) {
    qc.outcome = 'PARTIAL';
    qc.warnings.push(...partial);
  }
  return { ok: true, layerQc: qc, ...(subtitles ? { subtitles } : {}), ...(clean ? { clean } : {}) };
}

/** A picture layer scaled to its size and placed (alpha kept); refused when the file is not a readable picture. */
async function placePicture(input: LayerPassInput, l: ImageLayer, area: Rect): Promise<{ ok: true; png: string; box: Rect } | { ok: false; error: 'layer_picture'; detail: string }> {
  const src = input.assets[l.ref];
  if (!src) return { ok: false, error: 'layer_picture', detail: `${l.id}: the picture is not available` };
  const probe = await probeMedia(src).catch(() => null);
  if (!probe?.hasVideo || !(probe.width > 0 && probe.height > 0)) return { ok: false, error: 'layer_picture', detail: `${l.id}: not a picture` };
  const shown = displayDims(probe);
  const w = Math.max(8, Math.round((l.size / 1000) * Math.min(input.fw, input.fh) / 2) * 2);
  const h = Math.max(2, Math.round((w * shown.height) / shown.width / 2) * 2);
  if (w > area.w || h > area.h) return { ok: false, error: 'layer_picture', detail: `${l.id}: too large for the frame` };
  const png = join(input.dir, `${l.id}.png`);
  try {
    await ffmpegExec(input.bin, ['-hide_banner', '-y', '-i', src, '-frames:v', '1', '-vf', `scale=${w}:${h}:flags=lanczos,format=rgba`, '-c:v', 'png', '-f', 'image2', png], input.exec, input.io ?? {});
  } catch {
    return { ok: false, error: 'layer_picture', detail: `${l.id}: the picture could not be read` };
  }
  const { x, y } = placeBox(l.anchor, w, h, area);
  return { ok: true, png, box: { x, y, w, h } };
}
