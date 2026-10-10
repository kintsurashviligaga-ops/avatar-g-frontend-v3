/**
 * lib/agent/media/editPlan.ts — Agent G's edit of ONE video, in terms a server can check before anything runs: the typed
 * edits, their limits and their one order, what the result will be (length, sound, frame size), and the exact ffmpeg
 * arguments that make it. Pure: no ffmpeg, no I/O. ./editExec quotes and queues it, ./editWorker runs it.
 *
 * WHAT IT DOES (Master Task PART 3, slice 2): cut a stretch out (trim), play faster or slower (speed), a new frame shape
 * (aspect, crop or pad), a colour look (grade), fade in / out, louder / quieter / silent (volume, mute), one burned-in
 * line of text (caption), or one still frame as a picture (thumbnail). The filters are the remix's own
 * (lib/video/editFilters), so the same words make the same picture on both doors.
 *
 * WHAT IT DOES NOT: add music or a voice (the remix's charged ops: free here would undercut their price), join several
 * clips (that is the montage), or a split into several files (a run of trims: lib/agent/run). The model never picks
 * the numbers alone: the card shows the resolved edit and the user presses Start.
 *
 * ONE SIMPLE FILTERGRAPH. Every picture edit goes in one `-vf` chain, never `-filter_complex`: ffmpeg applies a phone
 * clip's rotation only for a simple graph (lib/video/remixOps fitAspect). A caption needs a second input (its PNG), so
 * it is a second pass over the first pass's output, whose rotation is already applied.
 */
import type { BannerProbe } from '@/lib/video/probeBanner';
import { MAX_CAPTION_CHARS } from '@/lib/video/remixCaption';
import {
  ASPECT_DIMS, GRADE_VF, MAX_SPEED, MIN_SPEED, aspectVf, atempoChain, setptsFor, type FrameAspect, type GradeStyle,
} from '@/lib/video/editFilters';

/** generation_jobs rows of Agent G's edits carry this queue kind in params._exec. */
export const EDIT_KIND = 'agent-media-edit';
/** FREE: only the function's own ffmpeg runs (the owner's choice for Agent G's ffmpeg-only work, 2026-10-09). */
export const EDIT_PRICE_CREDITS = 0;
/** The longest result: one worker re-encodes it inside its 600 s with room for the download and the upload. */
export const MAX_EDIT_OUTPUT_SEC = 300;
export const MIN_EDIT_OUTPUT_SEC = 0.5;
export const MAX_FADE_SEC = 10;
export const MIN_VOLUME_DB = -30;
export const MAX_VOLUME_DB = 20;
export { MAX_CAPTION_CHARS };

export type MediaEdit =
  | { op: 'trim'; fromSec: number; toSec: number }
  | { op: 'speed'; factor: number }
  | { op: 'aspect'; to: FrameAspect; fit: 'crop' | 'pad' }
  | { op: 'grade'; style: GradeStyle }
  | { op: 'fade'; inSec: number; outSec: number }
  | { op: 'volume'; db: number }
  | { op: 'mute' }
  | { op: 'caption'; text: string }
  | { op: 'thumbnail'; atSec: number };

export type EditName = MediaEdit['op'];

/** The one order edits are applied in (and stored in): time first, then the frame, then its look, then the sound. */
export const EDIT_ORDER: readonly EditName[] = ['trim', 'speed', 'aspect', 'grade', 'fade', 'volume', 'mute', 'caption', 'thumbnail'];
/** What a thumbnail (one still) can be combined with. */
const STILL_EDITS: ReadonlySet<EditName> = new Set(['aspect', 'grade', 'caption', 'thumbnail']);

export const ASPECTS: readonly FrameAspect[] = ['9:16', '16:9', '1:1', '4:5'];
export const GRADES: readonly GradeStyle[] = ['vintage', 'cinematic', 'neon', 'noir', 'dramatic'];

