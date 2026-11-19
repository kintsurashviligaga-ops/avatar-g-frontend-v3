/**
 * lib/documents/pdf.ts — a checked DocumentSpec (./spec) → PDF bytes, with Georgian that survives (Master Task v2.0,
 * Phase 1).
 *
 * WHY pdf-lib + FiraGO AND NOT pdfkit: every pdfkit writer in this repo uses its built-in Helvetica, which has no
 * Mkhedruli glyphs, so Georgian came out blank. pdfkit also reads `.afm` files off disk, which the lambda bundle does not
 * trace (see lib/services/presentation/deckPipeline.ts). pdf-lib is pure JS. The fonts are the FiraGO faces already
 * bundled as base64 for the video overlays (Georgian, Latin and Cyrillic in one face), embedded as subsets.
 *
 * Layout is deliberately plain: A4, one column, headings, paragraphs, bullets, ruled tables and a bar chart. Text is
 * wrapped by measured width. A word longer than a line is broken by characters. Every page gets "n / N" at the foot.
 */
import 'server-only';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { FIRAGO_REGULAR_B64, FIRAGO_MEDIUM_B64 } from '@/lib/pipeline/compositing/font-data-firago';
import type { DocumentBlock, DocumentSpec } from './spec';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = 30;

const INK = rgb(0.11, 0.13, 0.17);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.82, 0.84, 0.87);
const HEAD_FILL = rgb(0.93, 0.95, 0.98);
const ACCENT = rgb(0.16, 0.38, 0.72);
const BARS = [rgb(0.16, 0.38, 0.72), rgb(0.2, 0.6, 0.5), rgb(0.85, 0.55, 0.15), rgb(0.6, 0.3, 0.65), rgb(0.8, 0.3, 0.3)];

const SIZE = { title: 24, subtitle: 13, heading: 16, body: 11, table: 9.5, chartLabel: 8.5, footer: 8.5 } as const;
const LEADING = 1.45;

export interface RenderedPdf {
  bytes: Uint8Array;
  pages: number;
}

/** Split text into lines no wider than `width` at `size`. Newlines are kept; an over-long word is cut by characters. */
export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) <= width) { line = word; continue; }
      // A word wider than the line: break it by characters (code points, so a Georgian letter is never split).
      let piece = '';
      for (const ch of Array.from(word)) {
        if (font.widthOfTextAtSize(piece + ch, size) > width && piece) { lines.push(piece); piece = ch; } else piece += ch;
      }
      line = piece;
    }
    lines.push(line);
  }
  return lines;
}

/** Numbers on a chart axis or bar: at most two decimals, no trailing zeros. */
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** A round grid step (1, 2 or 5 × 10ⁿ) so the axis reads 0, 1,000, 2,000 … and the tallest bar has headroom. */
export function niceStep(span: number, ticks: number): number {
  const raw = span / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}

const CHART_PLOT_H = 170;

