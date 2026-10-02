'use client';

/**
 * useAttachments — what the chat composer carries besides text: files from the „+" pickers, images pasted from
 * the clipboard and files dropped on the composer. Each item keeps its name, size and kind, and is turned into
 * the `HistoryMedia` shape `lib/chat/historySerializer.ts` sends to /api/chat/gemini (`toHistoryMedia()`).
 *
 * Extracted from OmniStudio (the Files picker at :8617, Photos :8763, Camera :8753, drop :2293), which read every
 * file with FileReader and kept only `{dataUrl, mimeType}`. The fixes that came with the move:
 *
 * ⚠️ THE PHOTO PICKER LIED ABOUT ITS BYTES. It re-encoded the photo to JPEG (`downscaleDataUrl`) but stored the
 * ORIGINAL `f.type` as the MIME type, so an iPhone photo travelled as `image/heic` with JPEG bytes inside. The
 * type is now read from the bytes that are actually sent: after a re-encode it is `image/jpeg`, and the data
 * URL header and `mimeType` always agree.
 *
 * ⚠️ NOTHING WAS CAPPED. The Files picker had no size limit and no downscale, so a phone video went into the
 * JSON body whole. Now each file has a cap by kind (image 10 MB before downscale, pdf/doc 15 MB, audio/video
 * 20 MB), and all attachments of one message share a total cap on their ENCODED size (base64 is 4/3 of raw).
 *
 * ⚠️ THE REAL CEILING IS VERCEL'S ~4.5 MB REQUEST BODY, NOT THE ROUTE'S 16 MB. /api/chat/gemini checks
 * `MAX_BODY_BYTES = 16_000_000`, but it runs as a Node function on Vercel, and the platform rejects any request
 * body over ~4.5 MB (FUNCTION_PAYLOAD_TOO_LARGE) before the route runs — the repo says so in a dozen places
 * (`/api/upload/sign`, `lib/studio/media.ts`, `useUpload.ts`, OmniStudio :124). A total cap sized to the 16 MB
 * figure would pass files that then 413 in prod with only the generic error. So the default total is
 * `DEFAULT_TOTAL_CAP_BYTES` (≈4 MB encoded), overridable with `totalCapBytes`. It covers THIS message only:
 * the serializer also re-sends the previous media turn's bytes (media window = 2), which can push a request
 * over the edge on its own. The per-kind caps still matter: they refuse a 200 MB video before it is read into
 * memory, with a message that names the limit.
 *
 * ⚠️ .docx NEVER REACHED GEMINI AS SOMETHING IT COULD READ. Word files went up as raw bytes with a generic or
 * Office MIME type, which Gemini does not take inline. Now `.docx` goes through the existing
 * /api/utils/extract-text (mammoth, local, no provider spend) and travels as `text/plain` under its own name;
 * `.txt`/`.md` are decoded in the browser. PDF stays bytes: Gemini reads PDF natively, layout and all.
 *
 * ⚠️ PASTING FROM WORD/EXCEL/NUMBERS PUTS AN IMAGE ON THE CLIPBOARD TOO. Office apps copy a rendered PNG of the
 * selection alongside the text. Treating "the clipboard has an image file" as "the user pasted an image" would
 * swallow their text paste and attach a screenshot of it instead. When the clipboard also carries non-empty
 * plain text with an Office/RTF signature, the text paste wins.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent as ReactDragEvent } from 'react';
import type { HistoryMedia } from '@/lib/chat/historySerializer';

// ─── Types ───────────────────────────────────────────────────────────────────────────────────────────────

/** `doc` = a Word file turned into text; `text` = .txt/.md decoded in the browser; `file` = anything else, as bytes. */
export type AttachmentKind = 'image' | 'audio' | 'video' | 'pdf' | 'doc' | 'text' | 'file';
export type AttachmentSource = 'photos' | 'camera' | 'files' | 'paste' | 'drop';
export type AttachmentStatus = 'processing' | 'ready';