/** What the result will be, worked out at the quote from the source's probe and checked again after the render. */
export interface EditPlan {
  /** The source's length when it was quoted (the worker refuses a source that changed under the job). */
  sourceSec: number;
  output: 'mp4' | 'jpg';
  /** The result's length (0 for a picture). */
  durationSec: number;
  hasAudio: boolean;
  /** The result's frame as shown (after rotation). */
  width: number;
  height: number;
  /** Sound-only edits of an H.264 source keep its picture as it is (no re-encode, nothing lost, much faster). */
  copyVideo: boolean;
}

export interface EditRequest {
  v: 1;
  /** One file of the caller's own: an upload, a Library item, or a result Agent G made for them. */
  source: { ref: string };
  edits: MediaEdit[];
  name: string;
  plan: EditPlan;
}

export type EditPlanError = { ok: false; error: 'bad_edits' | 'no_video' | 'out_of_range' | 'too_long' | 'too_short' | 'conflict' | 'nothing_to_do'; message: string };

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** Seconds as ffmpeg reads them: at most three decimals, no exponent. */
export const secArg = (n: number): string => String(Math.round(n * 1000) / 1000);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const fail = (error: EditPlanError['error'], message: string): EditPlanError => ({ ok: false, error, message });

/** A caption as it may be burned: one paragraph, no control characters, at most MAX_CAPTION_CHARS. */
export function cleanCaption(x: unknown): string {
  if (typeof x !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return x.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CAPTION_CHARS).trim();
}

/** The frame as it is shown: a phone clip coded landscape with a ±90° rotation is shown portrait. */
export function displayDims(p: Pick<BannerProbe, 'width' | 'height' | 'rotation'>): { width: number; height: number } {
  const quarter = Math.abs(Math.round(p.rotation / 90)) % 2 === 1;
  return quarter ? { width: p.height, height: p.width } : { width: p.width, height: p.height };
}

const even = (n: number): number => Math.max(2, Math.floor(n / 2) * 2);

/**
 * The edits as asked (the chat's words, a model's tool call, a run step) → the stored edits, resolved against the
 * source's probe. A trim may be asked as `fromSec` / `toSec` / both, as the last `lastSec` seconds, or with the last
 * `cutEndSec` seconds cut off; a thumbnail without `atSec` takes the frame at 1 s (or the middle of a shorter clip).
 * Everything else must be exact.
 */