/** The height a block needs before it can start, so a heading is never left alone at the foot of a page. */
function startHeight(b: DocumentBlock | undefined): number {
  if (!b) return 0;
  if (b.type === 'chart') return CHART_PLOT_H + 70;
  if (b.type === 'table') return 60;
  return SIZE.body * LEADING * 2;
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(readonly doc: PDFDocument, readonly regular: PDFFont, readonly medium: PDFFont) { this.newPage(); }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  /** Make room for `h` points, starting a new page when the current one is full. */
  ensure(h: number): void {
    if (this.y - h < MARGIN) this.newPage();
  }

  lines(text: string, font: PDFFont, size: number, opts: { indent?: number; color?: ReturnType<typeof rgb>; after?: number } = {}): void {
    const indent = opts.indent ?? 0;
    const lh = size * LEADING;
    for (const line of wrapText(text, font, size, CONTENT_W - indent)) {
      this.ensure(lh);
      this.y -= lh;
      if (line) this.page.drawText(line, { x: MARGIN + indent, y: this.y + (lh - size) / 2, size, font, color: opts.color ?? INK });
    }
    this.y -= opts.after ?? 0;
  }

  /** `next` is the room the first block under the heading needs: the two move to a new page together. */
  heading(text: string, next = 0): void {
    this.ensure(SIZE.heading * LEADING + 16 + next);
    this.y -= 10;
    this.lines(text, this.medium, SIZE.heading, { color: ACCENT, after: 6 });
  }

  bullets(items: readonly string[]): void {
    for (const item of items) {
      const lh = SIZE.body * LEADING;
      this.ensure(lh);
      this.page.drawCircle({ x: MARGIN + 6, y: this.y - lh / 2, size: 1.8, color: INK });
      this.lines(item, this.regular, SIZE.body, { indent: 16, after: 2 });
    }
    this.y -= 6;
  }

  table(columns: readonly string[], rows: readonly (readonly string[])[]): void {
    const colW = CONTENT_W / columns.length;
    const pad = 5;
    const lh = SIZE.table * LEADING;
    const drawRow = (cells: readonly string[], head: boolean) => {
      const font = head ? this.medium : this.regular;
      const wrapped = cells.map((c) => wrapText(c, font, SIZE.table, colW - pad * 2));
      const h = Math.max(...wrapped.map((w) => w.length)) * lh + pad * 2;
      if (this.y - h < MARGIN) { this.newPage(); if (!head) drawRow(columns, true); }
      const top = this.y;
      if (head) this.page.drawRectangle({ x: MARGIN, y: top - h, width: CONTENT_W, height: h, color: HEAD_FILL });
      wrapped.forEach((ls, i) => {
        ls.forEach((l, j) => {
          if (l) this.page.drawText(l, { x: MARGIN + i * colW + pad, y: top - pad - (j + 1) * lh + (lh - SIZE.table) / 2, size: SIZE.table, font, color: INK });
        });
      });
      for (let i = 0; i <= columns.length; i += 1) {
        this.page.drawLine({ start: { x: MARGIN + i * colW, y: top }, end: { x: MARGIN + i * colW, y: top - h }, thickness: 0.5, color: RULE });
      }
      this.page.drawLine({ start: { x: MARGIN, y: top }, end: { x: MARGIN + CONTENT_W, y: top }, thickness: 0.5, color: RULE });
      this.page.drawLine({ start: { x: MARGIN, y: top - h }, end: { x: MARGIN + CONTENT_W, y: top - h }, thickness: 0.5, color: RULE });
      this.y = top - h;
    };
    drawRow(columns, true);
    for (const r of rows) drawRow(r, false);
    this.y -= 12;
  }

  chart(c: Extract<DocumentBlock, { type: 'chart' }>): void {
    const plotH = CHART_PLOT_H;
    const titleH = c.title ? SIZE.body * LEADING + 12 : 0;
    const labelH = SIZE.chartLabel * LEADING * 2 + 6;
    this.ensure(titleH + plotH + labelH + 16);
    if (c.title) this.lines(c.title, this.medium, SIZE.body, { after: 12 });
    const axisX = MARGIN + 44;
    const plotW = CONTENT_W - 44;
    const base = this.y - plotH;
    const dataMax = Math.max(0, ...c.values);
    const dataMin = Math.min(0, ...c.values);
    // Grid on round numbers, with room above the tallest bar for its value label.
    const step = niceStep((dataMax - dataMin) * 1.12 || 1, 4);
    const max = Math.ceil((dataMax * 1.12) / step) * step || step;
    const min = Math.floor((dataMin * 1.12) / step) * step;
    const span = max - min;
    const zeroY = base + ((0 - min) / span) * plotH;
    for (let v = min; v <= max + step / 2; v += step) {
      const gy = base + ((v - min) / span) * plotH;
      this.page.drawLine({ start: { x: axisX, y: gy }, end: { x: axisX + plotW, y: gy }, thickness: 0.4, color: RULE });
      const label = fmt(v);
      this.page.drawText(label, { x: axisX - 6 - this.regular.widthOfTextAtSize(label, SIZE.chartLabel), y: gy - SIZE.chartLabel / 3, size: SIZE.chartLabel, font: this.regular, color: MUTED });
    }
    this.page.drawLine({ start: { x: axisX, y: zeroY }, end: { x: axisX + plotW, y: zeroY }, thickness: 0.8, color: MUTED });
    const slot = plotW / c.values.length;
    const barW = Math.min(48, slot * 0.6);
    c.values.forEach((v, i) => {
      const x = axisX + slot * i + (slot - barW) / 2;
      const h = (Math.abs(v) / span) * plotH;
      const y = v >= 0 ? zeroY : zeroY - h;
      this.page.drawRectangle({ x, y, width: barW, height: Math.max(h, 0.5), color: BARS[i % BARS.length] });
      const vl = `${fmt(v)}${c.unit ? ` ${c.unit}` : ''}`;
      const vw = this.regular.widthOfTextAtSize(vl, SIZE.chartLabel);
      this.page.drawText(vl, { x: x + barW / 2 - vw / 2, y: v >= 0 ? y + h + 3 : y - SIZE.chartLabel - 3, size: SIZE.chartLabel, font: this.regular, color: INK });
      wrapText(c.labels[i] ?? '', this.regular, SIZE.chartLabel, slot - 4).slice(0, 2).forEach((l, j) => {
        const lw = this.regular.widthOfTextAtSize(l, SIZE.chartLabel);
        this.page.drawText(l, { x: axisX + slot * i + slot / 2 - lw / 2, y: base - 12 - j * SIZE.chartLabel * LEADING, size: SIZE.chartLabel, font: this.regular, color: MUTED });
      });
    });
    this.y = base - labelH - 10;
  }
}

