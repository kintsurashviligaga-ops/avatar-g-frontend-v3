/**
 * lib/agent/media/editPlan.ts — Agent G's edit of ONE video, in terms a server can check before anything runs: the typed
 * edits, their limits and their one order, what the result will be (length, sound, frame size), and the exact ffmpeg
 * arguments that make it. Pure: no ffmpeg, no I/O. ./editExec quotes and queues it, ./editWorker runs it.
 *
 * WHAT IT DOES (Master Task PART 3, slice 2): cut a stretch out (trim), play faster or slower (speed), a new frame shape
 * (aspect, crop or pad), a colour look (grade), fade in / out, louder / quieter / silent (volume, mute), one burned-in
 * line of text (caption), or one still frame as a picture (thumbnail). An overlay over the whole picture (warm light
 * leaks drifting over it, or film grain: ./overlayFx) is its own pass between the first and the layers. The filters are the remix's own
 * (lib/video/editFilters), so the same words make the same picture on both doors.
 *
 * EFFECTS (GG 2026-10-11 17:38Z: „ქაფქათს და სხვა ფუნქციებს რაც აკლია"): CapCut's everyday tools, ffmpeg only and free:
 * the picture's own light and colour (brightness, contrast, saturation, warmth, sharpness, a vignette: `adjust`), a mirror
 * or an upside-down flip, a quarter turn, a slow zoom in or out, a camera shake or a glitch (`motion`), a steadied shaky
 * clip (`stabilize`), a new frame filled with the picture's own blur instead of bars (aspect `fit: 'blur'`), the noise
 * taken out of the sound (`denoise`) and the sound evened out to one loudness (`loudness`). Playing backwards is not here:
 * ffmpeg's reverse holds every frame of the clip in memory at once, more than one worker has.
 *
 * ERASE (GG 2026-10-11 17:38Z: „ვიდეოში ტექსტი … წაშლა, ამოღება, მოშორება"): a logo, a watermark, a text or burned-in
 * subtitles that stay in ONE place of the source picture are filled in from the pixels around that place (ffmpeg delogo),
 * over the whole result or a stretch of it, on a video or a picture. Something that moves (a person, a car, a text that
 * travels) is not a fixed place: that is AI inpainting, a paid provider call, the owner's decision; it is said, not faked.
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
  ASPECT_DIMS, GRADE_VF, MAX_SPEED, MIN_SPEED, aspectVf, atempoChain, setptsFor, type FrameAspect, type FrameFit, type GradeStyle,
} from '@/lib/video/editFilters';
import {
  ANCHORS, resolveLayers, resolveTrack, type Anchor, type CaptionDelivery, type CaptionTrack, type Layer, type LayersAsk,
} from './layers';

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
  | { op: 'aspect'; to: FrameAspect; fit: FrameFit }
  | { op: 'grade'; style: GradeStyle }
  /** The picture's own light and colour, each a step from −100 to 100 (sharpen and vignette 0 to 100); 0 is left out. */
  | ({ op: 'adjust' } & Adjust)
  /** A mirror (left to right) or upside down. */
  | { op: 'flip'; axis: FlipAxis }
  /** A quarter turn clockwise (90), a half turn (180) or a quarter turn the other way (270). */
  | { op: 'rotate'; deg: 90 | 180 | 270 }
  /** Movement over the whole result: a slow zoom in or out, a camera shake, a glitch (any of them together). */
  | { op: 'motion'; zoom?: ZoomWay; shake?: true; glitch?: true }
  /** A shaky clip steadied (ffmpeg deshake). */
  | { op: 'stabilize' }
  /** Hiss, hum and steady background noise taken out of the sound. */
  | { op: 'denoise' }
  /** The sound evened out to one loudness (-14 LUFS, the level social apps play at). */
  | { op: 'loudness' }
  | { op: 'fade'; inSec: number; outSec: number }
  | { op: 'volume'; db: number }
  | { op: 'mute' }
  | { op: 'caption'; text: string }
  /** What is in the source picture itself, at fixed places, filled in from around it (a logo, a watermark, subtitles). */
  | { op: 'erase'; boxes: EraseBox[] }
  /** An overlay over the whole picture: warm light leaks drifting over it, or film grain (./overlayFx). Video only. */
  | { op: 'overlay'; look: OverlayLook }
  /** Media Studio v2.1: the edit's own text, picture and mask layers (./layers), drawn over the result, non-destructive. */
  | { op: 'layers'; layers: Layer[] }
  /** A caption track: burned in, burned in plus a clean copy, or a clean video with the .srt / .vtt only. */
  | { op: 'captions'; track: CaptionTrack; deliver: CaptionDelivery }
  | { op: 'thumbnail'; atSec: number };

export type EditName = MediaEdit['op'];