export function resolveEdits(
  asks: unknown,
  src: Pick<BannerProbe, 'durationSec' | 'hasVideo' | 'hasAudio' | 'width' | 'height' | 'rotation' | 'videoCodec'>,
): { ok: true; edits: MediaEdit[]; plan: EditPlan } | EditPlanError {
  if (!Array.isArray(asks) || asks.length === 0) return fail('nothing_to_do', 'Say what to change.');
  if (asks.length > EDIT_ORDER.length) return fail('bad_edits', 'Too many edits at once.');
  if (!src.hasVideo || !(src.width > 0 && src.height > 0)) return fail('no_video', 'This file has no picture to edit.');
  // Every number is rounded BEFORE it is checked, so the stored request passes the same checks again (validateEditRequest).
  const dur = round2(src.durationSec);
  if (!(dur > 0)) return fail('no_video', 'This file\'s length cannot be read.');

  const seen = new Set<EditName>();
  const edits: MediaEdit[] = [];
  for (const raw of asks) {
    const a = raw as Record<string, unknown> | null;
    const op = a && typeof a === 'object' ? a.op : undefined;
    if (typeof op !== 'string' || !(EDIT_ORDER as readonly string[]).includes(op)) return fail('bad_edits', 'An edit is not one Agent G knows.');
    if (seen.has(op as EditName)) return fail('bad_edits', `"${op}" is asked twice.`);
    seen.add(op as EditName);
    switch (op as EditName) {
      case 'trim': {
        const from = a!.fromSec, to = a!.toSec, last = a!.lastSec, cutEnd = a!.cutEndSec;
        let f: number, t: number;
        if (last !== undefined || cutEnd !== undefined) {
          const k = last ?? cutEnd;
          if (!isNum(k) || k <= 0 || (last !== undefined && cutEnd !== undefined) || from !== undefined || to !== undefined) return fail('bad_edits', 'A trim is a range, the last seconds, or the end cut off: one of them.');
          if (k >= dur) return fail('out_of_range', `The video is ${secArg(dur)} s long.`);
          [f, t] = last !== undefined ? [dur - k, dur] : [0, dur - k];
        } else {
          if ((from !== undefined && !isNum(from)) || (to !== undefined && !isNum(to)) || (from === undefined && to === undefined)) return fail('bad_edits', 'A trim needs where it starts or ends.');
          f = from === undefined ? 0 : (from as number); t = to === undefined ? dur : (to as number);
        }
        f = round2(f); t = round2(t);
        // A range that ends a hair past the end (a rounded length) ends at the end.
        if (t > dur && t - dur <= 0.25) t = dur;
        if (f < 0 || f >= dur || t > dur) return fail('out_of_range', `The video is ${secArg(dur)} s long.`);
        if (!(t - f >= MIN_EDIT_OUTPUT_SEC)) return fail('too_short', 'The part to keep is shorter than half a second.');
        if (f <= 0.05 && t >= dur - 0.05) return fail('nothing_to_do', 'That keeps the whole video.');
        edits.push({ op: 'trim', fromSec: f, toSec: t });
        break;
      }
      case 'speed': {
        const f = isNum(a!.factor) ? round2(a!.factor) : NaN;
        if (!(f >= MIN_SPEED && f <= MAX_SPEED)) return fail('bad_edits', `Speed is between ${MIN_SPEED}× and ${MAX_SPEED}×.`);
        if (f === 1) return fail('nothing_to_do', 'That is the same speed.');
        edits.push({ op: 'speed', factor: f });
        break;
      }
      case 'aspect': {
        const to = a!.to, fit = a!.fit ?? 'crop';
        if (!(ASPECTS as readonly unknown[]).includes(to) || (fit !== 'crop' && fit !== 'pad')) return fail('bad_edits', 'The frame is 9:16, 16:9, 1:1 or 4:5.');
        edits.push({ op: 'aspect', to: to as FrameAspect, fit });
        break;
      }
      case 'grade': {
        if (!(GRADES as readonly unknown[]).includes(a!.style)) return fail('bad_edits', 'That colour look is not one Agent G has.');
        edits.push({ op: 'grade', style: a!.style as GradeStyle });
        break;
      }
      case 'fade': {
        const i = a!.inSec ?? 0, o = a!.outSec ?? 0;
        if (!isNum(i) || !isNum(o)) return fail('bad_edits', `A fade is up to ${MAX_FADE_SEC} s.`);
        const fi = round2(i), fo = round2(o);
        if (fi < 0 || fo < 0 || fi > MAX_FADE_SEC || fo > MAX_FADE_SEC || (fi === 0 && fo === 0)) return fail('bad_edits', `A fade is up to ${MAX_FADE_SEC} s.`);
        edits.push({ op: 'fade', inSec: fi, outSec: fo });
        break;
      }
      case 'volume': {
        const db = isNum(a!.db) ? Math.round(a!.db * 10) / 10 : NaN;
        if (!(db >= MIN_VOLUME_DB && db <= MAX_VOLUME_DB) || Math.abs(db) < 0.5) return fail('bad_edits', `Volume changes by ${MIN_VOLUME_DB} to +${MAX_VOLUME_DB} dB.`);
        edits.push({ op: 'volume', db });
        break;
      }
      case 'mute':
        edits.push({ op: 'mute' });
        break;
      case 'caption': {
        const text = cleanCaption(a!.text);
        if (!text) return fail('bad_edits', 'Say the words to put on the video.');
        edits.push({ op: 'caption', text });
        break;
      }
      case 'thumbnail': {
        const raw = a!.atSec === undefined ? Math.min(1, dur / 2) : a!.atSec;
        const at = isNum(raw) ? round2(raw) : NaN;
        if (!(at >= 0 && at < dur)) return fail('out_of_range', `The video is ${secArg(dur)} s long.`);
        edits.push({ op: 'thumbnail', atSec: at });
        break;
      }
    }
  }

  // ── what goes with what ───────────────────────────────────────────────────────────────────────────────────────────
  if (seen.has('thumbnail') && [...seen].some((n) => !STILL_EDITS.has(n))) return fail('conflict', 'A thumbnail is one picture: it takes a frame shape, a colour look and a caption, nothing about time or sound.');
  if (seen.has('mute') && seen.has('volume')) return fail('conflict', 'Silent and louder at once?');
  if ((seen.has('mute') || seen.has('volume')) && !src.hasAudio) return fail('conflict', 'This video has no sound.');
  edits.sort((x, y) => EDIT_ORDER.indexOf(x.op) - EDIT_ORDER.indexOf(y.op));

  // ── the result ────────────────────────────────────────────────────────────────────────────────────────────────────
  const get = <K extends EditName>(k: K) => edits.find((e) => e.op === k) as Extract<MediaEdit, { op: K }> | undefined;
  const trim = get('trim'), speed = get('speed'), aspect = get('aspect'), fade = get('fade');
  const still = Boolean(get('thumbnail'));
  const kept = trim ? trim.toSec - trim.fromSec : dur;
  const outSec = still ? 0 : round2(kept / (speed?.factor ?? 1));
  if (!still && outSec > MAX_EDIT_OUTPUT_SEC) return fail('too_long', `The result would be ${Math.round(outSec)} s; Agent G edits up to ${MAX_EDIT_OUTPUT_SEC} s at a time. Trim it first.`);
  if (!still && outSec < MIN_EDIT_OUTPUT_SEC) return fail('too_short', 'The result would be shorter than half a second.');
  if (fade && fade.inSec + fade.outSec > outSec) return fail('conflict', 'The fades are longer than the video.');

  const shown = displayDims(src);
  const copyVideo = !still && edits.every((e) => e.op === 'volume' || e.op === 'mute') && src.videoCodec === 'h264';
  const [w, h] = aspect ? ASPECT_DIMS[aspect.to] : copyVideo ? [shown.width, shown.height] : [even(shown.width), even(shown.height)];
  return {
    ok: true,
    edits,
    plan: {
      sourceSec: dur, output: still ? 'jpg' : 'mp4', durationSec: outSec,
      hasAudio: !still && src.hasAudio && !get('mute'), width: w, height: h, copyVideo,
    },
  };
}