export interface Attachment {
  id: string;
  /** The file's own name (a pasted image without one gets `pasted-image.<ext>`). */
  name: string;
  /** Size of the ORIGINAL file in bytes (what the user picked, not what is sent). */
  size: number;
  kind: AttachmentKind;
  /** The MIME type of the bytes in `dataUrl` — always equal to the data URL header. '' while processing. */
  mimeType: string;
  /** Base64 data URL of what is sent. '' while processing. */
  dataUrl: string;
  /** Thumbnail source: the image data URL, or an object URL for a video. */
  previewUrl?: string;
  status: AttachmentStatus;
  /** A document's text was cut at `MAX_DOC_TEXT_CHARS`. */
  truncated?: boolean;
  source: AttachmentSource;
  /** Encoded size (`dataUrl.length`), which is what counts against the total cap. */
  payloadBytes: number;
}

export type RejectReason = 'too_large' | 'total_too_large' | 'too_many' | 'empty' | 'unreadable';

export interface AttachmentRejection {
  name: string;
  reason: RejectReason;
  /** Localized, ready for a toast. */
  message: string;
}

export interface AddResult { added: Attachment[]; rejected: AttachmentRejection[] }

/** A minimal image the downscaler can measure and draw (an `HTMLImageElement` in the browser). */
export interface DecodedImage { width: number; height: number }
export interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: '2d'): {
    fillStyle: string | CanvasGradient | CanvasPattern;
    fillRect(x: number, y: number, w: number, h: number): void;
    drawImage(img: never, x: number, y: number, w: number, h: number): void;
  } | null;
  toDataURL(type: string, quality?: number): string;
}

/** Everything that touches the browser, injectable so the logic runs under jest. */
export interface AttachmentDeps {
  readAsDataUrl(file: Blob): Promise<string>;
  readAsText(file: Blob): Promise<string>;
  loadImage(dataUrl: string): Promise<DecodedImage>;
  createCanvas(): CanvasLike | null;
  fetch: typeof fetch;
  createObjectUrl(file: Blob): string | null;
  revokeObjectUrl(url: string): void;
}

export interface UseAttachmentsOptions {
  locale?: string;
  /** Default `MAX_ATTACHMENTS` (5), the count OmniStudio has always allowed. */
  maxItems?: number;
  /** Total encoded size of one message's attachments. Default `DEFAULT_TOTAL_CAP_BYTES`. */
  totalCapBytes?: number;
  /** Longest side of a re-encoded image. Default `IMAGE_MAX_DIM`. */
  imageMaxDim?: number;
  /** Where Word files are turned into text. Default '/api/utils/extract-text'. */
  extractTextUrl?: string;
  /** Called once per refused file, e.g. to show a toast. */
  onReject?: (r: AttachmentRejection) => void;
  deps?: Partial<AttachmentDeps>;
}

export interface UseAttachmentsResult {
  items: Attachment[];
  /** True while any file is still being read, downscaled or extracted. Send should wait. */
  processing: boolean;
  /** Sum of `payloadBytes` of the ready items. */
  totalBytes: number;
  add(files: FileList | ReadonlyArray<File> | null | undefined, source?: AttachmentSource): Promise<AddResult>;
  remove(id: string): void;
  clear(): void;
  /** Ready items in the serializer's shape. `dataUrl`, `mimeType` and `name` are always set. */
  toHistoryMedia(): Array<HistoryMedia & { dataUrl: string; mimeType: string; name: string }>;
  /** For a hidden `<input type="file">`: adds the picked files and resets the input so the same file can be picked again. */
  onInputChange(source: AttachmentSource): (e: ChangeEvent<HTMLInputElement>) => void;
  /** For a textarea's `onPaste`: attaches pasted files, leaves a plain text paste alone. */
  onPaste(e: PasteEventLike): void;
  /** Spread on the drop surface. Only file drags react (a text selection drag is ignored). */
  dropHandlers: {
    onDragEnter(e: ReactDragEvent): void;
    onDragOver(e: ReactDragEvent): void;
    onDragLeave(e: ReactDragEvent): void;
    onDrop(e: ReactDragEvent): void;
  };
  /** A file drag is over the drop surface. */
  dragActive: boolean;
}