/** The one order edits are applied in (and stored in): time first, then the frame, then its look, then the sound. */
export const EDIT_ORDER: readonly EditName[] = [
  'trim', 'speed', 'erase', 'stabilize', 'rotate', 'flip', 'aspect', 'motion', 'adjust', 'grade', 'fade',
  'volume', 'denoise', 'loudness', 'mute', 'overlay', 'caption', 'layers', 'captions', 'thumbnail',
];
/** What a thumbnail (one still) can be combined with. */
const STILL_EDITS: ReadonlySet<EditName> = new Set(['erase', 'rotate', 'flip', 'aspect', 'adjust', 'grade', 'caption', 'layers', 'thumbnail']);
/** What a picture (a still SOURCE: a poster, a banner, a photo) can be given. */
const PICTURE_EDITS: ReadonlySet<EditName> = new Set(['erase', 'rotate', 'flip', 'aspect', 'adjust', 'grade', 'caption', 'layers']);
/** Edits of the sound alone: with nothing else, an H.264 picture is copied as it is. */
const SOUND_EDITS: ReadonlySet<EditName> = new Set(['volume', 'mute', 'denoise', 'loudness']);
/** Edits drawn in the second (composition) pass, over the first pass's output. */
export const COMPOSED_EDITS: ReadonlySet<EditName> = new Set(['caption', 'layers', 'captions']);
/** A single picture as ffmpeg reads one: an image codec and no length to speak of. */
const IMAGE_CODECS = new Set(['png', 'mjpeg', 'webp', 'bmp', 'tiff', 'jpegls', 'jpeg2000']);
export const isPictureProbe = (p: Pick<BannerProbe, 'durationSec' | 'videoCodec'>): boolean =>
  IMAGE_CODECS.has(String(p.videoCodec ?? '').toLowerCase()) && !(p.durationSec > 0.5);

export const ASPECTS: readonly FrameAspect[] = ['9:16', '16:9', '1:1', '4:5'];
export type OverlayLook = 'light-leak' | 'grain';
export const OVERLAY_LOOKS: readonly OverlayLook[] = ['light-leak', 'grain'];
/** An overlay is one more full-frame pass: it is for a result up to this long (one worker's time). */
export const MAX_OVERLAY_SEC = 120;
export const GRADES: readonly GradeStyle[] = ['vintage', 'cinematic', 'neon', 'noir', 'dramatic'];
export const FITS: readonly FrameFit[] = ['crop', 'pad', 'blur'];

/** The picture's own light and colour, in the order they are stored and drawn. */
export const ADJUST_KEYS = ['brightness', 'contrast', 'saturation', 'warmth', 'sharpen', 'vignette'] as const;
export type AdjustKey = (typeof ADJUST_KEYS)[number];
export type Adjust = Partial<Record<AdjustKey, number>>;
/** These go both ways (−100 darker / flatter / greyer / cooler … 100); sharpen and vignette only add (0–100). */
export const SIGNED_ADJUST: ReadonlySet<AdjustKey> = new Set(['brightness', 'contrast', 'saturation', 'warmth']);
export const MAX_ADJUST = 100;
export type FlipAxis = 'horizontal' | 'vertical';
export type ZoomWay = 'in' | 'out';
/** A zoom redraws every frame from a picture twice the size: it is for a result up to this long (one worker's time). */
export const MAX_MOTION_SEC = 120;
/** Steadying looks at every frame against the last (about twice as slow as the clip plays at 1080p). */
export const MAX_STABILIZE_SEC = 60;

/**
 * A place of the source picture to fill in, in fractions of the frame as shown (0–1, from its top left); `at` names the
 * place it was asked by („the top right corner"), and `fromSec` / `toSec` the stretch of the result it is erased in.
 */
export interface EraseBox {
  x: number;
  y: number;
  w: number;
  h: number;
  at?: Anchor;
  fromSec?: number;
  toSec?: number;
}
export const MAX_ERASE_BOXES = 4;
/** One box is at most this share of the frame: the fill comes from the box's edges, and a larger one is a smear. */
export const MAX_ERASE_AREA = 0.35;
export const MIN_ERASE_SIDE = 0.02;
/**
 * The places as words name them, sized for what sits there: a logo or a watermark in a corner, a title across the top,
 * subtitles across the bottom (their usual band), a sticker at a side, a text in the middle.
 */
