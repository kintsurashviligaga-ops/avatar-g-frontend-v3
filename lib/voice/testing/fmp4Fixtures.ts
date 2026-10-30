/**
 * lib/voice/testing/fmp4Fixtures.ts — byte builders for Vertex's talking-avatar stream, for tests only.
 *
 * The layout is the one measured on Vertex's own clip (Kira, 2026-10-25): track 1 H.264 (timescale 90000), track 2 AAC-LC
 * 24 kHz mono (AudioSpecificConfig 0x1308); every fragment is one moof (tfhd 0x2003a, tfdt v0, trun 0x1) and its mdat.
 */
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
export const u32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
export const zeros = (n: number): number[] => new Array(n).fill(0);

/** An ISO-BMFF box: size, fourcc, body. */
export function mp4Box(type: string, ...parts: number[][]): number[] {
  const body = parts.flat();
  return [...u32(8 + body.length), ...ascii(type), ...body];
}

/** esds whose DecoderSpecificInfo is `asc` (object type `oti`, 0x40 = MPEG-4 audio). */
export function esdsWith(asc: number[], oti = 0x40): number[] {
  const dcBody = [oti, 0x15, 0, 0, 0, ...u32(0), ...u32(0), 0x05, asc.length, ...asc];
  const esBody = [0, 2, 0, 0x04, dcBody.length, ...dcBody, 0x06, 1, 0x02];
  return mp4Box('esds', [0, 0, 0, 0], [0x03, esBody.length, ...esBody]);
}

/** The AAC sample entry Vertex sends: AAC-LC, 24 kHz, mono. */
export const VERTEX_MP4A = mp4Box('mp4a', zeros(28), esdsWith([0x13, 0x08]));
const AVC1 = mp4Box('avc1', zeros(78), mp4Box('avcC', [1, 0x42, 0xc0, 0x1f, 0xff, 0xe1, 0, 4, 0x67, 0x42, 0xc0, 0x1f, 1, 0, 2, 0x68, 0xce]));

function track(id: number, kind: string, timescale: number, entry: number[], v1: boolean): number[] {
  const tkhd = v1 ? mp4Box('tkhd', [1, 0, 0, 7], zeros(16), u32(id), zeros(68)) : mp4Box('tkhd', [0, 0, 0, 7], zeros(8), u32(id), zeros(72));
  const mdhd = v1 ? mp4Box('mdhd', [1, 0, 0, 0], zeros(16), u32(timescale), zeros(12)) : mp4Box('mdhd', [0, 0, 0, 0], zeros(8), u32(timescale), zeros(8));
  const hdlr = mp4Box('hdlr', [0, 0, 0, 0], u32(0), ascii(kind), zeros(12), [0]);
  const stsd = mp4Box('stsd', [0, 0, 0, 0], u32(1), entry);
  return mp4Box('trak', tkhd, mp4Box('mdia', mdhd, hdlr, mp4Box('minf', mp4Box('stbl', stsd))));
}

/** ftyp + moov: video track 1, sound track 2 with `audio` as its sample entry (v1 = 64-bit tkhd/mdhd). */
export function vertexInit(audio: number[] = VERTEX_MP4A, v1 = false): Uint8Array {
  const moov = mp4Box('moov', mp4Box('mvhd', zeros(100)), track(1, 'vide', 90000, AVC1, v1), track(2, 'soun', 24000, audio, v1), mp4Box('mvex', mp4Box('trex', zeros(24))));
  return new Uint8Array([...mp4Box('ftyp', ascii('iso6')), ...moov]);
}

/** One moof + mdat holding one sample of `trackId` at `time` (track ticks) lasting `duration`. */
export function vertexFragment(trackId: number, time: number, payload: number[], duration = 1024): Uint8Array {
  const tfhd = mp4Box('tfhd', [0, 0x02, 0x00, 0x3a], u32(trackId), u32(1), u32(duration), u32(payload.length), u32(0));
  const tfdt = mp4Box('tfdt', [0, 0, 0, 0], u32(time));
  const traf = (offset: number): number[] => mp4Box('traf', tfhd, tfdt, mp4Box('trun', [0, 0, 0, 0x01], u32(1), u32(offset)));
  const mfhd = mp4Box('mfhd', zeros(8));
  const moofSize = 8 + mfhd.length + traf(0).length;
  return new Uint8Array([...mp4Box('moof', mfhd, traf(moofSize + 8)), ...mp4Box('mdat', payload)]);
}

export const toBase64 = (b: Uint8Array): string => Buffer.from(b).toString('base64');
