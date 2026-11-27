/**
 * lib/provenance/aiMarking.ts — machine-readable "this was made by AI" marking for the files we store and hand out.
 * PURE (Buffer in, Buffer out), no network, no native binary, no re-encode.
 *
 * WHY. EU AI Act Article 50(2): the output of a system that generates synthetic audio, image or video is marked in a
 * machine-readable format and detectable as artificially generated or manipulated. Google's models already embed an
 * invisible SynthID watermark; this adds the second, open layer the Commission's Code of Practice on marking and
 * labelling expects: an XMP packet with the IPTC Digital Source Type (the vocabulary C2PA and the platforms read).
 *
 * WHAT IT WRITES. One XMP packet (Iptc4xmpExt:DigitalSourceType trainedAlgorithmicMedia or
 * compositeWithTrainedAlgorithmicMedia, Iptc4xmpExt:AISystemUsed, xmp:CreatorTool, dc:description) into the slot
 * each format reserves for XMP:
 *   PNG   an iTXt chunk "XML:com.adobe.xmp", right after IHDR
 *   JPEG  an APP1 "http://ns.adobe.com/xap/1.0/" segment, after JFIF/Exif
 *   WebP  an "XMP " chunk at the end, with the VP8X XMP flag (a VP8X header is added to a simple WebP)
 *   MP4 / MOV / M4A  a top-level `uuid` box with the XMP UUID, appended (no sample offset moves)
 *   MP3   ID3v2 TXXX frames + a PRIV "XMP" frame (a new ID3v2.3 tag when the file has none)
 *   WAV   a "_PMX" chunk, appended
 * Every other type (WebM, Ogg, FLAC, GLB, PDF…) is returned unchanged and reported as such.
 *
 * WHAT IT DOES NOT DO. It does not sign anything: a C2PA manifest needs a signing certificate from the C2PA trust list
 * and the c2pa library, which this project does not have yet (docs/compliance/AI_ACT_ARTICLE_50.md). It never touches
 * pixels or samples, so SynthID survives exactly as Google wrote it. A file that already carries XMP in that slot, or a
 * container this parser does not fully understand, is left alone: a mark is never worth a broken file.
 *
 * FLAG. Callers only mark when `aiMarkingOn()` (AI_PROVENANCE_META=1). Off = bytes unchanged everywhere.
 */

export type AiSource = 'generated' | 'edited';

export interface AiMark {
  /** generated = made by the model; edited = the user's own media changed by AI (a grade, a dub, a montage). */
  source: AiSource;
  /** The result shows a person (an avatar, a photo-referenced clip): adds the "not a real recording" sentence. */
  likeness?: boolean;
}

export type MarkFormat = 'png' | 'jpeg' | 'webp' | 'mp4' | 'mp3' | 'wav';

export interface MarkResult {
  bytes: Buffer;
  /** The format that was marked, or null when the bytes came back unchanged. */
  marked: MarkFormat | null;
  /** Why nothing was written (unsupported type, already has XMP, could not parse). */
  skipped?: string;
}

export const DIGITAL_SOURCE_TYPE: Record<AiSource, string> = {
  generated: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
  edited: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
};

export const AI_SYSTEM = 'Google Vertex AI (via MyAvatar.ge)';
export const CREATOR_TOOL = 'MyAvatar.ge';
/** The mark for an output we generated. Pass it as `{ aiMark: AI_GENERATED }` to uploadAndSign / uploadBufferAndSign. */
export const AI_GENERATED: AiMark = Object.freeze({ source: 'generated' as const });

/** The switch. Exactly "1" (the same vocabulary as BROWSER_ENABLED). */
export function aiMarkingOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AI_PROVENANCE_META === '1';
}