export const ERASE_AT: Readonly<Record<Anchor, { x: number; y: number; w: number; h: number }>> = {
  'top-left': { x: 0.01, y: 0.01, w: 0.3, h: 0.14 },
  top: { x: 0.03, y: 0.01, w: 0.94, h: 0.17 },
  'top-right': { x: 0.69, y: 0.01, w: 0.3, h: 0.14 },
  left: { x: 0.01, y: 0.3, w: 0.26, h: 0.4 },
  center: { x: 0.2, y: 0.38, w: 0.6, h: 0.24 },
  right: { x: 0.73, y: 0.3, w: 0.26, h: 0.4 },
  'bottom-left': { x: 0.01, y: 0.85, w: 0.3, h: 0.14 },
  bottom: { x: 0.03, y: 0.8, w: 0.94, h: 0.19 },
  'bottom-right': { x: 0.69, y: 0.85, w: 0.3, h: 0.14 },
};

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
  /** The source is a picture (a poster, a banner, a photo): one frame in, one JPEG out (`sourceSec` 0). */
  still?: boolean;
  /** A second, clean copy is made too (the captions' `both`): the same edit without its captions. */
  clean?: boolean;
  /** The source's frame as shown, when places of it are erased (the boxes are fractions of it; the filter takes pixels). */
  frame?: { width: number; height: number };
}

export interface EditRequest {
  v: 1;
  /** One file of the caller's own: an upload, a Library item, or a result Agent G made for them. */
  source: { ref: string };
  edits: MediaEdit[];
  name: string;
  plan: EditPlan;
  /** A revision: the earlier edit (its job) this one changes, rendered again from the same source (./editExec). */
  parent?: { jobId: string; depth: number };
}

export type EditPlanErrorCode =
  | 'bad_edits' | 'no_video' | 'out_of_range' | 'too_long' | 'too_short' | 'conflict' | 'nothing_to_do'
  | 'text_too_long' | 'too_many_layers' | 'layer_not_found' | 'layer_ambiguous' | 'bad_captions' | 'erase_where' | 'erase_too_large';