/** What `onPaste` reads — satisfied by React's and the DOM's ClipboardEvent. */
export interface PasteEventLike {
  clipboardData: DataTransferLike | null;
  preventDefault(): void;
}
export interface DataTransferLike {
  readonly items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }> | null;
  readonly files?: ArrayLike<File> | null;
  readonly types?: ReadonlyArray<string> | ArrayLike<string> | null;
  getData?(format: string): string;
}

// ─── Limits ──────────────────────────────────────────────────────────────────────────────────────────────

export const MB = 1024 * 1024;

/** Per-file caps on the ORIGINAL file, by kind. An image is checked before downscaling. */
export const PER_FILE_CAP_BYTES: Readonly<Record<AttachmentKind, number>> = Object.freeze({
  image: 10 * MB,
  pdf: 15 * MB,
  doc: 15 * MB,
  text: 15 * MB,
  file: 15 * MB,
  audio: 20 * MB,
  video: 20 * MB,
});

/** /api/chat/gemini `MAX_BODY_BYTES`. Kept for reference; the platform limit below is the one that binds. */
export const ROUTE_JSON_LIMIT_BYTES = 16_000_000;
/** Vercel's request body ceiling for a Node function (see the file header). */
export const PLATFORM_BODY_LIMIT_BYTES = 4_500_000;
/** Default total ENCODED size of one message's attachments: under the platform ceiling with room for the text. */
export const DEFAULT_TOTAL_CAP_BYTES = 4_000_000;
export const MAX_ATTACHMENTS = 5;
/** ≈25k tokens. A longer document is cut and the chip says so. */
export const MAX_DOC_TEXT_CHARS = 100_000;
/** Longest side of a re-encoded image. 1600 keeps screenshot text legible; the JPEG stays ~200–400 KB. */
export const IMAGE_MAX_DIM = 1600;
export const JPEG_QUALITY = 0.85;
/** An image already this small, within `IMAGE_MAX_DIM` and in a web format, is sent as is (no JPEG re-encode). */
export const IMAGE_KEEP_ORIGINAL_BYTES = 1_500_000;

// ─── Pure helpers ────────────────────────────────────────────────────────────────────────────────────────

const EXT_MIME: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/ogg', flac: 'audio/flac', weba: 'audio/webm',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', '3gp': 'video/3gpp',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', csv: 'text/csv', json: 'application/json',
  rtf: 'application/rtf', xml: 'text/xml', html: 'text/html', htm: 'text/html',
  // Source and data text: Gemini reads it inline as text/plain — without an entry here the picker gave a generic type and the
  // serializer replaced the file with "this format cannot be read here".
  tsv: 'text/plain', yaml: 'text/plain', yml: 'text/plain', log: 'text/plain', srt: 'text/plain', vtt: 'text/plain', css: 'text/plain',
  js: 'text/plain', jsx: 'text/plain', ts: 'text/plain', tsx: 'text/plain', py: 'text/plain', java: 'text/plain', c: 'text/plain', cpp: 'text/plain',
  cs: 'text/plain', go: 'text/plain', rs: 'text/plain', rb: 'text/plain', php: 'text/plain', sh: 'text/plain', sql: 'text/plain',
};

const GENERIC_MIMES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/unknown']);

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 || dot === name.length - 1 ? '' : name.slice(dot + 1).toLowerCase();
}

function baseMime(raw: string | null | undefined): string {
  return String(raw ?? '').split(';')[0]!.trim().toLowerCase();
}

/** The file's MIME type: the browser's, unless it is empty or generic, then the extension's. */
export function mimeForFile(file: { name?: string; type?: string }): string {
  const t = baseMime(file.type);
  if (t && !GENERIC_MIMES.has(t)) return t;
  return EXT_MIME[extOf(file.name ?? '')] ?? t;
}

/** Which pipeline a file takes. The extension decides when the browser gives no (or a generic) type. */
export function classifyFile(file: { name?: string; type?: string }): AttachmentKind {
  const ext = extOf(file.name ?? '');
  const mime = mimeForFile(file);
  if (ext === 'docx' || ext === 'doc' || /wordprocessingml|msword/.test(mime)) return 'doc';
  if (ext === 'txt' || ext === 'md' || ext === 'markdown' || mime === 'text/plain' || mime === 'text/markdown') return 'text';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  return 'file';
}

