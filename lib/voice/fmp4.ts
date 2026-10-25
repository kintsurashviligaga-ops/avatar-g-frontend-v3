/**
 * lib/voice/fmp4.ts — just enough of fragmented MP4 to play a Gemini 3.8 Live talking avatar with MediaSource.
 *
 * VERIFIED 2026-10-25 (Vertex us-central1, avatar Kira): the avatar arrives as `inlineData` parts of mimeType `video/mp4`,
 * base64. The first part is the init segment (`ftyp` brand `dash` + `moov`, ~1.2 KB, once per session); every later part
 * is one `moof`+`mdat` fragment, video and audio tracks in separate fragments. H.264 Constrained Baseline L3.1
 * (`avc1.42c01f`), 704×1280, 24 fps, and AAC-LC 24 kHz mono (`mp4a.40.2`) muxed in the same file. Idle frames keep
 * streaming between answers.
 *
 * Pure functions over bytes, no DOM: the player (lib/voice/fmp4Player) and its tests share them.
 */

/** What the probe measured; used when an init segment cannot be read. */
export const AVATAR_FALLBACK_MIME = 'video/mp4; codecs="avc1.42c01f, mp4a.40.2"';

export interface Mp4Box { type: string; offset: number; size: number }

/** base64 → bytes (atob in browsers, Buffer under node). Malformed input → empty. */
export function base64ToBytes(b64: string): Uint8Array {
  try {
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  } catch {
    return new Uint8Array(0);
  }
}

const u32 = (b: Uint8Array, i: number): number => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const fourcc = (b: Uint8Array, i: number): string => String.fromCharCode(b[i]!, b[i + 1]!, b[i + 2]!, b[i + 3]!);

/** The boxes directly inside [start, end): type, offset, size. Stops at the first box that does not fit. */
export function childBoxes(b: Uint8Array, start = 0, end = b.length): Mp4Box[] {
  const out: Mp4Box[] = [];
  let i = start;
  while (i + 8 <= end && out.length < 64) {
    const size = u32(b, i);
    if (size < 8 || i + size > end) break;
    out.push({ type: fourcc(b, i + 4), offset: i, size });
    i += size;
  }
  return out;
}

/** An init segment starts with `ftyp` (or carries `moov`); a media fragment starts with `moof`/`styp`. */
export function isInitSegment(b: Uint8Array): boolean {
  if (b.length < 8) return false;
  const first = fourcc(b, 4);
  if (first === 'ftyp' || first === 'moov') return true;
  return childBoxes(b).some((x) => x.type === 'moov');
}

/** First box of `type` anywhere below `boxes`, descending through the containers that lead to sample entries. */
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'mvex']);
function findBox(b: Uint8Array, type: string, start = 0, end = b.length, depth = 0): Mp4Box | null {
  if (depth > 8) return null;
  for (const box of childBoxes(b, start, end)) {
    if (box.type === type) return box;
    if (CONTAINERS.has(box.type)) {
      const hit = findBox(b, type, box.offset + 8, box.offset + box.size, depth + 1);
      if (hit) return hit;
    }
    if (box.type === 'stsd') {
      // stsd: fullbox (4) + entry count (4), then sample entries. avc1 has 78 bytes of fields before its child boxes,
      // mp4a 28.
      for (const entry of childBoxes(b, box.offset + 16, box.offset + box.size)) {
        if (entry.type === type) return entry;
        const skip = entry.type === 'avc1' || entry.type === 'avc3' ? 78 : entry.type === 'mp4a' ? 28 : -1;
        if (skip < 0) continue;
        const inner = childBoxes(b, entry.offset + 8 + skip, entry.offset + entry.size).find((x) => x.type === type);
        if (inner) return inner;
      }
    }
  }
  return null;
}

const hex2 = (n: number): string => n.toString(16).padStart(2, '0');

/** `avc1.PPCCLL` from the avcC box: profile, constraint flags, level. */
export function avcCodec(init: Uint8Array): string | null {
  const box = findBox(init, 'avcC');
  if (!box || box.size < 12) return null;
  const p = box.offset + 8; // configurationVersion, AVCProfileIndication, profile_compatibility, AVCLevelIndication
  if (init[p] !== 1) return null;
  return `avc1.${hex2(init[p + 1]!)}${hex2(init[p + 2]!)}${hex2(init[p + 3]!)}`;
}

/** Reads an MPEG-4 descriptor header at i: [tag, payload start, payload length] (length is 1–4 bytes of 7 bits). */
function descriptor(b: Uint8Array, i: number, end: number): [number, number, number] | null {
  if (i >= end) return null;
  const tag = b[i]!;
  let len = 0;
  let j = i + 1;
  for (let k = 0; k < 4 && j < end; k += 1, j += 1) {
    len = (len << 7) | (b[j]! & 0x7f);
    if ((b[j]! & 0x80) === 0) { j += 1; break; }
  }
  return j + len <= end ? [tag, j, len] : null;
}

/** `mp4a.40.<audioObjectType>` from the esds box (ES_Descriptor → DecoderConfigDescriptor → DecoderSpecificInfo). */
export function aacCodec(init: Uint8Array): string | null {
  const box = findBox(init, 'esds');
  if (!box) return null;
  const end = box.offset + box.size;
  const es = descriptor(init, box.offset + 12, end); // after the fullbox version/flags
  if (!es || es[0] !== 0x03) return null;
  let i = es[1] + 2; // ES_ID
  const flags = init[i]!;
  i += 1;
  if (flags & 0x80) i += 2; // dependsOn_ES_ID
  if (flags & 0x40) i += 1 + init[i]!; // URL
  if (flags & 0x20) i += 2; // OCR_ES_Id
  const dc = descriptor(init, i, end);
  if (!dc || dc[0] !== 0x04) return null;
  const oti = init[dc[1]]!;
  const dsi = descriptor(init, dc[1] + 13, dc[1] + dc[2]);
  if (!dsi || dsi[0] !== 0x05 || dsi[2] < 1) return `mp4a.${hex2(oti)}`;
  let aot = init[dsi[1]]! >> 3;
  if (aot === 31 && dsi[2] >= 2) aot = 32 + (((init[dsi[1]]! & 0x07) << 3) | (init[dsi[1] + 1]! >> 5));
  return `mp4a.${hex2(oti)}.${aot}`;
}

/** The MediaSource type for an init segment, e.g. `video/mp4; codecs="avc1.42c01f, mp4a.40.2"`. */
export function mseMimeFor(init: Uint8Array): string {
  const codecs = [avcCodec(init), aacCodec(init)].filter(Boolean);
  return codecs.length ? `video/mp4; codecs="${codecs.join(', ')}"` : AVATAR_FALLBACK_MIME;
}