export type EditPlanError = { ok: false; error: EditPlanErrorCode; message: string; detail?: string };

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** Seconds as ffmpeg reads them: at most three decimals, no exponent. */
export const secArg = (n: number): string => String(Math.round(n * 1000) / 1000);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const fail = (error: EditPlanError['error'], message: string, detail?: string): EditPlanError => ({ ok: false, error, message, ...(detail ? { detail } : {}) });

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
  parent: { layers?: readonly Layer[] } = {},
): { ok: true; edits: MediaEdit[]; plan: EditPlan } | EditPlanError {
  if (!Array.isArray(asks) || asks.length === 0) return fail('nothing_to_do', 'Say what to change.');
  if (asks.length > EDIT_ORDER.length) return fail('bad_edits', 'Too many edits at once.');
  if (!src.hasVideo || !(src.width > 0 && src.height > 0)) return fail('no_video', 'This file has no picture to edit.');
  const picture = isPictureProbe(src);
  // Every number is rounded BEFORE it is checked, so the stored request passes the same checks again (validateEditRequest).
  const dur = picture ? 0 : round2(src.durationSec);
  if (!picture && !(dur > 0)) return fail('no_video', 'This file\'s length cannot be read.');
  /** Layer and caption asks wait for the result's length (after a trim or a speed change). */
  let layersAsk: LayersAsk | null = null;
  let captionsAsk: { track: unknown; deliver: unknown } | null = null;
  /** The places to erase wait for the result's length too (a stretch of it). */
  let eraseAsk: Record<string, unknown> | null = null;

  const seen = new Set<EditName>();
  const edits: MediaEdit[] = [];
  for (const raw of asks) {
    const a = raw as Record<string, unknown> | null;
    const op = a && typeof a === 'object' ? a.op : undefined;
    if (typeof op !== 'string' || !(EDIT_ORDER as readonly string[]).includes(op)) return fail('bad_edits', 'An edit is not one Agent G knows.');
    if (seen.has(op as EditName)) return fail('bad_edits', `"${op}" is asked twice.`);
    seen.add(op as EditName);
    if (picture && !PICTURE_EDITS.has(op as EditName)) {
      return fail('conflict', 'This is a picture: it takes a frame shape, a colour look and text or a logo, nothing about time or sound.');
    }
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
        if (!(ASPECTS as readonly unknown[]).includes(to) || !(FITS as readonly unknown[]).includes(fit)) return fail('bad_edits', 'The frame is 9:16, 16:9, 1:1 or 4:5.');
        edits.push({ op: 'aspect', to: to as FrameAspect, fit: fit as FrameFit });
        break;
      }
      case 'adjust': {
        const out: Adjust = {};
        for (const k of ADJUST_KEYS) {
          const v = a![k];
          if (v === undefined) continue;
          const r = isNum(v) ? Math.round(v) : NaN;
          if (!(r >= (SIGNED_ADJUST.has(k) ? -MAX_ADJUST : 0) && r <= MAX_ADJUST)) return fail('bad_edits', 'Light and colour change by -100 to 100 (sharpness and vignette 0 to 100).');
          if (r !== 0) out[k] = r;
        }
        if (!Object.keys(out).length) return fail('nothing_to_do', 'That leaves the light and colour as they are.');
        edits.push({ op: 'adjust', ...out });
        break;
      }
      case 'flip': {
        const axis = a!.axis ?? 'horizontal';
        if (axis !== 'horizontal' && axis !== 'vertical') return fail('bad_edits', 'A flip is a mirror (left to right) or upside down.');
        edits.push({ op: 'flip', axis });
        break;
      }
      case 'rotate': {
        const raw = isNum(a!.deg) ? Math.round(a!.deg) : NaN;
        const deg = ((raw % 360) + 360) % 360;
        if (!Number.isFinite(raw) || deg % 90 !== 0) return fail('bad_edits', 'A turn is a quarter turn: 90°, 180° or 270°.');
        if (deg === 0) return fail('nothing_to_do', 'A whole turn leaves the picture as it is.');
        edits.push({ op: 'rotate', deg: deg as 90 | 180 | 270 });
        break;
      }
      case 'motion': {
        const { zoom, shake, glitch } = a as { zoom?: unknown; shake?: unknown; glitch?: unknown };
        const what = 'The movement is a zoom in or out, a shake, a glitch, or some of them together.';
        if ((zoom !== undefined && zoom !== 'in' && zoom !== 'out') || [shake, glitch].some((v) => v !== undefined && typeof v !== 'boolean')) return fail('bad_edits', what);
        if (!zoom && !shake && !glitch) return fail('bad_edits', what);
        edits.push({ op: 'motion', ...(zoom ? { zoom: zoom as ZoomWay } : {}), ...(shake ? { shake: true as const } : {}), ...(glitch ? { glitch: true as const } : {}) });
        break;
      }
      case 'stabilize':
      case 'denoise':
      case 'loudness':
        edits.push({ op: op as 'stabilize' | 'denoise' | 'loudness' });
        break;
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
      case 'overlay': {
        const look = a!.look ?? 'light-leak';
        if (!(OVERLAY_LOOKS as readonly unknown[]).includes(look)) return fail('bad_edits', 'The overlay is light leaks or film grain.');
        edits.push({ op: 'overlay', look: look as OverlayLook });
        break;
      }
      case 'caption': {
        const text = cleanCaption(a!.text);
        if (!text) return fail('bad_edits', 'Say the words to put on the video.');
        edits.push({ op: 'caption', text });
        break;
      }
      case 'layers':
        layersAsk = a as unknown as LayersAsk;
        break;
      case 'erase':
        eraseAsk = a as Record<string, unknown>;
        break;
      case 'captions':
        captionsAsk = { track: a!.track, deliver: a!.deliver ?? 'burned' };
        break;
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
  if (seen.has('captions') && seen.has('thumbnail')) return fail('conflict', 'Captions are for a video, not a still.');
  if (seen.has('mute') && seen.has('volume')) return fail('conflict', 'Silent and louder at once?');
  if (seen.has('mute') && (seen.has('denoise') || seen.has('loudness'))) return fail('conflict', 'Silent and a cleaner sound at once?');
  if (seen.has('loudness') && seen.has('volume')) return fail('conflict', 'Evening the sound out sets its level itself: ask for one of them.');
  if (['mute', 'volume', 'denoise', 'loudness'].some((k) => seen.has(k as EditName)) && !src.hasAudio) return fail('conflict', 'This video has no sound.');
  edits.sort((x, y) => EDIT_ORDER.indexOf(x.op) - EDIT_ORDER.indexOf(y.op));

  // ── the result ────────────────────────────────────────────────────────────────────────────────────────────────────
  const get = <K extends EditName>(k: K) => edits.find((e) => e.op === k) as Extract<MediaEdit, { op: K }> | undefined;
  const trim = get('trim'), speed = get('speed'), aspect = get('aspect'), fade = get('fade');
  const still = Boolean(get('thumbnail')) || picture;
  const kept = trim ? trim.toSec - trim.fromSec : dur;
  const outSec = still ? 0 : round2(kept / (speed?.factor ?? 1));
  if (!still && outSec > MAX_EDIT_OUTPUT_SEC) return fail('too_long', `The result would be ${Math.round(outSec)} s; Agent G edits up to ${MAX_EDIT_OUTPUT_SEC} s at a time. Trim it first.`);
  if (!still && outSec < MIN_EDIT_OUTPUT_SEC) return fail('too_short', 'The result would be shorter than half a second.');
  if (fade && fade.inSec + fade.outSec > outSec) return fail('conflict', 'The fades are longer than the video.');
  if (get('overlay') && outSec > MAX_OVERLAY_SEC) return fail('too_long', `An overlay is for a video up to ${MAX_OVERLAY_SEC} s; this one would be ${Math.round(outSec)} s. Trim it first.`);
  if (get('motion') && outSec > MAX_MOTION_SEC) return fail('too_long', `A zoom, a shake or a glitch is for a video up to ${MAX_MOTION_SEC} s; this one would be ${Math.round(outSec)} s. Trim it first.`);
  if (get('stabilize') && outSec > MAX_STABILIZE_SEC) return fail('too_long', `Steadying is for a video up to ${MAX_STABILIZE_SEC} s; this one would be ${Math.round(outSec)} s. Trim it first.`);

  // ── erased places, layers and captions, on the result's own timeline ─────────────────────────────────────────────
  if (eraseAsk) {
    const r = resolveErase(eraseAsk, outSec, still);
    if (!r.ok) return r;
    edits.push({ op: 'erase', boxes: r.boxes });
  }
  let clean = false;
  if (layersAsk) {
    const r = resolveLayers(layersAsk, parent.layers ?? [], outSec, still);
    if (!r.ok) {
      const code: EditPlanErrorCode = r.error === 'bad_layers' ? 'bad_edits' : r.error === 'not_on_still' ? 'conflict' : r.error;
      return fail(code, r.message, r.detail);
    }
    // Every layer removed: the edit is what is left of it (nothing, when the layers were all there was).
    if (r.layers.length) edits.push({ op: 'layers', layers: r.layers });
  }
  if (captionsAsk) {
    const deliver = captionsAsk.deliver;
    if (deliver !== 'burned' && deliver !== 'both' && deliver !== 'file') return fail('bad_captions', 'Captions are burned in, burned in with a clean copy, or a file.');
    const r = resolveTrack(captionsAsk.track, outSec);
    if (!r.ok) return fail(r.error === 'out_of_range' ? 'out_of_range' : 'bad_captions', r.message);
    edits.push({ op: 'captions', track: r.track, deliver });
    clean = deliver === 'both';
  }
  if (!edits.length) return fail('nothing_to_do', 'That leaves nothing to change.');
  edits.sort((x, y) => EDIT_ORDER.indexOf(x.op) - EDIT_ORDER.indexOf(y.op));

  const shown = displayDims(src);
  const copyVideo = !still && edits.every((e) => SOUND_EDITS.has(e.op)) && src.videoCodec === 'h264';
  // A quarter turn swaps the sides (before a new frame shape, which sets its own).
  const rotate = get('rotate');
  const turned = rotate && rotate.deg !== 180 ? { width: shown.height, height: shown.width } : shown;
  // A picture keeps its own size (a JPEG needs no even sides); a video's sides are made even for H.264.
  const [w, h] = aspect ? ASPECT_DIMS[aspect.to] : copyVideo || picture ? [turned.width, turned.height] : [even(turned.width), even(turned.height)];
  return {
    ok: true,
    edits,
    plan: {
      sourceSec: dur, output: still ? 'jpg' : 'mp4', durationSec: outSec,
      hasAudio: !still && src.hasAudio && !get('mute'), width: w, height: h, copyVideo,
      ...(picture ? { still: true } : {}), ...(clean ? { clean: true } : {}),
      ...(edits.some((e) => e.op === 'erase') ? { frame: { width: shown.width, height: shown.height } } : {}),
    },
  };
}