/** The MIME type in a data URL header ('' when absent), or null for a non-data URL. Never scans the payload. */
export function dataUrlMimeOf(dataUrl: string): string | null {
  if (typeof dataUrl !== 'string' || !/^data:/i.test(dataUrl)) return null;
  const comma = dataUrl.indexOf(',', 5);
  if (comma < 0 || comma > 512) return null;
  return baseMime(dataUrl.slice(5, comma));
}

/** Rewrites a generic (or empty) data URL header to `mime`, so the header and the declared type agree. */
export function withDataUrlMime(dataUrl: string, mime: string): string {
  const header = dataUrlMimeOf(dataUrl);
  if (header === null || !mime || !GENERIC_MIMES.has(header)) return dataUrl;
  const comma = dataUrl.indexOf(',', 5);
  return `data:${mime};base64,${dataUrl.slice(comma + 1)}`;
}

/** UTF-8 bytes of a string. TextEncoder where it exists; a manual encoder otherwise (jsdom, very old WebViews). */
export function utf8Bytes(s: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  const out: number[] = [];
  for (const ch of s) {
    let cp = ch.codePointAt(0) ?? 0xfffd;
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd; // a lone surrogate, as TextEncoder would replace it
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return Uint8Array.from(out);
}

/** UTF-8 text → `data:text/plain;base64,…` (Georgian and emoji survive: bytes, not `btoa` on UTF-16). */
export function textToDataUrl(text: string): string {
  const bytes = utf8Bytes(text);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return `data:text/plain;base64,${b64}`;
}

/** Caps a document's text, cutting at a line or word break near the limit when there is one. */
export function capDocText(text: string, max = MAX_DOC_TEXT_CHARS): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const cut = text.slice(0, max);
  const at = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf(' '));
  return { text: at > max * 0.9 ? cut.slice(0, at) : cut, truncated: true };
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${Math.round(n / 1024)} KB`;
  return `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
}

const REENCODE_KEEP_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Downscale an image data URL to `maxDim` on its longest side and re-encode it as JPEG. Returns the MIME type
 * of the bytes it returns — `image/jpeg` whenever it re-encoded, which is the photo-picker bug fix.
 *
 * A small image in a web format is returned untouched (a PNG screenshot stays crisp for "what does this say").
 * An image the browser cannot decode (HEIC in Chrome) is returned as is, typed from its header or the fallback;
 * Gemini reads HEIC itself.
 *
 * ⚠️ A TRANSPARENT PNG TURNS BLACK AS JPEG. JPEG has no alpha; a canvas exports transparent pixels as black,
 * so a logo on transparency would arrive as a black square. The canvas is filled white first.
 */
export async function downscaleImageDataUrl(
  dataUrl: string,
  opts: { maxDim?: number; quality?: number; keepUnderBytes?: number; fallbackMime?: string } = {},
  deps: Pick<AttachmentDeps, 'loadImage' | 'createCanvas'>,
): Promise<{ dataUrl: string; mimeType: string; reencoded: boolean }> {
  const maxDim = opts.maxDim ?? IMAGE_MAX_DIM;
  const header = dataUrlMimeOf(dataUrl) ?? '';
  const origMime = header && !GENERIC_MIMES.has(header) ? header : (opts.fallbackMime ?? header);
  const original = { dataUrl: withDataUrlMime(dataUrl, origMime), mimeType: origMime, reencoded: false };
  let img: DecodedImage;
  try {
    img = await deps.loadImage(dataUrl);
  } catch {
    return original;
  }
  const w0 = Math.max(0, Math.floor(img.width || 0));
  const h0 = Math.max(0, Math.floor(img.height || 0));
  if (!w0 || !h0) return original;
  const scale = Math.min(1, maxDim / Math.max(w0, h0));
  const small = dataUrl.length * 0.75 <= (opts.keepUnderBytes ?? IMAGE_KEEP_ORIGINAL_BYTES);
  if (scale >= 1 && small && REENCODE_KEEP_TYPES.has(origMime)) return original;
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = deps.createCanvas();
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return original;
  canvas.width = w;
  canvas.height = h;
  try {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img as never, 0, 0, w, h);
    const out = canvas.toDataURL('image/jpeg', opts.quality ?? JPEG_QUALITY);
    // A canvas that could not export (too large, tainted, out of memory) returns "data:," — keep the original.
    if (dataUrlMimeOf(out) !== 'image/jpeg' || out.length < 32) return original;
    return { dataUrl: out, mimeType: 'image/jpeg', reencoded: true };
  } catch {
    return original;
  }
}