/** The stored (or returned) request, checked field by field; null when anything is off. */
export function validateEditRequest(x: unknown): EditRequest | null {
  const r = x as Partial<EditRequest> | null;
  if (!r || typeof r !== 'object' || r.v !== 1) return null;
  if (!r.source || typeof r.source.ref !== 'string' || !r.source.ref.trim() || r.source.ref.length > 2048) return null;
  if (typeof r.name !== 'string' || !/^[^/\\]{1,108}\.(?:mp4|jpg)$/.test(r.name)) return null;
  const p = r.plan as EditPlan | undefined;
  if (!p || (p.output !== 'mp4' && p.output !== 'jpg') || !r.name.endsWith(`.${p.output}`)) return null;
  if (!isNum(p.sourceSec) || !(p.sourceSec > 0) || !isNum(p.durationSec) || !isNum(p.width) || !isNum(p.height) || !(p.width > 0 && p.height > 0)) return null;
  if (typeof p.hasAudio !== 'boolean' || typeof p.copyVideo !== 'boolean') return null;
  if (p.output === 'mp4' && !(p.durationSec >= MIN_EDIT_OUTPUT_SEC && p.durationSec <= MAX_EDIT_OUTPUT_SEC)) return null;
  if (!Array.isArray(r.edits) || r.edits.length === 0) return null;
  // The edits again, against the plan's own facts: the same rules the quote applied, the same result.
  const again = resolveEdits(r.edits, {
    durationSec: p.sourceSec, hasVideo: true, hasAudio: p.hasAudio || r.edits.some((e) => e?.op === 'mute'),
    width: p.width, height: p.height, rotation: 0, videoCodec: p.copyVideo ? 'h264' : null,
  });
  if (!again.ok) return null;
  if (JSON.stringify(again.edits) !== JSON.stringify(r.edits)) return null;
  if (again.plan.output !== p.output || Math.abs(again.plan.durationSec - p.durationSec) > 0.011) return null;
  return r as EditRequest;
}

