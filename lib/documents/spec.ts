/**
 * lib/documents/spec.ts — what a document Agent G writes may contain, before anything renders it (Master Task v2.0,
 * Phase 1).
 *
 * The model never writes PDF bytes. It writes this structure, which is checked here, and the renderer
 * (./pdf.ts) draws it with the bundled FiraGO fonts. The bounds keep one request inside a lambda's memory and time:
 * the cap is about 30 A4 pages of text.
 *
 * Pure: no I/O, no React.
 */
import { z } from 'zod';

export const DOCUMENT_LOCALES = ['ka', 'en', 'ru'] as const;
export type DocumentLocale = (typeof DOCUMENT_LOCALES)[number];

/** Control characters (other than tab and newline) never reach the page: a font has no glyph for them. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const text = (max: number) => z.string().transform((s) => s.replace(CONTROL, '').trim()).pipe(z.string().min(1).max(max));

const paragraph = z.object({ type: z.literal('paragraph'), text: text(4000) });
const bullets = z.object({ type: z.literal('bullets'), items: z.array(text(500)).min(1).max(30) });
const table = z.object({
  type: z.literal('table'),
  columns: z.array(text(80)).min(1).max(6),
  rows: z.array(z.array(z.string().transform((s) => s.replace(CONTROL, '').trim()).pipe(z.string().max(300))).min(1).max(6)).min(1).max(60),
}).refine((t) => t.rows.every((r) => r.length === t.columns.length), { message: 'every row needs one cell per column' });
const chart = z.object({
  type: z.literal('chart'),
  kind: z.literal('bar'),
  title: text(120).optional(),
  labels: z.array(text(40)).min(1).max(12),
  values: z.array(z.number().finite()).min(1).max(12),
  unit: text(16).optional(),
}).refine((c) => c.labels.length === c.values.length, { message: 'one value per label' });

export const documentBlockSchema = z.union([paragraph, bullets, table, chart]);
export type DocumentBlock = z.infer<typeof documentBlockSchema>;

export const documentSpecSchema = z.object({
  title: text(160),
  subtitle: text(240).optional(),
  locale: z.enum(DOCUMENT_LOCALES).default('ka'),
  sections: z.array(z.object({
    heading: text(160),
    blocks: z.array(documentBlockSchema).max(60),
  })).min(1).max(30),
});
export type DocumentSpec = z.infer<typeof documentSpecSchema>;

/** The file name a document downloads as: the title, made safe for every OS, never empty. */
export function documentFileName(title: string, ext = '.pdf'): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${base || 'document'}${ext}`;
}