/**
 * The files on a clipboard, or [] when the paste should stay a text paste. `items` first (Chrome, Safari put a
 * copied image there), `files` as the fallback (Firefox, and files copied in Finder/Explorer).
 */
export function filesFromClipboard(dt: DataTransferLike | null | undefined): File[] {
  if (!dt) return [];
  const out: File[] = [];
  const items = dt.items ? Array.from(dt.items) : [];
  for (const it of items) {
    if (it && it.kind === 'file') {
      const f = it.getAsFile();
      if (f) out.push(f);
    }
  }
  if (!out.length && dt.files) out.push(...Array.from(dt.files));
  if (!out.length) return [];
  const types = dt.types ? Array.from(dt.types as ArrayLike<string>) : [];
  const text = safeGetData(dt, 'text/plain');
  if (text.trim()) {
    const html = safeGetData(dt, 'text/html');
    const officeSignature = types.includes('text/rtf')
      || /urn:schemas-microsoft-com:office|xmlns:o=|ProgId content=|<meta name=Generator/i.test(html);
    // See the file header: a rendered picture of copied Office text is not the thing the user meant to paste.
    if (officeSignature && out.every((f) => /^image\//.test(f.type))) return [];
  }
  return out;
}

function safeGetData(dt: DataTransferLike, format: string): string {
  try {
    return typeof dt.getData === 'function' ? String(dt.getData(format) ?? '') : '';
  } catch {
    return '';
  }
}

/** A name for a file that came without one (a clipboard image in some browsers): `pasted-image.png`. */
function fallbackName(file: { type?: string }, source: AttachmentSource): string {
  const sub = (baseMime(file.type).split('/')[1] ?? '').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
  const base = source === 'paste' ? 'pasted-image' : 'file';
  return sub ? `${base}.${sub}` : base;
}

function dragHasFiles(e: ReactDragEvent): boolean {
  const types = e.dataTransfer?.types;
  return !!types && Array.from(types as ArrayLike<string>).includes('Files');
}

// ─── Localized messages ──────────────────────────────────────────────────────────────────────────────────

type Lang = 'ka' | 'en' | 'ru';
const langOf = (locale?: string): Lang => (locale === 'en' || locale === 'ru' ? locale : 'ka');
const mbText = (bytes: number) => String(Math.round((bytes / MB) * 10) / 10);

export function rejectionMessage(reason: RejectReason, lang: Lang, name: string, limitBytes = 0, max = MAX_ATTACHMENTS): string {
  const n = mbText(limitBytes);
  switch (reason) {
    case 'too_large':
      return lang === 'en' ? `“${name}” is too large (max ${n} MB)`
        : lang === 'ru' ? `«${name}» слишком большой (макс ${n} МБ)`
          : `„${name}“ ძალიან დიდია (მაქს ${n} MB)`;
    case 'total_too_large':
      return lang === 'en' ? `Attachments are too large together (max about ${n} MB) — “${name}” was not added`
        : lang === 'ru' ? `Вложения вместе слишком большие (макс около ${n} МБ) — «${name}» не добавлен`
          : `მიმაგრებული ფაილები ერთად ძალიან დიდია (მაქს დაახლ. ${n} MB) — „${name}“ არ დაემატა`;
    case 'too_many':
      return lang === 'en' ? `Up to ${max} files per message`
        : lang === 'ru' ? `Не больше ${max} файлов в сообщении`
          : `ერთ შეტყობინებაში მაქსიმუმ ${max} ფაილი`;
    case 'empty':
      // Same words as OmniStudio's script loader: 0 bytes is typically an iCloud file not yet downloaded.
      return lang === 'en' ? 'That file is empty — open it once in Files so it downloads, then retry'
        : lang === 'ru' ? 'Файл пуст — откройте его в «Файлах», затем повторите'
          : 'ფაილი ცარიელია — ჯერ გახსენი Files-ში (ჩამოიტვირთოს), მერე სცადე';
    case 'unreadable':
    default:
      return lang === 'en' ? `Couldn't read “${name}” — try a .txt or .pdf`
        : lang === 'ru' ? `Не удалось прочитать «${name}» — попробуйте .txt или .pdf`
          : `„${name}“ ვერ წავიკითხე — სცადე .txt ან .pdf`;
  }
}

// ─── Browser defaults ────────────────────────────────────────────────────────────────────────────────────

function readWith<T>(file: Blob, how: 'dataUrl' | 'text'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      const r = new FileReader();
      r.onload = () => resolve(r.result as T);
      r.onerror = () => reject(r.error ?? new Error('read failed'));
      if (how === 'dataUrl') r.readAsDataURL(file); else r.readAsText(file);
    } catch (err) {
      reject(err);
    }
  });
}