/** Render a checked spec. Throws only on a font or pdf-lib failure, never on content (the spec bounds it). */
export async function renderDocumentPdf(spec: DocumentSpec, now: Date = new Date()): Promise<RenderedPdf> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(Buffer.from(FIRAGO_REGULAR_B64, 'base64'), { subset: true });
  const medium = await doc.embedFont(Buffer.from(FIRAGO_MEDIUM_B64, 'base64'), { subset: true });
  doc.setTitle(spec.title);
  doc.setLanguage(spec.locale === 'ka' ? 'ka-GE' : spec.locale === 'ru' ? 'ru-RU' : 'en-US');
  doc.setCreator('MyAvatar.ge Agent G');
  doc.setProducer('MyAvatar.ge');
  doc.setCreationDate(now);

  const w = new Writer(doc, regular, medium);
  w.lines(spec.title, medium, SIZE.title, { after: 4 });
  if (spec.subtitle) w.lines(spec.subtitle, regular, SIZE.subtitle, { color: MUTED, after: 2 });
  w.lines(now.toISOString().slice(0, 10), regular, SIZE.footer, { color: MUTED, after: 8 });
  w.page.drawLine({ start: { x: MARGIN, y: w.y }, end: { x: PAGE_W - MARGIN, y: w.y }, thickness: 1, color: ACCENT });
  w.y -= 8;

  for (const section of spec.sections) {
    w.heading(section.heading, startHeight(section.blocks[0]));
    for (const b of section.blocks) {
      if (b.type === 'paragraph') w.lines(b.text, regular, SIZE.body, { after: 8 });
      else if (b.type === 'bullets') w.bullets(b.items);
      else if (b.type === 'table') w.table(b.columns, b.rows);
      else w.chart(b);
    }
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `${i + 1} / ${pages.length}`;
    p.drawText(label, { x: PAGE_W / 2 - regular.widthOfTextAtSize(label, SIZE.footer) / 2, y: FOOTER_Y, size: SIZE.footer, font: regular, color: MUTED });
  });

  return { bytes: await doc.save(), pages: pages.length };
}
