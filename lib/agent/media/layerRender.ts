/**
 * lib/agent/media/layerRender.ts — Agent G's text layers and caption lines drawn as transparent PNGs: SVG → resvg with
 * the bundled FiraGO (Latin + Cyrillic + Georgian) and NO system fonts, so the same words make the same pixels here, in
 * a test and on Vercel. ffmpeg-static has no drawtext; ./layerCompose lays these PNGs over the video with `overlay`.
 *
 * EXACT TEXT, MEASURED. Lines are broken at spaces on the font's MEASURED widths (resvg's own bounding box, not an
 * estimate), a word is never split, and a text that does not fit at the asked size is set smaller (down to a floor),
 * then refused: never cut. A character the bundled fonts cannot draw is named (missingGlyphs) and the edit is refused
 * at the quote, never drawn as a blank or a box.
 *
 * Every state of one layer (a typewriter's letters, a word-by-word reveal, a scale-in) is drawn on the SAME canvas, so
 * the overlay's position never moves while the text comes in.
 */
import 'server-only';
import { Resvg } from '@resvg/resvg-js';
import { overlayFontFiles } from '@/lib/pipeline/compositing/ffmpeg-overlay';
import {
  fontPxFor, graphemes, placeBox, safeArea,
  type Anchor, type CaptionCue, type CaptionTrack, type Rect, type TextLayer, type TextStyle,
} from './layers';

interface Look {
  family: string;
  fill: string;
  /** Letter spacing, in em. */
  ls: number;
  /** Drop shadow opacity (0 = none). */
  shadow: number;
  /** Outline width in em (0 = none). */
  stroke: number;
  /** A panel behind the text: colour and opacity, corner radius in em. */
  panel: { fill: string; opacity: number; radius: number } | null;
  /** The style's size against the layer's asked size. */
  sizeK: number;
}

export const LOOKS: Readonly<Record<TextStyle, Look>> = {
  minimal: { family: 'FiraGO', fill: '#FFFFFF', ls: 0, shadow: 0.4, stroke: 0, panel: null, sizeK: 0.95 },
  cinematic: { family: 'FiraGO Medium', fill: '#FFFFFF', ls: 0.02, shadow: 0.6, stroke: 0, panel: null, sizeK: 1 },
  premium: { family: 'FiraGO', fill: '#F4EFE6', ls: 0.09, shadow: 0.3, stroke: 0, panel: null, sizeK: 0.82 },
  bold: { family: 'FiraGO Medium', fill: '#FFFFFF', ls: 0, shadow: 0, stroke: 0.1, panel: null, sizeK: 1.1 },
  brand: { family: 'FiraGO Medium', fill: '#FFFFFF', ls: 0.01, shadow: 0, stroke: 0, panel: { fill: '#338FE8', opacity: 1, radius: 0.5 }, sizeK: 1 },
};
/** The panel added under a style that has none when the picture behind the text is too close to its colour. */
const LEGIBILITY_PANEL = { fill: '#000000', opacity: 0.5, radius: 0.22 };
/** The spoken word in a karaoke caption. */
export const KARAOKE_FILL = '#FFD84D';
/** A text set smaller to fit is never smaller than this share of its asked size. */
const MIN_FIT = 0.6;
/** A text of up to MAX_LAYER_TEXT letters wraps to at most this many lines (a short paragraph on a phone frame). */
const MAX_LINES = 6;
const LINE_H = 1.25;

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const even = (n: number): number => Math.max(2, Math.ceil(n / 2) * 2);
const r2 = (n: number): number => Math.round(n * 100) / 100;

function resvg(svg: string): Resvg {
  return new Resvg(svg, { font: { fontFiles: overlayFontFiles(), loadSystemFonts: false, defaultFontFamily: 'FiraGO' } });
}

