/**
 * lib/agent/media/layers.ts — the editable layers of Agent G's edit (Media Studio v2.1): text (a title, a lower third,
 * a CTA, a price, a label), a picture of the user's own (a logo), a privacy mask (blur or mosaic), and a caption track.
 * Each has its time on the result's timeline, its place, size, style, motion and stacking. Pure (no fs, no ffmpeg, no
 * resvg), safe in the browser: the quote resolves the asks into these (./editPlan), the card shows them, ./layerRender
 * draws them, ./layerCompose builds the ffmpeg graph, ./layerQc checks the drawn result against them.
 *
 * NON-DESTRUCTIVE. A layer is never painted into the user's file: every revision renders the ORIGINAL source again with
 * the whole layer list (a parent edit's layers changed, added or removed: ./editExec), so moving or removing a layer
 * leaves no trace. What is in the source's own pixels (a logo printed on a package, text in the picture) is never
 * touched by a layer change, and the QC measures that it was not (./layerQc `outside`).
 *
 * EXACT TEXT. The words are drawn as typed: Unicode NFC, control and direction characters removed, spaces collapsed,
 * never upper- or lower-cased, never translated, never shortened (a text that does not fit is refused, not cut).
 */

export type Anchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';
export type TextStyle = 'minimal' | 'cinematic' | 'premium' | 'bold' | 'brand';
export type TextRole = 'text' | 'title' | 'lower-third' | 'cta' | 'price' | 'label';
/** How a layer comes in: `typewriter` letter by letter, `words` word by word (on the music's beats when `beats`). */
export type MotionIn = 'none' | 'fade' | 'slide-up' | 'slide-left' | 'scale' | 'typewriter' | 'words';
export type MotionOut = 'none' | 'fade';

export const ANCHORS: readonly Anchor[] = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
export const TEXT_STYLES: readonly TextStyle[] = ['minimal', 'cinematic', 'premium', 'bold', 'brand'];
export const TEXT_ROLES: readonly TextRole[] = ['text', 'title', 'lower-third', 'cta', 'price', 'label'];
export const MOTIONS_IN: readonly MotionIn[] = ['none', 'fade', 'slide-up', 'slide-left', 'scale', 'typewriter', 'words'];

/** Time on the RESULT's timeline (after any trim or speed change). A still has none: both 0. */
export interface Timed {
  startSec: number;
  endSec: number;
}

export interface TextLayer extends Timed {
  id: string;
  kind: 'text';
  role: TextRole;
  text: string;
  anchor: Anchor;
  /** Font size in ‰ of the frame's short side (60 = 6 %): the same share on every frame shape. */
  size: number;
  style: TextStyle;
  motionIn: MotionIn;
  motionOut: MotionOut;
  /** How long the way in lasts (for `typewriter` / `words`: until the last letter or word is shown). */
  motionSec: number;
  /** Words shown on the beats of the video's own sound (`words` only); evenly spaced when no beats are found. */
  beats?: boolean;
  z: number;
}

export interface ImageLayer extends Timed {
  id: string;
  kind: 'image';
  /** One of the caller's own pictures (an upload or a Library item), resolved and owner-checked again at the render. */
  ref: string;
  anchor: Anchor;
  /** Width in ‰ of the frame's short side. */
  size: number;
  motionIn: Extract<MotionIn, 'none' | 'fade' | 'slide-up' | 'slide-left'>;
  motionOut: MotionOut;
  motionSec: number;
  z: number;
}

/** A privacy mask over a region (a face, a number plate): blurred or pixelated, in place. No tracking: the region is fixed. */
export interface MaskLayer extends Timed {
  id: string;
  kind: 'mask';
  mode: 'blur' | 'mosaic';
  anchor: Anchor;
  /** Width and height in ‰ of the frame's width and height. */
  w: number;
  h: number;
  z: number;
}

export type Layer = TextLayer | ImageLayer | MaskLayer;
export type LayerKind = Layer['kind'];

export interface CaptionWord {
  text: string;
  startSec: number;
  endSec: number;
}

export interface CaptionCue extends Timed {
  text: string;
  speaker?: string;
  /** Word times (a transcript's), for karaoke highlighting. */
  words?: CaptionWord[];
}

export interface CaptionTrack {
  lang: 'ka' | 'en' | 'ru' | 'und';
  /** Where the words came from: typed in the chat, a subtitle file, a speech transcript, or a translation of a track. */
  source: 'typed' | 'file' | 'transcript' | 'translation';
  cues: CaptionCue[];
  style: TextStyle;
  /** The spoken word lit as it is said (needs word times). */
  karaoke: boolean;
  /** „A:" before a cue when the speaker changes. */
  speakers: boolean;
}

/** What the result carries: the captions burned in, burned in AND a clean copy, or a clean video and the subtitle files. */
export type CaptionDelivery = 'burned' | 'both' | 'file';