const edit = <K extends EditName>(edits: readonly MediaEdit[], k: K) => edits.find((e) => e.op === k) as Extract<MediaEdit, { op: K }> | undefined;

/** The picture chain (`-vf`) of the first pass. */
export function videoFilters(req: Pick<EditRequest, 'edits' | 'plan'>): string[] {
  const { edits, plan } = req;
  const vf: string[] = [];
  const speed = edit(edits, 'speed'), aspect = edit(edits, 'aspect'), grade = edit(edits, 'grade'), fade = edit(edits, 'fade');
  const still = plan.output === 'jpg';
  if (speed) vf.push(setptsFor(speed.factor));
  if (aspect) {
    const a = aspectVf(aspect.to, aspect.fit);
    // A JPEG takes full-range YUV: leave the pixel format to the encoder.
    vf.push(still ? a.replace(/,format=yuv420p$/, '') : a);
  } else if (!still) {
    vf.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  }
  if (grade) vf.push(GRADE_VF[grade.style]);
  if (fade && fade.inSec > 0) vf.push(`fade=t=in:st=0:d=${secArg(fade.inSec)}`);
  if (fade && fade.outSec > 0) vf.push(`fade=t=out:st=${secArg(Math.max(0, plan.durationSec - fade.outSec))}:d=${secArg(fade.outSec)}`);
  if (!still && !/format=yuv420p$/.test(vf[vf.length - 1] ?? '')) vf.push('format=yuv420p');
  return vf;
}

/** The sound chain (`-af`) of the first pass; empty when the sound passes through as it is (still re-encoded to AAC). */
export function audioFilters(req: Pick<EditRequest, 'edits' | 'plan'>): string[] {
  const { edits, plan } = req;
  if (!plan.hasAudio) return [];
  const af: string[] = [];
  const speed = edit(edits, 'speed'), volume = edit(edits, 'volume'), fade = edit(edits, 'fade');
  if (speed) af.push(atempoChain(speed.factor));
  if (volume) af.push(`volume=${volume.db}dB`);
  if (fade && fade.inSec > 0) af.push(`afade=t=in:st=0:d=${secArg(fade.inSec)}`);
  if (fade && fade.outSec > 0) af.push(`afade=t=out:st=${secArg(Math.max(0, plan.durationSec - fade.outSec))}:d=${secArg(fade.outSec)}`);
  return af;
}

const X264 = (crf: number): string[] => ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p'];

/**
 * The first pass: the source → the edited video (or the still). With a caption still to come, the video is written a
 * little finer (it is encoded once more) and the still is a PNG (no second JPEG generation).
 */
export function renderArgs(req: Pick<EditRequest, 'edits' | 'plan'>, input: string, out: string): string[] {
  const { edits, plan } = req;
  const captioned = Boolean(edit(edits, 'caption'));
  if (plan.output === 'jpg') {
    const at = edit(edits, 'thumbnail')!.atSec;
    const vf = videoFilters(req);
    return [
      '-hide_banner', '-y', '-ss', secArg(at), '-i', input, '-map', '0:v:0', '-frames:v', '1', '-an', '-sn', '-dn',
      ...(vf.length ? ['-vf', vf.join(',')] : []),
      ...(captioned ? ['-c:v', 'png'] : ['-c:v', 'mjpeg', '-q:v', '2', '-strict', 'unofficial']),
      '-map_metadata', '-1', '-f', 'image2', out,
    ];
  }
  const trim = edit(edits, 'trim');
  const af = audioFilters(req);
  return [
    '-hide_banner', '-y',
    ...(trim ? ['-ss', secArg(trim.fromSec), '-t', secArg(trim.toSec - trim.fromSec)] : []),
    '-i', input,
    '-map', '0:v:0', ...(plan.hasAudio ? ['-map', '0:a:0'] : []),
    ...(plan.copyVideo ? ['-c:v', 'copy'] : ['-vf', videoFilters(req).join(','), ...X264(captioned ? 18 : 20)]),
    ...(plan.hasAudio ? [...(af.length ? ['-af', af.join(',')] : []), '-c:a', 'aac', '-b:a', '192k'] : ['-an']),
    '-sn', '-dn', '-map_metadata', '-1', '-movflags', '+faststart', '-f', 'mp4', out,
  ];
}