export function describeMark(mark: AiMark): string {
  const base = mark.source === 'edited'
    ? 'Edited with artificial intelligence (MyAvatar.ge, Google Vertex AI).'
    : 'AI-generated content (MyAvatar.ge, Google Vertex AI).';
  return mark.likeness ? `${base} Shows an AI-generated likeness; not a real recording.` : base;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The XMP packet (UTF-8). Exported for the tests and for a future C2PA assertion. */
export function xmpPacket(mark: AiMark): string {
  const desc = esc(describeMark(mark));
  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '  <rdf:Description rdf:about=""',
    '    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"',
    '    xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
    '    xmlns:dc="http://purl.org/dc/elements/1.1/"',
    `    Iptc4xmpExt:DigitalSourceType="${DIGITAL_SOURCE_TYPE[mark.source]}"`,
    `    Iptc4xmpExt:AISystemUsed="${esc(AI_SYSTEM)}"`,
    `    xmp:CreatorTool="${CREATOR_TOOL}">`,
    `   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${desc}</rdf:li></rdf:Alt></dc:description>`,
    '  </rdf:Description>',
    ' </rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  ].join('\n');
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const unchanged = (bytes: Buffer, skipped: string): MarkResult => ({ bytes, marked: null, skipped });

/** The format of the bytes themselves (never trust a name alone: a provider's JPEG behind ".png" exists). */
export function sniff(b: Buffer): MarkFormat | null {
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE') return 'wav';
  if (b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp') return 'mp4';
  if (b.length >= 3 && b.toString('latin1', 0, 3) === 'ID3') return 'mp3';
  // An MPEG audio frame sync with a layer set (ADTS AAC has layer 00 and is left alone).
  if (b.length >= 2 && b[0] === 0xff && (b[1]! & 0xe0) === 0xe0 && (b[1]! & 0x06) !== 0) return 'mp3';
  return null;
}

// ─── PNG ──────────────────────────────────────────────────────────────────────

function markPng(b: Buffer, xmp: string): MarkResult {
  let off = 8;
  let afterIhdr = -1;
  while (off + 12 <= b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('latin1', off + 4, off + 8);
    const end = off + 12 + len;
    if (end > b.length) return unchanged(b, 'png: truncated chunk');
    if (type === 'IHDR') afterIhdr = end;
    if (type === 'iTXt' && b.toString('latin1', off + 8, off + 8 + 17) === 'XML:com.adobe.xmp') return unchanged(b, 'png: already has XMP');
    if (type === 'IEND') break;
    off = end;
  }
  if (afterIhdr < 0) return unchanged(b, 'png: no IHDR');
  const data = Buffer.concat([Buffer.from('XML:com.adobe.xmp\0', 'latin1'), Buffer.from([0, 0]), Buffer.from('\0\0', 'latin1'), Buffer.from(xmp, 'utf8')]);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write('iTXt', 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return { bytes: Buffer.concat([b.subarray(0, afterIhdr), head, data, crc, b.subarray(afterIhdr)]), marked: 'png' };
}

// ─── JPEG ─────────────────────────────────────────────────────────────────────

const XMP_NS = 'http://ns.adobe.com/xap/1.0/\0';

function markJpeg(b: Buffer, xmp: string): MarkResult {
  let off = 2;
  let insertAt = 2;
  while (off + 4 <= b.length && b[off] === 0xff) {
    const marker = b[off + 1]!;
    if (marker < 0xe0 || marker > 0xef) break; // only the leading APPn run
    const len = b.readUInt16BE(off + 2);
    if (len < 2 || off + 2 + len > b.length) return unchanged(b, 'jpeg: bad segment');
    if (marker === 0xe1 && b.toString('latin1', off + 4, off + 4 + XMP_NS.length) === XMP_NS) return unchanged(b, 'jpeg: already has XMP');
    const isExif = marker === 0xe1 && b.toString('latin1', off + 4, off + 10) === 'Exif\0\0';
    off += 2 + len;
    if (marker === 0xe0 || isExif) insertAt = off; // XMP goes after JFIF and Exif
  }
  const payload = Buffer.concat([Buffer.from(XMP_NS, 'latin1'), Buffer.from(xmp, 'utf8')]);
  if (payload.length + 2 > 0xffff) return unchanged(b, 'jpeg: packet too large');
  const seg = Buffer.alloc(4);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  seg.writeUInt16BE(payload.length + 2, 2);
  return { bytes: Buffer.concat([b.subarray(0, insertAt), seg, payload, b.subarray(insertAt)]), marked: 'jpeg' };
}

// ─── RIFF (WebP, WAV) ─────────────────────────────────────────────────────────

interface RiffChunk { id: string; start: number; size: number; end: number }

function riffChunks(b: Buffer): RiffChunk[] | null {
  const out: RiffChunk[] = [];
  let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString('latin1', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    const end = off + 8 + size + (size & 1);
    if (off + 8 + size > b.length) return null;
    out.push({ id, start: off, size, end: Math.min(end, b.length) });
    off = end;
  }
  return off >= b.length ? out : null;
}

function riffChunk(id: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.write(id, 0, 'latin1');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length & 1 ? Buffer.from([0]) : Buffer.alloc(0)]);
}

function withRiffSize(b: Buffer): Buffer {
  b.writeUInt32LE(b.length - 8, 4);
  return b;
}

const WEBP_XMP_FLAG = 0x04;
const WEBP_ALPHA_FLAG = 0x10;

function markWebp(b: Buffer, xmp: string): MarkResult {
  const chunks = riffChunks(b);
  if (!chunks || chunks.length === 0) return unchanged(b, 'webp: could not parse');
  if (chunks.some((c) => c.id === 'XMP ')) return unchanged(b, 'webp: already has XMP');
  const xmpChunk = riffChunk('XMP ', Buffer.from(xmp, 'utf8'));
  const first = chunks[0]!;
  if (first.id === 'VP8X') {
    const out = Buffer.concat([b, xmpChunk]);
    out[first.start + 8] = out[first.start + 8]! | WEBP_XMP_FLAG;
    return { bytes: withRiffSize(out), marked: 'webp' };
  }
  // A simple WebP (one VP8 or VP8L chunk): add the VP8X header with the canvas size, then the XMP chunk at the end.
  let w = 0;
  let h = 0;
  let alpha = false;
  const d = first.start + 8;
  if (first.id === 'VP8 ' && first.size >= 10 && b[d + 3] === 0x9d && b[d + 4] === 0x01 && b[d + 5] === 0x2a) {
    w = b.readUInt16LE(d + 6) & 0x3fff;
    h = b.readUInt16LE(d + 8) & 0x3fff;
  } else if (first.id === 'VP8L' && first.size >= 5 && b[d] === 0x2f) {
    const bits = b.readUInt32LE(d + 1);
    w = (bits & 0x3fff) + 1;
    h = ((bits >>> 14) & 0x3fff) + 1;
    alpha = ((bits >>> 28) & 1) === 1;
  } else {
    return unchanged(b, 'webp: unknown first chunk');
  }
  if (w < 1 || h < 1) return unchanged(b, 'webp: no canvas size');
  const vp8x = Buffer.alloc(10);
  vp8x[0] = WEBP_XMP_FLAG | (alpha ? WEBP_ALPHA_FLAG : 0);
  vp8x.writeUIntLE(w - 1, 4, 3);
  vp8x.writeUIntLE(h - 1, 7, 3);
  const out = Buffer.concat([b.subarray(0, 12), riffChunk('VP8X', vp8x), b.subarray(12), xmpChunk]);
  return { bytes: withRiffSize(out), marked: 'webp' };
}

function markWav(b: Buffer, xmp: string): MarkResult {
  const chunks = riffChunks(b);
  if (!chunks) return unchanged(b, 'wav: could not parse');
  if (chunks.some((c) => c.id === '_PMX')) return unchanged(b, 'wav: already has XMP');
  return { bytes: withRiffSize(Buffer.concat([b, riffChunk('_PMX', Buffer.from(xmp, 'utf8'))])), marked: 'wav' };
}

// ─── ISO BMFF (MP4, MOV, M4A) ─────────────────────────────────────────────────

export const XMP_UUID = Buffer.from('be7acfcb97a942e89c71999491e3afac', 'hex');

function markMp4(b: Buffer, xmp: string): MarkResult {
  let off = 0;
  while (off < b.length) {
    if (off + 8 > b.length) return unchanged(b, 'mp4: truncated box');
    let size = b.readUInt32BE(off);
    const type = b.toString('latin1', off + 4, off + 8);
    let header = 8;
    if (size === 1) {
      if (off + 16 > b.length) return unchanged(b, 'mp4: truncated largesize');
      const big = b.readBigUInt64BE(off + 8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) return unchanged(b, 'mp4: box too large');
      size = Number(big);
      header = 16;
    } else if (size === 0) {
      return unchanged(b, 'mp4: last box runs to end of file'); // appending would land inside it
    }
    if (size < header || off + size > b.length) return unchanged(b, 'mp4: bad box size');
    if (type === 'uuid' && b.subarray(off + header, off + header + 16).equals(XMP_UUID)) return unchanged(b, 'mp4: already has XMP');
    off += size;
  }
  const body = Buffer.from(xmp, 'utf8');
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + 16 + body.length, 0);
  head.write('uuid', 4, 'latin1');
  return { bytes: Buffer.concat([b, head, XMP_UUID, body]), marked: 'mp4' };
}

// ─── MP3 (ID3v2) ──────────────────────────────────────────────────────────────

const syncsafe = (n: number): Buffer => Buffer.from([(n >>> 21) & 0x7f, (n >>> 14) & 0x7f, (n >>> 7) & 0x7f, n & 0x7f]);
const unsyncsafe = (b: Buffer, at: number): number => ((b[at]! & 0x7f) << 21) | ((b[at + 1]! & 0x7f) << 14) | ((b[at + 2]! & 0x7f) << 7) | (b[at + 3]! & 0x7f);

function id3Frame(id: string, data: Buffer, version: 3 | 4): Buffer {
  const head = Buffer.alloc(10);
  head.write(id, 0, 'latin1');
  if (version === 4) syncsafe(data.length).copy(head, 4);
  else head.writeUInt32BE(data.length, 4);
  return Buffer.concat([head, data]);
}

/** TXXX with ISO-8859-1 text (encoding 0): our strings are ASCII, valid in v2.3 and v2.4 alike. */
const txxx = (desc: string, value: string, v: 3 | 4) => id3Frame('TXXX', Buffer.concat([Buffer.from([0]), Buffer.from(`${desc}\0${value}`, 'latin1')]), v);

const MP3_MARK_KEY = 'AI_GENERATED';

function markMp3(b: Buffer, xmp: string, mark: AiMark): MarkResult {
  const frames = (v: 3 | 4) => Buffer.concat([
    txxx(MP3_MARK_KEY, describeMark(mark), v),
    txxx('DigitalSourceType', DIGITAL_SOURCE_TYPE[mark.source], v),
    id3Frame('PRIV', Buffer.concat([Buffer.from('XMP\0', 'latin1'), Buffer.from(xmp, 'utf8')]), v),
  ]);
  if (b.toString('latin1', 0, 3) !== 'ID3') {
    const f = frames(3);
    const head = Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.from([3, 0, 0]), syncsafe(f.length)]);
    return { bytes: Buffer.concat([head, f, b]), marked: 'mp3' };
  }
  if (b.length < 10) return unchanged(b, 'mp3: truncated ID3 header');
  const version = b[3]!;
  const flags = b[5]!;
  if (version !== 3 && version !== 4) return unchanged(b, `mp3: ID3v2.${version} not handled`);
  if (flags !== 0) return unchanged(b, 'mp3: ID3 flags set (unsync/extended header/footer)');
  const size = unsyncsafe(b, 6);
  if (10 + size > b.length) return unchanged(b, 'mp3: bad ID3 size');
  if (b.subarray(10, 10 + size).includes(Buffer.from(`${MP3_MARK_KEY}\0`, 'latin1'))) return unchanged(b, 'mp3: already marked');
  const f = frames(version as 3 | 4);
  const head = Buffer.from(b.subarray(0, 10));
  syncsafe(size + f.length).copy(head, 6);
  return { bytes: Buffer.concat([head, f, b.subarray(10)]), marked: 'mp3' };
}