/** Defaults, overridden only by the injected deps that are actually defined (an explicit `undefined` keeps the default). */
function withDefaults<T extends object>(defaults: T, over: Partial<T> | undefined): T {
  const out = { ...defaults };
  if (over) {
    for (const k of Object.keys(over) as Array<keyof T>) {
      const v = over[k];
      if (v !== undefined) out[k] = v as T[keyof T];
    }
  }
  return out;
}

const defaultDeps = (): AttachmentDeps => ({
  readAsDataUrl: (f) => readWith<string>(f, 'dataUrl'),
  readAsText: (f) => readWith<string>(f, 'text'),
  loadImage: (src) => new Promise<DecodedImage>((resolve, reject) => {
    if (typeof Image === 'undefined') { reject(new Error('no Image')); return; }
    const el = new Image();
    el.decoding = 'async';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('decode failed'));
    el.src = src;
  }),
  createCanvas: () => (typeof document === 'undefined' ? null : (document.createElement('canvas') as unknown as CanvasLike)),
  fetch: (...args) => fetch(...args),
  createObjectUrl: (f) => {
    try { return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : null; } catch { return null; }
  },
  revokeObjectUrl: (u) => {
    try { if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(u); } catch { /* noop */ }
  },
});

let idSeq = 0;
const nextId = () => `att-${Date.now().toString(36)}-${(idSeq += 1).toString(36)}`;

// ─── The hook ────────────────────────────────────────────────────────────────────────────────────────────