const widthCache = new Map<string, number>();
/** The drawn width of one line, in px (resvg's bounding box of the line as it will be set). */
export function measure(text: string, family: string, fs: number, lsEm: number): number {
  if (!text.trim()) return 0;
  const key = `${family}|${fs}|${lsEm}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  const w = Math.ceil(fs * (graphemes(text).length + 2) * 1.2);
  const svg = `<svg width="${w}" height="${Math.ceil(fs * 2)}" xmlns="http://www.w3.org/2000/svg"><text x="0" y="${Math.round(fs * 1.4)}" font-family="${family}" font-size="${fs}" letter-spacing="${r2(lsEm * fs)}">${esc(text)}</text></svg>`;
  const b = resvg(svg).getBBox();
  const width = b ? Math.ceil(b.x + b.width) : 0;
  if (widthCache.size > 4000) widthCache.clear();
  widthCache.set(key, width);
  return width;
}

const glyphCache = new Map<string, boolean>();
/** The characters of `text` the bundled fonts cannot draw (an emoji, a script they do not cover), each once, in order. */
export function missingGlyphs(text: string): string[] {
  const out: string[] = [];
  for (const ch of new Set(graphemes(text))) {
    if (/\s/.test(ch)) continue;
    let ok = glyphCache.get(ch);
    if (ok === undefined) {
      const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><text x="20" y="120" font-family="FiraGO" font-size="80">${esc(ch)}</text></svg>`;
      ok = Boolean(resvg(svg).getBBox());
      glyphCache.set(ch, ok);
    }
    if (!ok) out.push(ch);
  }
  return out;
}

/** Break a paragraph at spaces so every line is at most `maxW` wide; null when one word alone is wider. */
function breakLines(text: string, family: string, fs: number, ls: number, maxW: number): string[] | null {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ').filter(Boolean)) {
      if (measure(word, family, fs, ls) > maxW) return null;
      const next = line ? `${line} ${word}` : word;
      if (measure(next, family, fs, ls) <= maxW) { line = next; continue; }
      out.push(line);
      line = word;
    }
    if (line) out.push(line);
  }
  return out;
}

export interface TextLayout {
  id: string;
  anchor: Anchor;
  look: Look;
  fontPx: number;
  /** The size asked for (the layout may have set it smaller to fit). */
  askedPx: number;
  lines: string[];
  lineWidths: number[];
  /** The canvas: always room for a panel, so adding one later does not move the text. */
  box: Rect;
  padX: number;
  padY: number;
}

export type LayoutResult = { ok: true; layout: TextLayout } | { ok: false; error: 'text_does_not_fit' | 'missing_glyphs'; detail: string };

/** Where and how a text layer is set on a `fw`×`fh` frame: its lines, size, and box inside the safe area. */
export function layoutText(l: Pick<TextLayer, 'id' | 'text' | 'anchor' | 'size' | 'style'>, fw: number, fh: number): LayoutResult {
  const missing = missingGlyphs(l.text);
  if (missing.length) return { ok: false, error: 'missing_glyphs', detail: missing.join(' ') };
  const look = LOOKS[l.style];
  const area = safeArea(fw, fh);
  const askedPx = Math.round(fontPxFor(l.size, fw, fh) * look.sizeK);
  for (let fs = askedPx; fs >= Math.max(10, Math.round(askedPx * MIN_FIT)); fs = Math.floor(fs * 0.92)) {
    const padX = Math.round(fs * 0.6), padY = Math.round(fs * 0.38);
    const lines = breakLines(l.text, look.family, fs, look.ls, area.w - 2 * padX);
    if (!lines || lines.length > MAX_LINES) continue;
    const lineWidths = lines.map((s) => measure(s, look.family, fs, look.ls));
    const w = even(Math.max(...lineWidths) + 2 * padX);
    const h = even(Math.round(lines.length * fs * LINE_H + 2 * padY));
    if (h > area.h) continue;
    const { x, y } = placeBox(l.anchor, w, h, area);
    return { ok: true, layout: { id: l.id, anchor: l.anchor, look, fontPx: fs, askedPx, lines, lineWidths, box: { x, y, w, h }, padX, padY } };
  }
  return { ok: false, error: 'text_does_not_fit', detail: l.id };
}

/** WCAG contrast of two relative luminances. */
export const contrastRatio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
/** Relative luminance of a #RRGGBB colour. */
export function luminanceOf(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
}