/**
 * The places asked to erase → the stored boxes: a named place (`at`) takes its ERASE_AT box, numbers are taken as they
 * are (fractions of the frame), and a stretch (`fromSec` / `toSec`, `firstSec`, `lastSec`) is on the result's timeline.
 * One box at most MAX_ERASE_AREA of the frame, inside it, at most MAX_ERASE_BOXES; a picture has no stretch.
 */
export function resolveErase(ask: Record<string, unknown>, outSec: number, still: boolean): { ok: true; boxes: EraseBox[] } | EditPlanError {
  const where = 'Say where it is: a corner, the top, the bottom, a side or the centre.';
  const list: unknown[] | null = Array.isArray(ask.boxes) ? ask.boxes : ask.at !== undefined ? [{ at: ask.at }] : null;
  if (!list || list.length === 0) return fail('erase_where', where);
  if (list.length > MAX_ERASE_BOXES) return fail('bad_edits', `Up to ${MAX_ERASE_BOXES} places at once.`);
  const boxes: EraseBox[] = [];
  for (const raw of list) {
    const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    if (b.at !== undefined && !(ANCHORS as readonly unknown[]).includes(b.at)) return fail('bad_edits', where);
    const at = b.at as Anchor | undefined;
    const given = ['x', 'y', 'w', 'h'].filter((k) => b[k] !== undefined);
    let box: { x: number; y: number; w: number; h: number };
    if (given.length) {
      if (given.length !== 4 || !['x', 'y', 'w', 'h'].every((k) => isNum(b[k]))) return fail('bad_edits', 'A place is its left, top, width and height.');
      box = { x: round3(b.x as number), y: round3(b.y as number), w: round3(b.w as number), h: round3(b.h as number) };
    } else if (at) {
      box = { ...ERASE_AT[at] };
    } else {
      return fail('erase_where', where);
    }
    if (!(box.x >= 0 && box.y >= 0 && box.w >= MIN_ERASE_SIDE && box.h >= MIN_ERASE_SIDE && box.x + box.w <= 1.0005 && box.y + box.h <= 1.0005)) {
      return fail('bad_edits', 'That place is not inside the picture.');
    }
    if (box.w * box.h > MAX_ERASE_AREA + 1e-9) {
      return fail('erase_too_large', `A place to erase is at most ${Math.round(MAX_ERASE_AREA * 100)}% of the picture: a larger fill is only a smear.`);
    }
    // The stretch it is erased in, on the result's timeline.
    const from = b.fromSec, to = b.toSec, first = b.firstSec, last = b.lastSec;
    const timed = [from, to, first, last].some((v) => v !== undefined);
    let win: { fromSec: number; toSec: number } | null = null;
    if (timed) {
      if (still) return fail('conflict', 'A picture has no time: say the place only.');
      if ([from, to, first, last].some((v) => v !== undefined && !isNum(v))) return fail('bad_edits', 'A stretch is in seconds.');
      let f: number, t: number;
      if (first !== undefined) [f, t] = [0, Math.min(first as number, outSec)];
      else if (last !== undefined) [f, t] = [Math.max(0, outSec - (last as number)), outSec];
      else [f, t] = [(from as number | undefined) ?? 0, (to as number | undefined) ?? outSec];
      f = round2(f); t = round2(Math.min(t, outSec));
      if (f < 0 || f >= outSec || !(t - f >= 0.1)) return fail('out_of_range', `The result is ${secArg(outSec)} s long.`);
      if (!(f <= 0.05 && t >= outSec - 0.05)) win = { fromSec: f, toSec: t };
    }
    boxes.push({ ...box, ...(at ? { at } : {}), ...(win ?? {}) });
  }
  return { ok: true, boxes };
}