export function useAttachments(options: UseAttachmentsOptions = {}): UseAttachmentsResult {
  const [items, setItems] = useState<Attachment[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Latest options/deps in a ref, so every returned function is stable across renders (OmniStudio's `send`
  // has ~70 dependencies; an unstable callback here would re-create it on every keystroke).
  const optsRef = useRef(options);
  optsRef.current = options;
  const depsRef = useRef<AttachmentDeps>(withDefaults(defaultDeps(), options.deps));
  depsRef.current = withDefaults(defaultDeps(), options.deps);

  // The authoritative list for synchronous checks (count and total) while several files process in one add().
  const itemsRef = useRef<Attachment[]>([]);
  const cancelledRef = useRef<Set<string>>(new Set());
  const aliveRef = useRef(true);
  const dragDepthRef = useRef(0);

  const commit = useCallback((next: Attachment[]) => {
    itemsRef.current = next;
    if (aliveRef.current) setItems(next);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      for (const it of itemsRef.current) {
        if (it.previewUrl && it.previewUrl.startsWith('blob:')) depsRef.current.revokeObjectUrl(it.previewUrl);
      }
    };
  }, []);

  const reject = useCallback((out: AttachmentRejection[], name: string, reason: RejectReason, limitBytes = 0) => {
    const o = optsRef.current;
    const r: AttachmentRejection = { name, reason, message: rejectionMessage(reason, langOf(o.locale), name, limitBytes, o.maxItems ?? MAX_ATTACHMENTS) };
    out.push(r);
    try { o.onReject?.(r); } catch { /* a toast must never break the picker */ }
  }, []);

  const processOne = useCallback(async (file: File, kind: AttachmentKind): Promise<Pick<Attachment, 'dataUrl' | 'mimeType' | 'truncated' | 'previewUrl'> | 'unreadable'> => {
    const deps = depsRef.current;
    const o = optsRef.current;
    if (kind === 'image') {
      const raw = await deps.readAsDataUrl(file);
      const out = await downscaleImageDataUrl(raw, { maxDim: o.imageMaxDim ?? IMAGE_MAX_DIM, fallbackMime: mimeForFile(file) }, deps);
      if (!out.dataUrl || dataUrlMimeOf(out.dataUrl) === null) return 'unreadable';
      return { dataUrl: out.dataUrl, mimeType: out.mimeType, previewUrl: out.dataUrl };
    }
    if (kind === 'text' || kind === 'doc') {
      let text = '';
      if (kind === 'text') {
        text = await deps.readAsText(file);
      } else {
        const dataUrl = await deps.readAsDataUrl(file);
        const res = await deps.fetch(o.extractTextUrl ?? '/api/utils/extract-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ dataUrl, mimeType: mimeForFile(file) }),
        });
        const j = (await res.json().catch(() => ({}))) as { text?: unknown };
        text = res.ok && typeof j.text === 'string' ? j.text : '';
      }
      // A BOM and stray NULs make Gemini read garbage; strip them. Whitespace-only counts as unreadable.
      // eslint-disable-next-line no-control-regex
      const clean = text.replace(/^﻿/, '').replace(/\u0000/g, '');
      if (!clean.trim()) return 'unreadable';
      const capped = capDocText(clean);
      return { dataUrl: textToDataUrl(capped.text), mimeType: 'text/plain', truncated: capped.truncated };
    }
    const raw = await deps.readAsDataUrl(file);
    const mime = mimeForFile(file) || dataUrlMimeOf(raw) || 'application/octet-stream';
    const dataUrl = withDataUrlMime(raw, mime);
    const header = dataUrlMimeOf(dataUrl);
    if (header === null) return 'unreadable';
    const previewUrl = kind === 'video' ? (deps.createObjectUrl(file) ?? undefined) : undefined;
    return { dataUrl, mimeType: header || mime, ...(previewUrl ? { previewUrl } : {}) };
  }, []);

  const add = useCallback(async (files: FileList | ReadonlyArray<File> | null | undefined, source: AttachmentSource = 'files'): Promise<AddResult> => {
    const result: AddResult = { added: [], rejected: [] };
    const list = files ? Array.from(files as ArrayLike<File>) : [];
    const o = optsRef.current;
    const maxItems = o.maxItems ?? MAX_ATTACHMENTS;
    const totalCap = o.totalCapBytes ?? DEFAULT_TOTAL_CAP_BYTES;
    // Sequential on purpose: the order the user picked is the order they see, and the total cap is checked
    // against a settled sum rather than several files racing past it at once.
    for (const file of list) {
      const kind = classifyFile(file);
      const name = (file.name || '').trim() || fallbackName(file, source);
      if (!file.size) { reject(result.rejected, name, 'empty'); continue; }
      const cap = PER_FILE_CAP_BYTES[kind];
      if (file.size > cap) { reject(result.rejected, name, 'too_large', cap); continue; }
      if (itemsRef.current.length >= maxItems) { reject(result.rejected, name, 'too_many'); continue; }

      const id = nextId();
      const pending: Attachment = { id, name, size: file.size, kind, mimeType: '', dataUrl: '', status: 'processing', source, payloadBytes: 0 };
      commit([...itemsRef.current, pending]);

      let processed: Awaited<ReturnType<typeof processOne>>;
      try {
        processed = await processOne(file, kind);
      } catch {
        processed = 'unreadable';
      }
      if (cancelledRef.current.has(id)) {
        // Removed (or cleared) while it was processing: drop the result, release a video's object URL.
        cancelledRef.current.delete(id);
        if (processed !== 'unreadable' && processed.previewUrl?.startsWith('blob:')) depsRef.current.revokeObjectUrl(processed.previewUrl);
        continue;
      }
      const without = itemsRef.current.filter((it) => it.id !== id);
      if (processed === 'unreadable') {
        commit(without);
        reject(result.rejected, name, 'unreadable');
        continue;
      }
      const payloadBytes = processed.dataUrl.length;
      const others = without.reduce((s, it) => s + (it.status === 'ready' ? it.payloadBytes : 0), 0);
      if (others + payloadBytes > totalCap) {
        commit(without);
        if (processed.previewUrl?.startsWith('blob:')) depsRef.current.revokeObjectUrl(processed.previewUrl);
        // Alone over the cap is "too large"; only a file that crosses it WITH others is "too large together".
        reject(result.rejected, name, others === 0 ? 'too_large' : 'total_too_large', totalCap);
        continue;
      }
      const ready: Attachment = { ...pending, ...processed, status: 'ready', payloadBytes };
      if (!ready.truncated) delete ready.truncated;
      commit(itemsRef.current.map((it) => (it.id === id ? ready : it)));
      result.added.push(ready);
    }
    return result;
  }, [commit, processOne, reject]);

  const remove = useCallback((id: string) => {
    const hit = itemsRef.current.find((it) => it.id === id);
    if (!hit) return;
    if (hit.status === 'processing') cancelledRef.current.add(id);
    if (hit.previewUrl?.startsWith('blob:')) depsRef.current.revokeObjectUrl(hit.previewUrl);
    commit(itemsRef.current.filter((it) => it.id !== id));
  }, [commit]);

  const clear = useCallback(() => {
    for (const it of itemsRef.current) {
      if (it.status === 'processing') cancelledRef.current.add(it.id);
      if (it.previewUrl?.startsWith('blob:')) depsRef.current.revokeObjectUrl(it.previewUrl);
    }
    commit([]);
  }, [commit]);

  const toHistoryMedia = useCallback(() => itemsRef.current
    .filter((it) => it.status === 'ready' && it.dataUrl)
    .map((it) => ({
      kind: (it.kind === 'doc' || it.kind === 'text' ? 'file' : it.kind) as HistoryMedia['kind'],
      dataUrl: it.dataUrl,
      mimeType: it.mimeType,
      name: it.name,
    })), []);

  const onInputChange = useCallback((source: AttachmentSource) => (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const picked = Array.from(input.files ?? []);
    // Reset first, so picking the same file again still fires `change`.
    try { input.value = ''; } catch { /* noop */ }
    if (picked.length) void add(picked, source);
  }, [add]);

  const onPaste = useCallback((e: PasteEventLike) => {
    const files = filesFromClipboard(e.clipboardData);
    if (!files.length) return; // a text paste: let the browser insert it
    e.preventDefault();
    void add(files, 'paste');
  }, [add]);

  const dropHandlers = useMemo(() => ({
    onDragEnter(e: ReactDragEvent) {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setDragActive(true);
    },
    onDragOver(e: ReactDragEvent) {
      if (!dragHasFiles(e)) return;
      e.preventDefault(); // required, or the browser navigates the tab to the dropped file
    },
    onDragLeave(e: ReactDragEvent) {
      if (!dragHasFiles(e)) return;
      // dragleave fires once per crossed child; a depth counter tells a real exit from a child boundary.
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragActive(false);
    },
    onDrop(e: ReactDragEvent) {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setDragActive(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void add(files, 'drop');
    },
  }), [add]);

  const processing = items.some((it) => it.status === 'processing');
  const totalBytes = items.reduce((s, it) => s + (it.status === 'ready' ? it.payloadBytes : 0), 0);

  return { items, processing, totalBytes, add, remove, clear, toHistoryMedia, onInputChange, onPaste, dropHandlers, dragActive };
}