// ── limits ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const MAX_LAYERS = 12;
export const MAX_LAYER_TEXT = 160;
export const MIN_SIZE = 25;
export const MAX_TEXT_SIZE = 160;
export const MAX_IMAGE_SIZE = 600;
export const MIN_MOTION_SEC = 0.2;
export const MAX_MOTION_SEC = 6;
export const MIN_LAYER_SEC = 0.3;
export const MAX_CUES = 600;
export const MAX_CUE_TEXT = 160;
export const MIN_CUE_SEC = 0.2;
/** Time per letter / per word when a typewriter or word-by-word reveal is not given its own length. */
export const TYPE_SEC_PER_CHAR = 0.06;
export const WORD_SEC = 0.35;

/** The default size of each role, in ‰ of the short side. */
export const ROLE_SIZE: Readonly<Record<TextRole, number>> = {
  text: 60, title: 85, 'lower-third': 50, cta: 58, price: 75, label: 42,
};
/** The default style of each role. */
export const ROLE_STYLE: Readonly<Record<TextRole, TextStyle>> = {
  text: 'cinematic', title: 'cinematic', 'lower-third': 'minimal', cta: 'brand', price: 'bold', label: 'minimal',
};
/** Where each role goes when no place is named. */
export const ROLE_ANCHOR: Readonly<Record<TextRole, Anchor>> = {
  text: 'bottom', title: 'center', 'lower-third': 'bottom-left', cta: 'bottom', price: 'top-right', label: 'top-left',
};

const r2 = (n: number): number => Math.round(n * 100) / 100;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';

/**
 * The text exactly as it will be drawn: NFC, no control or direction characters, single spaces, at most four lines.
 * Never re-cased and never cut: the caller refuses a text over the limit.
 */
export function cleanLayerText(x: unknown): string {
  if (!isStr(x)) return '';
  return x
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩﻿]+/g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 4)
    .join('\n');
}

/** Characters of a text, as a person counts them (Georgian has no combining marks in practice; this stays exact). */
export const graphemes = (s: string): string[] => [...s];

// ── frame geometry ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The part of the frame text may use. A tall (story) frame keeps clear of the app's own buttons: 12 % at the top, 20 %
 * at the bottom, 7 % at the sides (Reels / TikTok / Shorts overlays). Other shapes keep a 6 % title-safe margin.
 */
export function safeArea(w: number, h: number): Rect {
  const tall = h / w >= 1.6;
  const l = Math.round(w * (tall ? 0.07 : 0.06));
  const t = Math.round(h * (tall ? 0.12 : 0.06));
  const b = Math.round(h * (tall ? 0.20 : 0.07));
  return { x: l, y: t, w: w - 2 * l, h: h - t - b };
}

/** Where a box of `bw`×`bh` sits at `anchor` inside `area` (whole pixels, even so a yuv420 crop lines up). */
export function placeBox(anchor: Anchor, bw: number, bh: number, area: Rect): { x: number; y: number } {
  const col = anchor.endsWith('left') ? 0 : anchor.endsWith('right') ? 2 : 1;
  const row = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? 2 : 1;
  const x = col === 0 ? area.x : col === 2 ? area.x + area.w - bw : area.x + (area.w - bw) / 2;
  const y = row === 0 ? area.y : row === 2 ? area.y + area.h - bh : area.y + (area.h - bh) / 2;
  const even = (n: number) => Math.max(0, Math.round(n / 2) * 2);
  return { x: even(x), y: even(y) };
}

/** Is `inner` inside `outer` (a pixel of rounding allowed)? */
export const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.w <= outer.x + outer.w + 1 && inner.y + inner.h <= outer.y + outer.h + 1;

export const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Horizontal and vertical parts of an anchor, and back. */
export function anchorParts(a: Anchor): { h: 'left' | 'center' | 'right'; v: 'top' | 'middle' | 'bottom' } {
  return {
    h: a.endsWith('left') ? 'left' : a.endsWith('right') ? 'right' : 'center',
    v: a.startsWith('top') ? 'top' : a.startsWith('bottom') ? 'bottom' : 'middle',
  };
}
export function anchorOf(h: 'left' | 'center' | 'right', v: 'top' | 'middle' | 'bottom'): Anchor {
  if (v === 'middle') return h === 'center' ? 'center' : h;
  return h === 'center' ? v : (`${v}-${h}` as Anchor);
}

/** A mask's region in pixels: an anchored box inside the whole frame (masks may cover the edges). */
export function maskRect(m: Pick<MaskLayer, 'anchor' | 'w' | 'h'>, fw: number, fh: number): Rect {
  const w = Math.max(16, Math.round((m.w / 1000) * fw / 2) * 2);
  const h = Math.max(16, Math.round((m.h / 1000) * fh / 2) * 2);
  const { x, y } = placeBox(m.anchor, w, h, { x: 0, y: 0, w: fw, h: fh });
  return { x: Math.min(x, fw - w), y: Math.min(y, fh - h), w, h };
}

