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

/** The esds box (ES_Descriptor → DecoderConfigDescriptor → DecoderSpecificInfo): object type and AudioSpecificConfig. */
function esdsConfig(b: Uint8Array, box: Mp4Box): { oti: number; dsi: Uint8Array | null } | null {
  const end = box.offset + box.size;
  const es = descriptor(b, box.offset + 12, end); // after the fullbox version/flags
  if (!es || es[0] !== 0x03) return null;
  let i = es[1] + 2; // ES_ID
  const flags = b[i]!;
  i += 1;
  if (flags & 0x80) i += 2; // dependsOn_ES_ID
  if (flags & 0x40) i += 1 + b[i]!; // URL
  if (flags & 0x20) i += 2; // OCR_ES_Id
  const dc = descriptor(b, i, end);
  if (!dc || dc[0] !== 0x04) return null;
  const dsi = descriptor(b, dc[1] + 13, dc[1] + dc[2]);
  return { oti: b[dc[1]]!, dsi: dsi && dsi[0] === 0x05 && dsi[2] >= 1 ? b.subarray(dsi[1], dsi[1] + dsi[2]) : null };
}

/** audioObjectType of an AudioSpecificConfig (2 = AAC-LC). */
function aotOf(asc: Uint8Array): number {
  const aot = asc[0]! >> 3;
  return aot === 31 && asc.length >= 2 ? 32 + (((asc[0]! & 0x07) << 3) | (asc[1]! >> 5)) : aot;
}

/** `mp4a.40.<audioObjectType>` from the esds box. */
export function aacCodec(init: Uint8Array): string | null {
  const box = findBox(init, 'esds');
  const cfg = box ? esdsConfig(init, box) : null;
  if (!cfg) return null;
  return cfg.dsi ? `mp4a.${hex2(cfg.oti)}.${aotOf(cfg.dsi)}` : `mp4a.${hex2(cfg.oti)}`;
}

/** The MediaSource type for an init segment, e.g. `video/mp4; codecs="avc1.42c01f, mp4a.40.2"`. */
export function mseMimeFor(init: Uint8Array): string {
  const codecs = [avcCodec(init), aacCodec(init)].filter(Boolean);
  return codecs.length ? `video/mp4; codecs="${codecs.join(', ')}"` : AVATAR_FALLBACK_MIME;
}

// ── The audio track, for the avatar's voice through Web Audio (lib/voice/avatarAudio) ──
//
// VERIFIED 2026-10-25 on Vertex's own clip (Kira): track 1 video (timescale 90000), track 2 AAC-LC (timescale 24000, mono,
// AudioSpecificConfig 0x1308), no edit list, trex defaults all 0. Every fragment is ONE moof (a single traf: tfhd flags
// 0x2003a = default-base-is-moof + default duration/size/flags, tfdt v0, trun flags 0x1 = data_offset 108 only) and its
// mdat, holding ONE sample of ONE track: audio frames of 1024 samples (42.7 ms) at tfdt 0, 1024, 2048, …, raw AAC (no
// ADTS); video starts 85 ms after the audio.

/** The AAC track of an init segment: what WebCodecs' AudioDecoder needs, and the clock of the track's fragments. */
export interface AacTrack {
  trackId: number;
  /** Ticks per second of the track's fragment times (mdhd). */
  timescale: number;
  sampleRate: number;
  channels: number;
  /** `mp4a.40.<aot>`. */
  codec: string;
  /** The AudioSpecificConfig: AudioDecoder's `description`. */
  asc: Uint8Array;
}

const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
/** Samples read from one fragment at most (one per fragment is what Vertex sends). */
const MAX_SAMPLES = 512;

/** A fullbox field at `at` bytes past a v0 box start, or `at + 8` in a v1 box (64-bit times before it); 0 when cut off. */
function fullboxU32(b: Uint8Array, box: Mp4Box, at: number): number {
  const i = box.offset + (b[box.offset + 8] === 1 ? at + 8 : at);
  return i + 4 <= box.offset + box.size ? u32(b, i) : 0;
}

