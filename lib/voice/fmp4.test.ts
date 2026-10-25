import { AVATAR_FALLBACK_MIME, aacCodec, avcCodec, base64ToBytes, childBoxes, isInitSegment, mseMimeFor } from './fmp4';

const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const u32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
function box(type: string, ...parts: number[][]): number[] {
  const body = parts.flat();
  return [...u32(8 + body.length), ...ascii(type), ...body];
}
const zeros = (n: number): number[] => new Array(n).fill(0);

// AVCDecoderConfigurationRecord: version 1, profile 0x42 (Baseline), constraints 0xc0, level 0x1f (3.1).
const avcC = box('avcC', [1, 0x42, 0xc0, 0x1f, 0xff, 0xe1, 0, 4, 0x67, 0x42, 0xc0, 0x1f, 1, 0, 2, 0x68, 0xce]);
const avc1 = box('avc1', zeros(78), avcC);

/** esds with descriptor lengths in the short (1-byte) or the 4-byte form ffmpeg writes. */
function esds(longLengths: boolean): number[] {
  const len = (n: number): number[] => (longLengths ? [0x80, 0x80, 0x80, n] : [n]);
  const dsi = [0x05, ...len(2), 0x13, 0x08]; // AAC-LC (aot 2), 24 kHz, mono
  const dcBody = [0x40, 0x15, 0, 0, 0, ...u32(0), ...u32(0), ...dsi];
  const dc = [0x04, ...len(dcBody.length), ...dcBody];
  const esBody = [0, 1, 0, ...dc, 0x06, ...len(1), 0x02];
  return box('esds', [0, 0, 0, 0], [0x03, ...len(esBody.length), ...esBody]);
}
const mp4a = (long: boolean): number[] => box('mp4a', zeros(28), esds(long));

const stsd = (...entries: number[][]): number[] => box('stsd', [0, 0, 0, 0], u32(entries.length), ...entries);
const trak = (entry: number[]): number[] =>
  box('trak', box('tkhd', zeros(84)), box('mdia', box('mdhd', zeros(24)), box('minf', box('stbl', stsd(entry)))));

function init(long = false): Uint8Array {
  const ftyp = box('ftyp', ascii('dash'), u32(0), ascii('iso6'));
  const moov = box('moov', box('mvhd', zeros(100)), trak(avc1), trak(mp4a(long)), box('mvex', box('trex', zeros(24))));
  return new Uint8Array([...ftyp, ...moov]);
}
const fragment = new Uint8Array([...box('moof', box('mfhd', zeros(8))), ...box('mdat', [1, 2, 3, 4])]);

describe('fmp4', () => {
  it('decodes base64 and tolerates garbage', () => {
    expect(Array.from(base64ToBytes('AAEC'))).toEqual([0, 1, 2]);
    expect(base64ToBytes('%%%').length).toBe(0);
  });

  it('lists top-level boxes and stops at a truncated one', () => {
    const b = init();
    expect(childBoxes(b).map((x) => x.type)).toEqual(['ftyp', 'moov']);
    expect(childBoxes(b.subarray(0, b.length - 3)).map((x) => x.type)).toEqual(['ftyp']);
  });

  it('tells the init segment from a media fragment', () => {
    expect(isInitSegment(init())).toBe(true);
    expect(isInitSegment(fragment)).toBe(false);
    expect(isInitSegment(new Uint8Array(4))).toBe(false);
  });

  it('reads the codecs the probe measured from the init segment', () => {
    expect(avcCodec(init())).toBe('avc1.42c01f');
    expect(aacCodec(init())).toBe('mp4a.40.2');
    expect(aacCodec(init(true))).toBe('mp4a.40.2');
    expect(mseMimeFor(init())).toBe('video/mp4; codecs="avc1.42c01f, mp4a.40.2"');
  });

  it('falls back to the measured type when the init cannot be read', () => {
    expect(avcCodec(fragment)).toBeNull();
    expect(aacCodec(fragment)).toBeNull();
    expect(mseMimeFor(fragment)).toBe(AVATAR_FALLBACK_MIME);
    expect(mseMimeFor(new Uint8Array(0))).toBe(AVATAR_FALLBACK_MIME);
  });
});