/** The erased places as delogo filters, in pixels of the frame as shown (delogo needs one pixel of picture around a box). */
export function eraseVf(boxes: readonly EraseBox[], frame: { width: number; height: number }): string[] {
  const W = Math.round(frame.width), H = Math.round(frame.height);
  const out: string[] = [];
  for (const b of boxes) {
    const x = Math.max(1, Math.round(b.x * W)), y = Math.max(1, Math.round(b.y * H));
    const w = Math.min(Math.round(b.w * W), W - 1 - x), h = Math.min(Math.round(b.h * H), H - 1 - y);
    if (!(w >= 1 && h >= 1)) continue;
    const when = b.fromSec !== undefined && b.toSec !== undefined ? `:enable='between(t,${secArg(b.fromSec)},${secArg(b.toSec)})'` : '';
    out.push(`delogo=x=${x}:y=${y}:w=${w}:h=${h}${when}`);
  }
  return out;
}

/**
 * JSON with every object's keys in one order (arrays keep theirs). A stored request comes back from
 * generation_jobs.params, a JSONB column, in JSONB's own key order (shorter keys first), not in the order resolveEdits
 * wrote it: `{ op, fromSec, toSec }` is read back as `{ op, toSec, fromSec }`. Compared as written, the worker refused
 * every stored trim (and every edit whose keys JSONB reorders) as `invalid_request` (DEFECT_REGISTER_FINAL row 39).
 */
export function canonicalJson(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]]))
    : x));
}