/** Font px of a text layer on a frame. */
export const fontPxFor = (size: number, fw: number, fh: number): number => Math.max(12, Math.round((size / 1000) * Math.min(fw, fh)));

// ── layer asks (the words, a tool call, a run step) → layers ──────────────────────────────────────────────────────────

/** Which existing layers a change or removal means. Nothing named = the last added (one only). */
export interface LayerTarget {
  id?: string;
  kind?: LayerKind;
  /** The layer at this part of the frame („the top logo", „the text on the left"). */
  where?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** All the layers of that kind („all the text"). */
  all?: boolean;
}

/** When, as asked: the whole result, its first or last seconds, an exact range, or all of it but its last seconds. */
export interface TimeAsk {
  fromSec?: number;
  toSec?: number;
  firstSec?: number;
  lastSec?: number;
  /** Up to this many seconds before the end („myavatar.ge" until the end text „გადმოდი საიტზე" takes the last 3 s). */
  beforeLastSec?: number;
}

export interface TextLayerAsk extends TimeAsk {
  kind: 'text';
  text: string;
  role?: TextRole;
  anchor?: Anchor;
  size?: number;
  style?: TextStyle;
  motionIn?: MotionIn;
  motionOut?: MotionOut;
  motionSec?: number;
  beats?: boolean;
}
export interface ImageLayerAsk extends TimeAsk {
  kind: 'image';
  ref: string;
  anchor?: Anchor;
  size?: number;
  motionIn?: ImageLayer['motionIn'];
  motionOut?: MotionOut;
  motionSec?: number;
}
export interface MaskLayerAsk extends TimeAsk {
  kind: 'mask';
  mode?: 'blur' | 'mosaic';
  anchor?: Anchor;
  w?: number;
  h?: number;
}
export type LayerAsk = TextLayerAsk | ImageLayerAsk | MaskLayerAsk;

export interface LayerChange extends TimeAsk {
  target?: LayerTarget;
  /** Move along one axis („to the left") or to a named place. */
  moveH?: 'left' | 'center' | 'right';
  moveV?: 'top' | 'middle' | 'bottom';
  anchor?: Anchor;
  /** Size × this (0.8 = „smaller", 1.25 = „bigger"). */
  sizeBy?: number;
  style?: TextStyle;
  motionIn?: MotionIn;
  motionOut?: MotionOut;
  /** New words for one text layer (its place, style and time stay). */
  text?: string;
  /** With motionIn 'words': each word on a beat of the result's own sound. */
  beats?: boolean;
}

/** The layers op as asked: a full list (a stored request, resolved again), or changes to the parent edit's layers. */
export interface LayersAsk {
  op: 'layers';
  layers?: unknown;
  add?: LayerAsk[];
  change?: LayerChange[];
  remove?: LayerTarget[];
}

export type LayerError =
  | 'bad_layers' | 'text_too_long' | 'too_many_layers' | 'layer_not_found' | 'layer_ambiguous' | 'out_of_range' | 'not_on_still';

export type LayersResolved = { ok: true; layers: Layer[] } | { ok: false; error: LayerError; message: string; detail?: string };

const fail = (error: LayerError, message: string, detail?: string): LayersResolved => ({ ok: false, error, message, ...(detail ? { detail } : {}) });
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The time window an ask names, on a result of `dur` s (a still: 0 / 0). */
function windowOf(t: TimeAsk, dur: number, still: boolean, fallback?: Timed): Timed | null {
  if (still) return { startSec: 0, endSec: 0 };
  const has = t.fromSec !== undefined || t.toSec !== undefined || t.firstSec !== undefined || t.lastSec !== undefined || t.beforeLastSec !== undefined;
  if (!has) return fallback ? { ...fallback } : { startSec: 0, endSec: r2(dur) };
  let s: number, e: number;
  if (t.beforeLastSec !== undefined && t.lastSec === undefined && t.firstSec === undefined && t.toSec === undefined) {
    if (!isNum(t.beforeLastSec) || t.beforeLastSec <= 0) return null;
    s = isNum(t.fromSec) ? t.fromSec : 0;
    e = Math.max(0, dur - t.beforeLastSec);
    // A result too short to leave the end its seconds: the text stays the whole length rather than fail the edit.
    if (e - s < MIN_LAYER_SEC) { s = 0; e = dur; }
  } else if (t.lastSec !== undefined) {
    if (!isNum(t.lastSec) || t.lastSec <= 0) return null;
    s = Math.max(0, dur - t.lastSec); e = dur;
  } else if (t.firstSec !== undefined) {
    if (!isNum(t.firstSec) || t.firstSec <= 0) return null;
    s = 0; e = Math.min(dur, t.firstSec);
  } else {
    s = isNum(t.fromSec) ? t.fromSec : 0;
    e = isNum(t.toSec) ? t.toSec : dur;
  }
  s = r2(s); e = r2(e);
  if (e > dur && e - dur <= 0.25) e = r2(dur);
  if (s < 0 || e > dur || e - s < MIN_LAYER_SEC) return null;
  return { startSec: s, endSec: e };
}

/** Reveal length of a typewriter / word-by-word text when none is asked: a letter or word at a time, at most 60 % of its time. */
export function revealSec(text: string, motion: MotionIn, span: number): number {
  if (motion === 'typewriter') return r2(clamp(graphemes(text.replace(/\s+/g, '')).length * TYPE_SEC_PER_CHAR, MIN_MOTION_SEC, Math.max(MIN_MOTION_SEC, span * 0.6)));
  if (motion === 'words') return r2(clamp(text.split(/\s+/).filter(Boolean).length * WORD_SEC, MIN_MOTION_SEC, Math.max(MIN_MOTION_SEC, span * 0.6)));
  return r2(clamp(0.5, MIN_MOTION_SEC, Math.max(MIN_MOTION_SEC, span / 3)));
}

function nextId(layers: readonly Layer[], kind: LayerKind): string {
  const p = kind === 'text' ? 't' : kind === 'image' ? 'i' : 'm';
  let n = 0;
  for (const l of layers) {
    const m = new RegExp(`^${p}(\\d+)$`).exec(l.id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `${p}${n + 1}`;
}

/** One layer from a stored list, checked field by field against a result of `dur` s; null when anything is off. */
export function normalizeLayer(x: unknown, dur: number, still: boolean): Layer | null {
  const a = x as Record<string, unknown> | null;
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  if (!isStr(a.id) || !/^[tim]\d{1,3}$/.test(a.id)) return null;
  if (!(ANCHORS as readonly unknown[]).includes(a.anchor)) return null;
  if (!isNum(a.startSec) || !isNum(a.endSec) || !isNum(a.z)) return null;
  const startSec = r2(a.startSec), endSec = r2(a.endSec);
  if (still ? startSec !== 0 || endSec !== 0 : startSec < 0 || endSec > r2(dur) + 0.01 || endSec - startSec < MIN_LAYER_SEC - 0.001) return null;
  const z = Math.round(a.z);
  const base = { id: a.id, anchor: a.anchor as Anchor, startSec, endSec, z };
  const motionOut = a.motionOut === 'fade' ? 'fade' : a.motionOut === 'none' || a.motionOut === undefined ? 'none' : null;
  if (!motionOut) return null;
  const motionSec = isNum(a.motionSec) ? r2(a.motionSec) : NaN;
  if (a.kind === 'text') {
    const text = cleanLayerText(a.text);
    if (!text || text !== a.text || graphemes(text).length > MAX_LAYER_TEXT) return null;
    if (!(TEXT_ROLES as readonly unknown[]).includes(a.role) || !(TEXT_STYLES as readonly unknown[]).includes(a.style)) return null;
    if (!(MOTIONS_IN as readonly unknown[]).includes(a.motionIn)) return null;
    if (!isNum(a.size) || a.size < MIN_SIZE || a.size > MAX_TEXT_SIZE) return null;
    if (!(motionSec >= 0 && motionSec <= MAX_MOTION_SEC)) return null;
    if (a.beats !== undefined && (typeof a.beats !== 'boolean' || a.motionIn !== 'words')) return null;
    return {
      ...base, kind: 'text', role: a.role as TextRole, text, size: Math.round(a.size), style: a.style as TextStyle,
      motionIn: a.motionIn as MotionIn, motionOut, motionSec, ...(a.beats ? { beats: true } : {}),
    };
  }
  if (a.kind === 'image') {
    if (!isStr(a.ref) || !a.ref.trim() || a.ref.length > 2048) return null;
    if (!['none', 'fade', 'slide-up', 'slide-left'].includes(a.motionIn as string)) return null;
    if (!isNum(a.size) || a.size < MIN_SIZE || a.size > MAX_IMAGE_SIZE) return null;
    if (!(motionSec >= 0 && motionSec <= MAX_MOTION_SEC)) return null;
    return { ...base, kind: 'image', ref: a.ref, size: Math.round(a.size), motionIn: a.motionIn as ImageLayer['motionIn'], motionOut, motionSec };
  }
  if (a.kind === 'mask') {
    if (a.mode !== 'blur' && a.mode !== 'mosaic') return null;
    if (!isNum(a.w) || !isNum(a.h) || a.w < 20 || a.w > 1000 || a.h < 20 || a.h > 1000) return null;
    return { ...base, kind: 'mask', mode: a.mode, w: Math.round(a.w), h: Math.round(a.h) };
  }
  return null;
}

function newLayer(ask: LayerAsk, existing: readonly Layer[], dur: number, still: boolean): Layer | LayersResolved {
  const win = windowOf(ask, dur, still);
  if (!win) return fail('out_of_range', `The result is ${r2(dur)} s long.`);
  const z = existing.reduce((m, l) => Math.max(m, l.z), 0) + 1;
  const id = nextId(existing, ask.kind);
  const span = win.endSec - win.startSec;
  if (ask.kind === 'text') {
    const text = cleanLayerText(ask.text);
    if (!text) return fail('bad_layers', 'Say the words to put on it.');
    if (graphemes(text).length > MAX_LAYER_TEXT) return fail('text_too_long', `A text is up to ${MAX_LAYER_TEXT} characters.`);
    const role: TextRole = ask.role && (TEXT_ROLES as readonly string[]).includes(ask.role) ? ask.role : 'text';
    const motionIn: MotionIn = still ? 'none' : ask.motionIn && (MOTIONS_IN as readonly string[]).includes(ask.motionIn) ? ask.motionIn : role === 'cta' ? 'slide-up' : 'fade';
    const motionOut: MotionOut = still ? 'none' : ask.motionOut ?? (win.endSec >= dur - 0.05 ? 'none' : 'fade');
    const motionSec = still || motionIn === 'none' ? 0 : isNum(ask.motionSec) ? r2(clamp(ask.motionSec, MIN_MOTION_SEC, Math.min(MAX_MOTION_SEC, span))) : revealSec(text, motionIn, span);
    const size = isNum(ask.size) ? Math.round(clamp(ask.size, MIN_SIZE, MAX_TEXT_SIZE)) : ROLE_SIZE[role];
    return {
      id, kind: 'text', role, text, anchor: ask.anchor ?? ROLE_ANCHOR[role], size, style: ask.style ?? ROLE_STYLE[role],
      motionIn, motionOut, motionSec, ...(ask.beats && motionIn === 'words' ? { beats: true } : {}), z, ...win,
    };
  }
  if (ask.kind === 'image') {
    if (!isStr(ask.ref) || !ask.ref.trim()) return fail('bad_layers', 'Attach the picture to put on it.');
    const motionIn = still ? 'none' : ask.motionIn ?? 'fade';
    return {
      id, kind: 'image', ref: ask.ref.trim(), anchor: ask.anchor ?? 'top-right',
      size: isNum(ask.size) ? Math.round(clamp(ask.size, MIN_SIZE, MAX_IMAGE_SIZE)) : 180,
      motionIn, motionOut: still ? 'none' : ask.motionOut ?? 'none', motionSec: motionIn === 'none' ? 0 : r2(clamp(0.5, MIN_MOTION_SEC, span / 3)), z, ...win,
    };
  }
  return {
    id, kind: 'mask', mode: ask.mode ?? 'blur', anchor: ask.anchor ?? 'center',
    w: isNum(ask.w) ? Math.round(clamp(ask.w, 20, 1000)) : 300, h: isNum(ask.h) ? Math.round(clamp(ask.h, 20, 1000)) : 300, z, ...win,
  };
}

/** The layers a target names (in stacking order). */
export function findLayers(layers: readonly Layer[], t: LayerTarget | undefined): Layer[] {
  const target = t ?? {};
  if (target.id) return layers.filter((l) => l.id === target.id);
  let pool = target.kind ? layers.filter((l) => l.kind === target.kind) : layers.filter((l) => l.kind !== 'mask');
  if (target.where) {
    pool = pool.filter((l) => {
      const p = anchorParts(l.anchor);
      return target.where === 'left' || target.where === 'right' ? p.h === target.where
        : target.where === 'center' ? p.h === 'center' && p.v === 'middle'
          : p.v === target.where;
    });
  }
  if (target.all) return pool;
  // Nothing more said: the one there is, or the newest (the highest id number of the kind asked about).
  if (pool.length <= 1 || target.where) return pool;
  const newest = [...pool].sort((a, b) => Number(b.id.slice(1)) - Number(a.id.slice(1)))[0]!;
  return [newest];
}

/**
 * The layers op → the full list on a result of `dur` s: a stored list checked again as it is, or the parent edit's
 * layers with the asked additions, changes and removals applied (in that order: remove, change, add).
 */
export function resolveLayers(ask: LayersAsk, parent: readonly Layer[], dur: number, still: boolean): LayersResolved {
  if (ask.layers !== undefined) {
    if (!Array.isArray(ask.layers) || ask.add || ask.change || ask.remove) return fail('bad_layers', 'A layer list or changes, not both.');
    if (ask.layers.length > MAX_LAYERS) return fail('too_many_layers', `Up to ${MAX_LAYERS} layers.`);
    const out: Layer[] = [];
    for (const x of ask.layers) {
      const l = normalizeLayer(x, dur, still);
      if (!l || out.some((o) => o.id === l.id)) return fail('bad_layers', 'A layer is not valid.');
      out.push(l);
    }
    return { ok: true, layers: sortLayers(out) };
  }
  let layers: Layer[] = parent.map((l) => ({ ...l }));
  for (const t of ask.remove ?? []) {
    const hit = findLayers(layers, t);
    if (!hit.length) return fail('layer_not_found', 'There is no such layer of mine on it.', t.kind ?? 'layer');
    const ids = new Set(hit.map((l) => l.id));
    layers = layers.filter((l) => !ids.has(l.id));
  }
  for (const c of ask.change ?? []) {
    const hit = findLayers(layers, c.target);
    if (!hit.length) return fail('layer_not_found', 'There is no such layer of mine on it.', c.target?.kind ?? 'layer');
    if (c.text !== undefined && hit.length !== 1) return fail('layer_ambiguous', 'Which text should get the new words?');
    for (const l of hit) {
      const i = layers.findIndex((x) => x.id === l.id);
      const next: Layer = { ...layers[i]! } as Layer;
      const parts = anchorParts(next.anchor);
      if (c.anchor) next.anchor = c.anchor;
      else if (c.moveH || c.moveV) next.anchor = anchorOf(c.moveH ?? parts.h, c.moveV ?? parts.v);
      if (c.sizeBy !== undefined) {
        if (!isNum(c.sizeBy) || c.sizeBy <= 0) return fail('bad_layers', 'A size change is a factor.');
        if (next.kind === 'mask') {
          next.w = Math.round(clamp(next.w * c.sizeBy, 20, 1000));
          next.h = Math.round(clamp(next.h * c.sizeBy, 20, 1000));
        } else {
          next.size = Math.round(clamp(next.size * c.sizeBy, MIN_SIZE, next.kind === 'text' ? MAX_TEXT_SIZE : MAX_IMAGE_SIZE));
        }
      }
      if (next.kind === 'text') {
        if (c.style) next.style = c.style;
        if (c.text !== undefined) {
          const text = cleanLayerText(c.text);
          if (!text) return fail('bad_layers', 'Say the new words.');
          if (graphemes(text).length > MAX_LAYER_TEXT) return fail('text_too_long', `A text is up to ${MAX_LAYER_TEXT} characters.`);
          next.text = text;
        }
        if (c.motionIn && !still) {
          next.motionIn = c.motionIn;
          next.motionSec = c.motionIn === 'none' ? 0 : revealSec(next.text, c.motionIn, next.endSec - next.startSec);
          if (c.motionIn !== 'words') delete next.beats;
          else if (c.beats) next.beats = true;
        }
      }
      if (c.motionOut && !still && next.kind !== 'mask') next.motionOut = c.motionOut;
      const win = windowOf(c, dur, still, { startSec: next.startSec, endSec: next.endSec });
      if (!win) return fail('out_of_range', `The result is ${r2(dur)} s long.`);
      next.startSec = win.startSec; next.endSec = win.endSec;
      if (next.kind !== 'mask' && next.motionSec > next.endSec - next.startSec) next.motionSec = r2(Math.max(0, next.endSec - next.startSec));
      layers[i] = next;
    }
  }
  for (const a of ask.add ?? []) {
    const l = newLayer(a, layers, dur, still);
    if ('ok' in l) return l;
    layers.push(l);
  }
  if (layers.length > MAX_LAYERS) return fail('too_many_layers', `Up to ${MAX_LAYERS} layers.`);
  // Each layer is checked once more as it will be stored (the stored list must pass the same check: validateEditRequest).
  const out: Layer[] = [];
  for (const l of layers) {
    const n = normalizeLayer(l, dur, still);
    if (!n) return fail('bad_layers', 'A layer is not valid.', l.id);
    out.push(n);
  }
  return { ok: true, layers: sortLayers(out) };
}

/** Bottom to top: by z, then by id. */
export function sortLayers(layers: Layer[]): Layer[] {
  return [...layers].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
}

/**
 * Layer times when the result's own timeline changes (a trim of a layered result, re-planned from its source): kept
 * where they still fall inside, clipped at the new end, dropped when nothing of them is left.
 */
export function shiftLayers(layers: readonly Layer[], offsetSec: number, newDur: number): Layer[] {
  const out: Layer[] = [];
  for (const l of layers) {
    const s = r2(Math.max(0, l.startSec - offsetSec));
    const e = r2(Math.min(newDur, l.endSec - offsetSec));
    if (e - s < MIN_LAYER_SEC) continue;
    const next = { ...l, startSec: s, endSec: e } as Layer;
    if (next.kind !== 'mask' && next.motionSec > e - s) next.motionSec = r2(e - s);
    out.push(next);
  }
  return out;
}

// ── captions ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type TrackResolved = { ok: true; track: CaptionTrack } | { ok: false; error: 'bad_captions' | 'out_of_range'; message: string };

/** A caption track checked and tidied against a result of `dur` s: cues in order, inside the result, never overlapping. */
export function resolveTrack(x: unknown, dur: number): TrackResolved {
  const t = x as Partial<CaptionTrack> | null;
  if (!t || typeof t !== 'object' || !Array.isArray(t.cues)) return { ok: false, error: 'bad_captions', message: 'The captions are not valid.' };
  if (!['ka', 'en', 'ru', 'und'].includes(t.lang as string) || !['typed', 'file', 'transcript', 'translation'].includes(t.source as string)) {
    return { ok: false, error: 'bad_captions', message: 'The captions are not valid.' };
  }
  if (!t.cues.length || t.cues.length > MAX_CUES) return { ok: false, error: 'bad_captions', message: `Captions are 1 to ${MAX_CUES} lines.` };
  const style = (TEXT_STYLES as readonly unknown[]).includes(t.style) ? (t.style as TextStyle) : 'minimal';
  const cues: CaptionCue[] = [];
  for (const raw of t.cues) {
    const c = raw as Partial<CaptionCue> | null;
    if (!c || !isNum(c.startSec) || !isNum(c.endSec)) return { ok: false, error: 'bad_captions', message: 'A caption line has no time.' };
    const text = cleanLayerText(c.text).replace(/\n/g, ' ');
    if (!text || graphemes(text).length > MAX_CUE_TEXT) return { ok: false, error: 'bad_captions', message: `A caption line is 1 to ${MAX_CUE_TEXT} characters.` };
    const s = r2(c.startSec);
    let e = r2(c.endSec);
    if (s >= dur) return { ok: false, error: 'out_of_range', message: `A caption starts after the end (${r2(dur)} s).` };
    if (e > dur) e = r2(dur);
    if (s < 0 || e - s < MIN_CUE_SEC) return { ok: false, error: 'bad_captions', message: 'A caption line is too short or out of order.' };
    const prev = cues[cues.length - 1];
    if (prev && s < prev.startSec) return { ok: false, error: 'bad_captions', message: 'Caption lines are out of order.' };
    // An overlap ends the earlier line where the next begins (two lines are never on screen at once).
    if (prev && s < prev.endSec) {
      prev.endSec = s;
      if (prev.endSec - prev.startSec < MIN_CUE_SEC) return { ok: false, error: 'bad_captions', message: 'Two caption lines overlap.' };
    }
    const cue: CaptionCue = { startSec: s, endSec: e, text };
    if (isStr(c.speaker) && c.speaker.trim()) cue.speaker = cleanLayerText(c.speaker).slice(0, 24);
    if (Array.isArray(c.words) && c.words.length) {
      const words: CaptionWord[] = [];
      for (const w of c.words) {
        if (!w || !isStr(w.text) || !isNum(w.startSec) || !isNum(w.endSec)) return { ok: false, error: 'bad_captions', message: 'A word has no time.' };
        words.push({ text: cleanLayerText(w.text), startSec: r2(clamp(w.startSec, s, e)), endSec: r2(clamp(w.endSec, s, e)) });
      }
      cue.words = words;
    }
    cues.push(cue);
  }
  return {
    ok: true,
    track: { lang: t.lang as CaptionTrack['lang'], source: t.source as CaptionTrack['source'], cues, style, karaoke: Boolean(t.karaoke) && cues.some((c) => c.words?.length), speakers: Boolean(t.speakers) },
  };
}

/** Caption cues shifted onto a new timeline (a trim): kept where they fall inside, clipped at the edges. */
export function shiftCues(cues: readonly CaptionCue[], offsetSec: number, newDur: number): CaptionCue[] {
  const out: CaptionCue[] = [];
  for (const c of cues) {
    const s = r2(Math.max(0, c.startSec - offsetSec)), e = r2(Math.min(newDur, c.endSec - offsetSec));
    if (e - s < MIN_CUE_SEC) continue;
    out.push({ ...c, startSec: s, endSec: e, ...(c.words ? { words: c.words.map((w) => ({ ...w, startSec: r2(clamp(w.startSec - offsetSec, s, e)), endSec: r2(clamp(w.endSec - offsetSec, s, e)) })) } : {}) });
  }
  return out;
}

const pad = (n: number, w: number) => String(n).padStart(w, '0');
function stamp(sec: number, sep: ',' | '.'): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${sep}${pad(ms % 1000, 3)}`;
}
const cueLine = (c: CaptionCue, speakers: boolean, prev?: CaptionCue): string =>
  speakers && c.speaker && c.speaker !== prev?.speaker ? `${c.speaker}: ${c.text}` : c.text;

/** The track as an .srt file (UTF-8, numbered, `00:00:01,250 --> 00:00:03,000`). */
export function toSrt(track: Pick<CaptionTrack, 'cues' | 'speakers'>): string {
  return track.cues.map((c, i) => `${i + 1}\n${stamp(c.startSec, ',')} --> ${stamp(c.endSec, ',')}\n${cueLine(c, track.speakers, track.cues[i - 1])}\n`).join('\n');
}

/** The track as a .vtt file (WebVTT, `00:00:01.250 --> 00:00:03.000`). */
export function toVtt(track: Pick<CaptionTrack, 'cues' | 'speakers'>): string {
  return `WEBVTT\n\n${track.cues.map((c, i) => `${stamp(c.startSec, '.')} --> ${stamp(c.endSec, '.')}\n${cueLine(c, track.speakers, track.cues[i - 1])}\n`).join('\n')}`;
}

/** „00:00:01,250" / „00:01.250" / „1:05" / „65.5" → seconds; null when it is not a time. */
export function parseStamp(s: string): number | null {
  const m = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?\s*$/.exec(s);
  if (m) return (m[1] ? Number(m[1]) * 3600 : 0) + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number(m[4].padEnd(3, '0')) / 1000 : 0);
  const n = /^\s*(\d{1,4})(?:[.,](\d{1,3}))?\s*$/.exec(s);
  return n ? Number(n[1]) + (n[2] ? Number(n[2].padEnd(3, '0')) / 1000 : 0) : null;
}

/**
 * Timed caption lines out of a subtitle file's text (.srt or .vtt) or lines typed in the chat
 * („0:01–0:03 გამარჯობა", „00:00:01,000 --> 00:00:03,000"); [] when there are none.
 */
export function parseTimedLines(text: unknown): CaptionCue[] {
  if (!isStr(text)) return [];
  const src = text.replace(/\r/g, '').slice(0, 200_000);
  const cues: CaptionCue[] = [];
  const ARROW = /^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/;
  const lines = src.split('\n');
  if (lines.some((l) => ARROW.test(l))) {
    for (let i = 0; i < lines.length; i += 1) {
      const m = ARROW.exec(lines[i]!);
      if (!m) continue;
      const s = parseStamp(m[1]!), e = parseStamp(m[2]!);
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() && !ARROW.test(lines[j]!)) {
        if (!(/^\d+$/.test(lines[j]!.trim()) && j + 1 < lines.length && ARROW.test(lines[j + 1]!))) body.push(lines[j]!.replace(/<[^>]{1,40}>/g, '').trim());
        j += 1;
      }
      if (s !== null && e !== null && body.length) cues.push({ startSec: r2(s), endSec: r2(e), text: body.join(' ') });
      i = j - 1;
    }
    return cues;
  }
  // „0:01–0:03 text" / „0:01-0:03: text" / „1–3 წმ: text": one per line, or several on one line (a phone keyboard sends
  // on return: „ქეფშენები: 0:00-0:02 გამარჯობა; 0:02-0:04 მიტანა"). A line's first time starts it or follows „:" / „;";
  // a later one also follows „,", a space or the words when it is plainly a time (m:ss, or a unit), so „მიტანა, 2-3 დღეში"
  // stays words. A cue's words run to the next time.
  const T = String.raw`(\d{1,2}:\d{2}(?:[.,]\d{1,3})?|\d{1,4}(?:[.,]\d{1,3})?)`;
  const RANGE = new RegExp(String.raw`(^|[:;,]|\s)\s*${T}\s*(?:-|–|—)\s*${T}\s*(წამი?|წმ\.?|s|sec|с|сек)?\s*[:.)\-–—]?\s+`, 'giu');
  for (const line of src.split('\n')) {
    const found: { from: number; body: number; s: string; e: string }[] = [];
    RANGE.lastIndex = 0;
    for (let m = RANGE.exec(line); m; m = RANGE.exec(line)) {
      const sep = m[1]!;
      const strong = m.index === 0 || ((sep === ':' || sep === ';') && !/\d/.test(line[m.index - 1] ?? ''));
      const plain = (m[2]!.includes(':') && m[3]!.includes(':')) || Boolean(m[4]);
      if (!(strong || (found.length > 0 && plain))) { RANGE.lastIndex = m.index + 1; continue; }
      found.push({ from: m.index, body: m.index + m[0].length, s: m[2]!, e: m[3]! });
    }
    found.forEach((f, i) => {
      const s = parseStamp(f.s), e = parseStamp(f.e);
      const body = line.slice(f.body, found[i + 1]?.from ?? line.length).replace(/[\s;,]+$/u, '').replace(/^["“„«]+|["”“»]+$/g, '').trim();
      if (s !== null && e !== null && e > s && body) cues.push({ startSec: r2(s), endSec: r2(e), text: body });
    });
  }
  return cues;
}