/** The caption's size on a frame: a line a phone can read, the same share of the short side on every shape. */
export const captionFontPx = (width: number, height: number): number => Math.max(18, Math.round(Math.min(width, height) * 0.055));

/** The second pass: the caption's full-frame PNG over the first pass's output. */
export function captionArgs(output: 'mp4' | 'jpg', mid: string, png: string, out: string): string[] {
  if (output === 'jpg') {
    return [
      '-hide_banner', '-y', '-i', mid, '-i', png, '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto[v]', '-map', '[v]',
      '-frames:v', '1', '-c:v', 'mjpeg', '-q:v', '2', '-strict', 'unofficial', '-f', 'image2', out,
    ];
  }
  return [
    '-hide_banner', '-y', '-i', mid, '-i', png, '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]',
    '-map', '[v]', '-map', '0:a?', ...X264(20), '-c:a', 'copy', '-movflags', '+faststart', '-f', 'mp4', out,
  ];
}

/** The result's file name: the source's own name with "-edit" (or "-thumbnail"), never a path. */
export function editNameFor(hint: string | null | undefined, output: 'mp4' | 'jpg'): string {
  let base = '';
  const h = typeof hint === 'string' ? hint : '';
  try {
    base = /^https?:\/\//i.test(h) ? decodeURIComponent(new URL(h).pathname.split('/').filter(Boolean).pop() ?? '') : (h.split(/[/\\]/).pop() ?? '');
  } catch {
    base = '';
  }
  base = base.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[^\p{L}\p{N} ._()&,'+-]+/gu, ' ').replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '').slice(0, 90).trim();
  return `${base || 'video'}-${output === 'jpg' ? 'thumbnail' : 'edit'}.${output}`;
}

export interface EditVerdict {
  ok: boolean;
  problems: string[];
  durationSec: number;
}

/**
 * QC of the result before it is delivered: a video is H.264 picture (AAC sound exactly when sound was planned), the
 * planned frame, and the planned length within 0.5 s or 3 %; a picture is one frame of the planned size. A result that
 * fails is not delivered.
 */
export function qcEdit(out: BannerProbe | null, plan: EditPlan, bytes: number): EditVerdict {
  if (!out) return { ok: false, problems: ['the result could not be read back'], durationSec: 0 };
  const problems: string[] = [];
  if (!(bytes >= 1024)) problems.push(`only ${bytes} bytes`);
  if (!out.hasVideo) problems.push('no picture');
  const shown = displayDims(out);
  if (shown.width !== plan.width || shown.height !== plan.height) problems.push(`frame ${shown.width}x${shown.height}, planned ${plan.width}x${plan.height}`);
  if (plan.output === 'jpg') {
    if (out.videoCodec !== 'mjpeg') problems.push(`picture codec ${out.videoCodec ?? 'unknown'}`);
    return { ok: problems.length === 0, problems, durationSec: 0 };
  }
  if (out.hasVideo && out.videoCodec !== 'h264') problems.push(`picture codec ${out.videoCodec ?? 'unknown'}`);
  if (plan.hasAudio && !out.hasAudio) problems.push('the sound is missing');
  if (!plan.hasAudio && out.hasAudio) problems.push('sound that should be gone');
  if (plan.hasAudio && out.hasAudio && out.audioCodec !== 'aac') problems.push(`sound codec ${out.audioCodec ?? 'unknown'}`);
  const tolerance = Math.max(0.5, plan.durationSec * 0.03);
  if (!(Math.abs(out.durationSec - plan.durationSec) <= tolerance)) problems.push(`length ${out.durationSec.toFixed(2)}s, planned ${plan.durationSec.toFixed(2)}s`);
  return { ok: problems.length === 0, problems, durationSec: out.durationSec };
}