/** Below this contrast with the picture behind it, a text without its own panel or outline gets the legibility panel. */
export const MIN_CONTRAST = 3;

/** The panel a layout is drawn with: its style's own, or the legibility panel when the picture behind is too close. */
export function panelFor(look: Look, bgLuminance: number | null): { panel: Look['panel']; contrast: number | null; added: boolean } {
  if (look.panel) return { panel: look.panel, contrast: null, added: false };
  if (bgLuminance === null) return { panel: null, contrast: null, added: false };
  const contrast = r2(contrastRatio(luminanceOf(look.fill), bgLuminance));
  if (look.stroke > 0 || contrast >= MIN_CONTRAST) return { panel: null, contrast, added: false };
  return { panel: LEGIBILITY_PANEL, contrast, added: true };
}

interface DrawOpts {
  panel: Look['panel'];
  /** Show only this many characters (spaces not counted): a typewriter state. */
  chars?: number;
  /** Show only this many words: a word-by-word state. */
  words?: number;
  /** Draw at this scale around the centre: a scale-in state. */
  scale?: number;
  /** Light up this word (0-based over the whole text): karaoke. */
  litWord?: number;
}

/** Cut the lines to the first `chars` characters or `words` words (the rest is not drawn; the layout does not move). */
function visible(lines: string[], o: DrawOpts): string[] {
  if (o.chars === undefined && o.words === undefined) return lines;
  let charsLeft = o.chars ?? Infinity, wordsLeft = o.words ?? Infinity;
  return lines.map((line) => {
    if (o.words !== undefined) {
      const ws = line.split(' ');
      const take = Math.max(0, Math.min(ws.length, wordsLeft));
      wordsLeft -= take;
      return ws.slice(0, take).join(' ');
    }
    let out = '';
    for (const ch of graphemes(line)) {
      if (ch !== ' ') {
        if (charsLeft <= 0) break;
        charsLeft -= 1;
      }
      out += ch;
    }
    return out.replace(/\s+$/, '');
  });
}

/** The SVG of one state of a layout (exported for the tests: the exact words are in it, escaped, never altered). */
export function layoutSvg(t: TextLayout, o: DrawOpts): string {
  const { box, look, fontPx: fs, padX, padY } = t;
  const parts: string[] = [];
  if (o.panel) {
    parts.push(`<rect x="0" y="0" width="${box.w}" height="${box.h}" rx="${Math.round(o.panel.radius * fs)}" fill="${o.panel.fill}" fill-opacity="${o.panel.opacity}"/>`);
  }
  const h = t.anchor.endsWith('left') ? 'left' : t.anchor.endsWith('right') ? 'right' : 'center';
  const shown = visible(t.lines, o);
  const ls = r2(look.ls * fs);
  let wordIndex = 0;
  shown.forEach((line, i) => {
    const full = t.lineWidths[i]!;
    const x0 = h === 'left' ? padX : h === 'right' ? box.w - padX - full : Math.round((box.w - full) / 2);
    const y = Math.round(padY + fs * (0.95 + i * LINE_H));
    const attrs = `font-family="${look.family}" font-size="${fs}" letter-spacing="${ls}"`;
    const words = line.split(' ').filter(Boolean);
    const body = o.litWord === undefined
      ? esc(line)
      : words.map((w, k) => (wordIndex + k === o.litWord ? `<tspan fill="${KARAOKE_FILL}">${esc(w)}</tspan>` : esc(w))).join(' ');
    wordIndex += t.lines[i]!.split(' ').filter(Boolean).length;
    if (!line) return;
    if (look.shadow > 0) {
      const d = Math.max(1, Math.round(fs * 0.05));
      parts.push(`<text x="${x0 + d}" y="${y + d}" ${attrs} fill="#000000" fill-opacity="${look.shadow}">${esc(line)}</text>`);
    }
    if (look.stroke > 0) {
      parts.push(`<text x="${x0}" y="${y}" ${attrs} fill="#000000" stroke="#000000" stroke-width="${r2(look.stroke * fs)}" stroke-linejoin="round">${esc(line)}</text>`);
    }
    parts.push(`<text x="${x0}" y="${y}" ${attrs} fill="${look.fill}">${body}</text>`);
  });
  const inner = parts.join('');
  const scaled = o.scale !== undefined && o.scale !== 1
    ? `<g transform="translate(${r2(box.w / 2)} ${r2(box.h / 2)}) scale(${r2(o.scale)}) translate(${r2(-box.w / 2)} ${r2(-box.h / 2)})">${inner}</g>`
    : inner;
  return `<svg width="${box.w}" height="${box.h}" viewBox="0 0 ${box.w} ${box.h}" xmlns="http://www.w3.org/2000/svg">${scaled}</svg>`;
}