// ─── entry ────────────────────────────────────────────────────────────────────

/**
 * Mark `bytes` as AI output. Never throws: anything unexpected returns the bytes unchanged with the reason. The format
 * comes from the bytes (`contentType` only breaks a tie and is kept for the log).
 */
export function markAiOutput(bytes: Buffer, contentType: string, mark: AiMark): MarkResult {
  try {
    const fmt = sniff(bytes);
    if (!fmt) return unchanged(bytes, `unsupported type ${contentType || 'unknown'}`);
    const xmp = xmpPacket(mark);
    switch (fmt) {
      case 'png': return markPng(bytes, xmp);
      case 'jpeg': return markJpeg(bytes, xmp);
      case 'webp': return markWebp(bytes, xmp);
      case 'wav': return markWav(bytes, xmp);
      case 'mp4': return markMp4(bytes, xmp);
      case 'mp3': return markMp3(bytes, xmp, mark);
    }
  } catch (e) {
    return unchanged(bytes, `error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The one call the storage adapter makes: flag off, or no mark asked for, = the same Buffer back. */
export function maybeMarkAiOutput(bytes: Buffer, contentType: string, mark: AiMark | undefined, env: NodeJS.ProcessEnv = process.env): Buffer {
  if (!mark || !aiMarkingOn(env)) return bytes;
  const r = markAiOutput(bytes, contentType, mark);
  if (!r.marked && r.skipped && !/^unsupported type/.test(r.skipped)) {
    // eslint-disable-next-line no-console
    console.warn('[ai-provenance] not marked:', r.skipped);
  }
  return r.bytes;
}