/** The stored (or returned) request, checked field by field; null when anything is off. */
export function validateEditRequest(x: unknown): EditRequest | null {
  const r = x as Partial<EditRequest> | null;
  if (!r || typeof r !== 'object' || r.v !== 1) return null;
  if (!r.source || typeof r.source.ref !== 'string' || !r.source.ref.trim() || r.source.ref.length > 2048) return null;
  if (typeof r.name !== 'string' || !/^[^/\\]{1,108}\.(?:mp4|jpg)$/.test(r.name)) return null;
  const p = r.plan as EditPlan | undefined;
  if (!p || (p.output !== 'mp4' && p.output !== 'jpg') || !r.name.endsWith(`.${p.output}`)) return null;
  if (p.still !== undefined && p.still !== true) return null;
  if (p.clean !== undefined && p.clean !== true) return null;
  if (p.frame !== undefined && !(p.frame && Number.isInteger(p.frame.width) && Number.isInteger(p.frame.height) && p.frame.width > 0 && p.frame.height > 0)) return null;
  if (!isNum(p.sourceSec) || !(p.still ? p.sourceSec === 0 && p.output === 'jpg' : p.sourceSec > 0) || !isNum(p.durationSec) || !isNum(p.width) || !isNum(p.height) || !(p.width > 0 && p.height > 0)) return null;
  if (typeof p.hasAudio !== 'boolean' || typeof p.copyVideo !== 'boolean') return null;
  if (r.parent !== undefined && !(r.parent && typeof r.parent.jobId === 'string' && /^[0-9a-f-]{36}$/i.test(r.parent.jobId) && Number.isInteger(r.parent.depth) && r.parent.depth >= 1 && r.parent.depth <= 50)) return null;
  if (p.output === 'mp4' && !(p.durationSec >= MIN_EDIT_OUTPUT_SEC && p.durationSec <= MAX_EDIT_OUTPUT_SEC)) return null;
  if (!Array.isArray(r.edits) || r.edits.length === 0) return null;
  // The edits again, against the plan's own facts: the same rules the quote applied, the same result.
  const again = resolveEdits(r.edits, {
    durationSec: p.sourceSec, hasVideo: true, hasAudio: p.hasAudio || r.edits.some((e) => e?.op === 'mute'),
    width: p.frame?.width ?? p.width, height: p.frame?.height ?? p.height, rotation: 0, videoCodec: p.still ? 'png' : p.copyVideo ? 'h264' : null,
  });
  if (!again.ok) return null;
  if (canonicalJson(again.edits) !== canonicalJson(r.edits)) return null;
  if (again.plan.output !== p.output || Math.abs(again.plan.durationSec - p.durationSec) > 0.011) return null;
  if (Boolean(again.plan.clean) !== Boolean(p.clean)) return null;
  if (canonicalJson(again.plan.frame ?? null) !== canonicalJson(p.frame ?? null)) return null;
  return r as EditRequest;
}

const edit = <K extends EditName>(edits: readonly MediaEdit[], k: K) => edits.find((e) => e.op === k) as Extract<MediaEdit, { op: K }> | undefined;

/** A shaky clip steadied: ffmpeg's one-pass deshake (its default search, the frame's edges filled from the last frame). */
export const STABILIZE_VF = 'deshake';
/**
 * Hum and rumble under 80 Hz cut, then the steady hiss taken down by 12 dB (afftdn's own reduction), the sound itself
 * kept. Measured on the bundled ffmpeg 7.0.2 (./effects.ffmpeg.test.ts): white noise at -45, -35 and -28 dBFS comes out
 * 12 dB lower and a tone over it within 0.7 dB. No `tn=1`: noise tracking on that build took nothing out at all.
 */
export const DENOISE_AF = 'highpass=f=80,afftdn=nf=-25';
/** One pass of EBU R128 loudness to -14 LUFS, peaks under -1.5 dBTP; loudnorm works at 192 kHz, so it is set back to 48. */
export const LOUDNESS_AF = 'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000';

export function rotateVf(deg: 90 | 180 | 270): string {
  return deg === 90 ? 'transpose=clock' : deg === 270 ? 'transpose=cclock' : 'hflip,vflip';
}

/** How far a zoom goes over the whole result (15 %: CapCut's slow push, never a jump). */
export const ZOOM_SPAN = 0.15;

/**
 * Movement over the frame as it is at that point (`width` × `height`, the result's frame), for `sec` seconds, in this
 * order when several are asked:
 *   zoom   one frame of output per frame at 30 fps, drawn from the picture at twice its size (no stair-steps), the
 *          centre held, `ZOOM_SPAN` in (or out) from the first frame to the last;
 *   shake  the picture 12 % larger, its window moving on two sines of different speeds (a hand, not a metronome);
 *   glitch every 1.6 s, a 0.2 s burst: the red and blue split sideways and the picture breaks into noise.
 */
export function motionVf(m: { zoom?: ZoomWay; shake?: boolean; glitch?: boolean }, width: number, height: number, sec: number): string[] {
  const W = Math.round(width), H = Math.round(height);
  const out: string[] = [];
  if (m.zoom) {
    const n = Math.max(1, Math.round(sec * 30));
    const z = m.zoom === 'in' ? `1+${ZOOM_SPAN}*on/${n}` : `${1 + ZOOM_SPAN}-${ZOOM_SPAN}*on/${n}`;
    out.push('fps=30', `scale=${W * 2}:${H * 2}`, `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30`, 'setsar=1');
  }
  if (m.shake) {
    out.push(
      `scale=${even(W * 1.12)}:${even(H * 1.12)}`,
      `crop=${W}:${H}:x='(iw-ow)/2+(iw-ow)/2*0.6*sin(t*29)':y='(ih-oh)/2+(ih-oh)/2*0.6*sin(t*37+1.3)'`,
      'setsar=1',
    );
  }
  if (m.glitch) {
    const shift = Math.max(4, Math.round(W / 100));
    const burst = `enable='lt(mod(t,1.6),0.2)'`;
    out.push(`rgbashift=rh=-${shift}:bh=${shift}:${burst}`, `noise=alls=30:allf=t:${burst}`);
  }
  return out;
}