export function rasterize(svg: string): Buffer {
  return Buffer.from(resvg(svg).render().asPng());
}

/** A transparent canvas of `w`×`h` (the gaps between states). */
export function blankPng(w: number, h: number): Buffer {
  return rasterize(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"></svg>`);
}

export interface DrawnState {
  png: Buffer;
  /** When this state starts, in seconds from the layer's start. */
  atSec: number;
}

export interface DrawnText {
  layout: TextLayout;
  states: DrawnState[];
  panel: { added: boolean; contrast: number | null; drawn: boolean };
  /** The times words were shown at (a word-by-word reveal), from the layer's start. */
  revealAt?: number[];
}

/** Ease-out (fast in, settles): the shape of every way in. */
export const easeOut = (p: number): number => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;

/**
 * Every state of a text layer: one (fade, slide, none), a scale-in in eight steps, a typewriter a letter at a time, or
 * a word-by-word reveal (at `beatsAt` when given: the music's beats, from the layer's start).
 */
export function drawText(l: TextLayer, layout: TextLayout, bgLuminance: number | null, beatsAt?: number[]): DrawnText {
  const p = panelFor(layout.look, bgLuminance);
  const base = { panel: p.panel };
  const states: DrawnState[] = [];
  let revealAt: number[] | undefined;
  const span = Math.max(0.01, l.motionSec);
  if (l.motionIn === 'scale') {
    const steps = 8;
    for (let k = 0; k < steps; k += 1) states.push({ png: rasterize(layoutSvg(layout, { ...base, scale: 0.7 + 0.3 * easeOut(k / steps) })), atSec: r2((span * k) / steps) });
    states.push({ png: rasterize(layoutSvg(layout, base)), atSec: r2(span) });
  } else if (l.motionIn === 'typewriter') {
    const total = graphemes(l.text.replace(/\s+/g, '')).length;
    const step = Math.max(1, Math.ceil(total / 100));
    for (let c = step; c < total; c += step) states.push({ png: rasterize(layoutSvg(layout, { ...base, chars: c })), atSec: r2((span * (c - step)) / total) });
    states.push({ png: rasterize(layoutSvg(layout, base)), atSec: r2((span * Math.max(0, total - step)) / total) });
  } else if (l.motionIn === 'words') {
    const n = l.text.split(/\s+/).filter(Boolean).length;
    const at = beatsAt && beatsAt.length >= n ? beatsAt.slice(0, n) : Array.from({ length: n }, (_, k) => r2((span * k) / n));
    revealAt = at;
    for (let k = 1; k <= n; k += 1) states.push({ png: rasterize(layoutSvg(layout, k === n ? base : { ...base, words: k })), atSec: at[k - 1]! });
  } else {
    states.push({ png: rasterize(layoutSvg(layout, base)), atSec: 0 });
  }
  return { layout, states, panel: { added: p.added, contrast: p.contrast, drawn: Boolean(p.panel) }, ...(revealAt ? { revealAt } : {}) };
}

// ── captions ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A caption line's size: 4.8 % of the short side (× the style's size), the same on every frame shape. */
export const CAPTION_SIZE = 48;
const CAPTION_LINES = 2;

export interface DrawnCaptions {
  /** One canvas for the whole track: the full safe width, room for two lines, at the bottom of the safe area. */
  box: Rect;
  fontPx: number;
  /** In time order; a cue with word times and karaoke has one state per word. */
  states: Array<{ startSec: number; endSec: number; png: Buffer; text: string }>;
  /** Lines that had to be set smaller to fit two lines. */
  shrunk: number;
}

export type CaptionsResult = { ok: true; drawn: DrawnCaptions } | { ok: false; error: 'text_does_not_fit' | 'missing_glyphs'; detail: string };

const cueText = (c: CaptionCue, track: Pick<CaptionTrack, 'speakers'>, prev?: CaptionCue): string =>
  track.speakers && c.speaker && c.speaker !== prev?.speaker ? `${c.speaker}: ${c.text}` : c.text;

/** The caption track drawn: every cue (and every karaoke word of it) as a PNG on one shared canvas. */
export function drawCaptions(track: CaptionTrack, fw: number, fh: number): CaptionsResult {
  const look = { ...LOOKS[track.style] };
  // Captions keep a panel by default: they sit over any picture for minutes, and must stay readable on all of it.
  if (track.style === 'minimal') look.panel = { fill: '#000000', opacity: 0.55, radius: 0.18 };
  const area = safeArea(fw, fh);
  const fs0 = Math.round(fontPxFor(CAPTION_SIZE, fw, fh) * look.sizeK);
  const padX = Math.round(fs0 * 0.5), padY = Math.round(fs0 * 0.3);
  const w = even(area.w);
  const h = even(Math.round(CAPTION_LINES * fs0 * LINE_H + 2 * padY));
  const { x, y } = placeBox('bottom', w, h, area);
  const all = track.cues.map((c, i) => cueText(c, track, track.cues[i - 1])).join(' ');
  const missing = missingGlyphs(all);
  if (missing.length) return { ok: false, error: 'missing_glyphs', detail: missing.join(' ') };
  const states: DrawnCaptions['states'] = [];
  let shrunk = 0;
  for (let i = 0; i < track.cues.length; i += 1) {
    const cue = track.cues[i]!;
    const text = cueText(cue, track, track.cues[i - 1]);
    let fit: { fs: number; lines: string[] } | null = null;
    for (let fs = fs0; fs >= Math.round(fs0 * MIN_FIT); fs = Math.floor(fs * 0.92)) {
      const lines = breakLines(text, look.family, fs, look.ls, w - 2 * padX);
      if (lines && lines.length <= CAPTION_LINES) { fit = { fs, lines }; break; }
    }
    if (!fit) return { ok: false, error: 'text_does_not_fit', detail: `caption ${i + 1}` };
    if (fit.fs !== fs0) shrunk += 1;
    const lineWidths = fit.lines.map((s) => measure(s, look.family, fit!.fs, look.ls));
    // The cue's own box, bottom-aligned inside the shared canvas; its panel hugs the words.
    const bw = even(Math.max(...lineWidths) + 2 * padX);
    const bh = even(Math.round(fit.lines.length * fit.fs * LINE_H + 2 * padY));
    const layout: TextLayout = {
      id: `c${i + 1}`, anchor: 'bottom', look, fontPx: fit.fs, askedPx: fs0, lines: fit.lines, lineWidths,
      box: { x: 0, y: 0, w: bw, h: bh }, padX, padY,
    };
    const svgOf = (lit?: number) => {
      const inner = layoutSvg(layout, { panel: look.panel, ...(lit !== undefined ? { litWord: lit } : {}) })
        .replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><g transform="translate(${Math.round((w - bw) / 2)} ${h - bh})">${inner}</g></svg>`;
    };
    const words = track.karaoke && cue.words?.length && cue.words.length === text.split(/\s+/).filter(Boolean).length ? cue.words : null;
    if (words) {
      let at = cue.startSec;
      words.forEach((wd, k) => {
        const end = k + 1 < words.length ? words[k + 1]!.startSec : cue.endSec;
        if (end - at > 0.001) states.push({ startSec: at, endSec: end, png: rasterize(svgOf(k)), text });
        at = end;
      });
    } else {
      states.push({ startSec: cue.startSec, endSec: cue.endSec, png: rasterize(svgOf()), text });
    }
  }
  return { ok: true, drawn: { box: { x, y, w, h }, fontPx: fs0, states, shrunk } };
}