/** The first `soun` track whose sample entry is MPEG-4 audio (AAC) with a readable AudioSpecificConfig; null otherwise. */
export function aacTrack(init: Uint8Array): AacTrack | null {
  const moov = childBoxes(init).find((x) => x.type === 'moov');
  if (!moov) return null;
  for (const trak of childBoxes(init, moov.offset + 8, moov.offset + moov.size)) {
    if (trak.type !== 'trak') continue;
    const s = trak.offset + 8;
    const e = trak.offset + trak.size;
    const hdlr = findBox(init, 'hdlr', s, e);
    if (!hdlr || hdlr.size < 20 || fourcc(init, hdlr.offset + 16) !== 'soun') continue;
    const tkhd = findBox(init, 'tkhd', s, e);
    const mdhd = findBox(init, 'mdhd', s, e);
    const esds = findBox(init, 'esds', s, e);
    const cfg = esds ? esdsConfig(init, esds) : null;
    if (!tkhd || !mdhd || !cfg?.dsi || cfg.dsi.length < 2 || cfg.oti !== 0x40) return null;
    const trackId = fullboxU32(init, tkhd, 20); // version/flags, creation, modification, then track_ID
    const timescale = fullboxU32(init, mdhd, 20); // version/flags, creation, modification, then timescale
    const asc = cfg.dsi;
    const aot = aotOf(asc);
    if (aot >= 31) return null; // escaped object types shift every later field
    const sfi = ((asc[0]! & 0x07) << 1) | (asc[1]! >> 7);
    let sampleRate = AAC_RATES[sfi] ?? 0;
    let channels = (asc[1]! >> 3) & 0x0f;
    if (sfi === 15 && asc.length >= 5) { // an explicit 24-bit rate, then the channel configuration
      sampleRate = ((asc[1]! & 0x7f) << 17) | (asc[2]! << 9) | (asc[3]! << 1) | (asc[4]! >> 7);
      channels = (asc[4]! >> 3) & 0x0f;
    }
    if (!trackId || !timescale || !sampleRate || !channels) return null;
    return { trackId, timescale, sampleRate, channels, codec: `mp4a.40.${aot}`, asc: asc.slice() };
  }
  return null;
}

/** One sample of a media fragment: its track, decode time (track timescale), duration and bytes (a view, not a copy). */
export interface Fmp4Sample { trackId: number; time: number; duration: number; data: Uint8Array }

/**
 * The samples of a media fragment (moof + mdat). Offsets count from the moof (default-base-is-moof, which is also the
 * rule for the first traf without it); a traf with an absolute base_data_offset points into a file this never sees and
 * is skipped. Anything cut off ends the read.
 */
export function fragmentSamples(frag: Uint8Array): Fmp4Sample[] {
  const out: Fmp4Sample[] = [];
  for (const moof of childBoxes(frag)) {
    if (moof.type !== 'moof') continue;
    for (const traf of childBoxes(frag, moof.offset + 8, moof.offset + moof.size)) {
      if (traf.type !== 'traf') continue;
      const kids = childBoxes(frag, traf.offset + 8, traf.offset + traf.size);
      const tfhd = kids.find((k) => k.type === 'tfhd');
      if (!tfhd || tfhd.size < 16) continue;
      const tfhdEnd = tfhd.offset + tfhd.size;
      let i = tfhd.offset + 8;
      const flags = u32(frag, i) & 0xffffff;
      const trackId = u32(frag, i + 4);
      i += 8;
      if (flags & 0x1) continue;
      if (flags & 0x2) i += 4; // sample_description_index
      let defDuration = 0;
      let defSize = 0;
      if (flags & 0x8) { if (i + 4 > tfhdEnd) continue; defDuration = u32(frag, i); i += 4; }
      if (flags & 0x10) { if (i + 4 > tfhdEnd) continue; defSize = u32(frag, i); i += 4; }
      const tfdt = kids.find((k) => k.type === 'tfdt');
      let time = 0;
      if (tfdt && tfdt.size >= 16) {
        time = frag[tfdt.offset + 8] === 1 && tfdt.size >= 20
          ? u32(frag, tfdt.offset + 12) * 2 ** 32 + u32(frag, tfdt.offset + 16)
          : u32(frag, tfdt.offset + 12);
      }
      for (const trun of kids) {
        if (trun.type !== 'trun' || trun.size < 16) continue;
        const end = trun.offset + trun.size;
        let j = trun.offset + 8;
        const tf = u32(frag, j) & 0xffffff;
        const count = u32(frag, j + 4);
        j += 8;
        let pos = moof.offset;
        if (tf & 0x1) { if (j + 4 > end) break; pos = moof.offset + (u32(frag, j) | 0); j += 4; }
        if (tf & 0x4) j += 4; // first_sample_flags
        for (let n = 0; n < count && out.length < MAX_SAMPLES; n += 1) {
          let duration = defDuration;
          let size = defSize;
          if (tf & 0x100) { duration = j + 4 <= end ? u32(frag, j) : 0; j += 4; }
          if (tf & 0x200) { size = j + 4 <= end ? u32(frag, j) : 0; j += 4; }
          if (tf & 0x400) j += 4;
          if (tf & 0x800) j += 4;
          if (j > end || size <= 0 || pos < 0 || pos + size > frag.length) break;
          out.push({ trackId, time, duration, data: frag.subarray(pos, pos + size) });
          pos += size;
          time += duration;
        }
      }
    }
  }
  return out;
}