/**
 * The light and colour as filters: brightness, contrast and saturation in one `eq` (brightness ±0.25, contrast ×0.5–1.5,
 * saturation ×0–2), warmth as a colour temperature (+100 = 3500 K warm, −100 = 9500 K cool) that keeps the lightness
 * (without `pl=1` a warmer picture also came out darker, measured), then sharpening
 * (`unsharp`, up to 1.5) and a vignette (an angle of 0.2–0.8 rad: wider is darker at the edges).
 */
export function adjustVf(a: Adjust): string[] {
  const out: string[] = [];
  const eq: string[] = [];
  if (a.brightness) eq.push(`brightness=${(a.brightness / 100 * 0.25).toFixed(4)}`);
  if (a.contrast) eq.push(`contrast=${(1 + a.contrast / 100 * 0.5).toFixed(4)}`);
  if (a.saturation) eq.push(`saturation=${(1 + a.saturation / 100).toFixed(4)}`);
  if (eq.length) out.push(`eq=${eq.join(':')}`);
  if (a.warmth) out.push(`colortemperature=temperature=${6500 - a.warmth * 30}:pl=1`);
  if (a.sharpen) out.push(`unsharp=5:5:${(a.sharpen / 100 * 1.5).toFixed(3)}:5:5:0`);
  if (a.vignette) out.push(`vignette=angle=${(0.2 + a.vignette / 100 * 0.6).toFixed(4)}`);
  return out;
}

/** The picture chain (`-vf`) of the first pass. */
export function videoFilters(req: Pick<EditRequest, 'edits' | 'plan'>): string[] {
  const { edits, plan } = req;
  const vf: string[] = [];
  const speed = edit(edits, 'speed'), aspect = edit(edits, 'aspect'), grade = edit(edits, 'grade'), fade = edit(edits, 'fade');
  const erase = edit(edits, 'erase'), stabilize = edit(edits, 'stabilize'), rotate = edit(edits, 'rotate'), flip = edit(edits, 'flip');
  const motion = edit(edits, 'motion'), adjust = edit(edits, 'adjust');
  const still = plan.output === 'jpg';
  // Back on the 30 fps grid right after the re-timing (Video Core round 3, measured): setpts leaves the stream's rate
  // unknown, the encoder then fell to 25 fps, and a 2× edit of a 6 s 30 fps clip came out 3.04 s / 76 frames with the
  // picture a frame behind its sound. `fps=30` drops (faster) or repeats (slower) whole frames on the product's grid.
  if (speed) vf.push(`${setptsFor(speed.factor)},fps=30`);
  // Before the frame changes: the boxes are places of the source as shown.
  if (erase) vf.push(...eraseVf(erase.boxes, plan.frame ?? { width: plan.width, height: plan.height }));
  // Steadied while the picture is still the camera's own (after the fill, which stays where the logo was).
  if (stabilize) vf.push(STABILIZE_VF);
  if (rotate) vf.push(rotateVf(rotate.deg));
  if (flip) vf.push(flip.axis === 'vertical' ? 'vflip' : 'hflip');
  if (aspect) {
    const a = aspectVf(aspect.to, aspect.fit);
    // A JPEG takes full-range YUV: leave the pixel format to the encoder.
    vf.push(still ? a.replace(/,format=yuv420p$/, '') : a);
  } else if (!still) {
    vf.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  }
  // On the result's own frame: the plan's size is the frame here (a new shape, or the source's made even).
  if (motion) vf.push(...motionVf(motion, plan.width, plan.height, plan.durationSec));
  if (adjust) vf.push(...adjustVf(adjust));
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
  if (edit(edits, 'denoise')) af.push(DENOISE_AF);
  if (edit(edits, 'loudness')) af.push(LOUDNESS_AF);
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
  const captioned = edits.some((e) => COMPOSED_EDITS.has(e.op) || e.op === 'overlay');
  if (plan.output === 'jpg') {
    const at = edit(edits, 'thumbnail')?.atSec;
    const vf = videoFilters(req);
    return [
      '-hide_banner', '-y', ...(at !== undefined ? ['-ss', secArg(at)] : []), '-i', input, '-map', '0:v:0', '-frames:v', '1', '-an', '-sn', '-dn',
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
