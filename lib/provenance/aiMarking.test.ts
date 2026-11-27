import sharp from 'sharp';
import {
  DIGITAL_SOURCE_TYPE, XMP_UUID, aiMarkingOn, crc32, markAiOutput, maybeMarkAiOutput, sniff, xmpPacket,
} from './aiMarking';

const GEN = { source: 'generated' as const };
const DST = DIGITAL_SOURCE_TYPE.generated;

const solid = () => sharp({ create: { width: 8, height: 6, channels: 4, background: { r: 10, g: 120, b: 200, alpha: 0.5 } } });

describe('xmpPacket', () => {
  it('names the IPTC digital source type, the AI system and the tool', () => {
    const x = xmpPacket(GEN);
    expect(x).toContain(`Iptc4xmpExt:DigitalSourceType="${DST}"`);
    expect(x).toContain('Iptc4xmpExt:AISystemUsed=');
    expect(x).toContain('xmp:CreatorTool="MyAvatar.ge"');
    expect(x).not.toContain('not a real recording');
  });
  it('an edit is a composite, and a likeness says it is not a real recording', () => {
    const x = xmpPacket({ source: 'edited', likeness: true });
    expect(x).toContain(DIGITAL_SOURCE_TYPE.edited);
    expect(x).toContain('not a real recording');
  });
});

describe('crc32', () => {
  it('matches the PNG reference value for IEND', () => {
    expect(crc32(Buffer.from('IEND', 'latin1'))).toBe(0xae426082);
  });
});

describe.each([
  ['png', () => solid().png().toBuffer()],
  ['jpeg', () => solid().flatten().jpeg().toBuffer()],
  ['jpeg with Exif', () => solid().flatten().jpeg().withMetadata({ orientation: 1 }).toBuffer()],
  ['webp lossy (simple VP8)', () => solid().flatten().webp({ quality: 80 }).toBuffer()],
  ['webp lossless (simple VP8L, alpha)', () => solid().webp({ lossless: true }).toBuffer()],
])('images: %s', (_name, make) => {
  it('gets an XMP packet a standard reader finds, and still decodes to the same pixels', async () => {
    const src = await make();
    const r = markAiOutput(src, 'image/x', GEN);
    expect(r.marked).not.toBeNull();
    const meta = await sharp(r.bytes).metadata();
    expect(meta.xmp?.toString('utf8')).toContain(DST);
    expect(meta.width).toBe(8);
    expect(meta.height).toBe(6);
    const [a, b] = await Promise.all([sharp(src).raw().toBuffer(), sharp(r.bytes).raw().toBuffer()]);
    expect(b.equals(a)).toBe(true);
  });
  it('is idempotent: a marked file is not marked twice', async () => {
    const once = markAiOutput(await make(), 'image/x', GEN).bytes;
    const twice = markAiOutput(once, 'image/x', GEN);
    expect(twice.marked).toBeNull();
    expect(twice.bytes.equals(once)).toBe(true);
  });
});

function box(type: string, body: Buffer): Buffer {
  const h = Buffer.alloc(8);
  h.writeUInt32BE(8 + body.length, 0);
  h.write(type, 4, 'latin1');
  return Buffer.concat([h, body]);
}

describe('mp4', () => {
  const mp4 = Buffer.concat([box('ftyp', Buffer.from('isom\0\0\x02\0isomiso2', 'latin1')), box('moov', Buffer.alloc(16)), box('mdat', Buffer.alloc(32, 7))]);
  it('appends one top-level XMP uuid box and moves nothing before it', () => {
    const r = markAiOutput(mp4, 'video/mp4', GEN);
    expect(r.marked).toBe('mp4');
    expect(r.bytes.subarray(0, mp4.length).equals(mp4)).toBe(true);
    const tail = r.bytes.subarray(mp4.length);
    expect(tail.readUInt32BE(0)).toBe(tail.length);
    expect(tail.toString('latin1', 4, 8)).toBe('uuid');
    expect(tail.subarray(8, 24).equals(XMP_UUID)).toBe(true);
    expect(tail.subarray(24).toString('utf8')).toContain(DST);
    expect(markAiOutput(r.bytes, 'video/mp4', GEN).marked).toBeNull();
  });
  it('leaves a file alone whose last box runs to the end (size 0), or whose sizes do not add up', () => {
    const open = Buffer.concat([box('ftyp', Buffer.from('isom\0\0\0\0', 'latin1')), Buffer.from([0, 0, 0, 0, 0x6d, 0x64, 0x61, 0x74, 1, 2])]);
    expect(markAiOutput(open, 'video/mp4', GEN).marked).toBeNull();
    const bad = Buffer.from(mp4);
    bad.writeUInt32BE(9999, 0);
    expect(markAiOutput(bad, 'video/mp4', GEN).marked).toBeNull();
  });
});

function wav(): Buffer {
  const data = Buffer.alloc(8);
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(8000, 4); fmt.writeUInt32LE(16000, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14);
  const chunk = (id: string, d: Buffer) => { const h = Buffer.alloc(8); h.write(id, 0, 'latin1'); h.writeUInt32LE(d.length, 4); return Buffer.concat([h, d]); };
  const body = Buffer.concat([Buffer.from('WAVE', 'latin1'), chunk('fmt ', fmt), chunk('data', data)]);
  const h = Buffer.alloc(8); h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(body.length, 4);
  return Buffer.concat([h, body]);
}

describe('wav', () => {
  it('appends a _PMX chunk and fixes the RIFF size', () => {
    const src = wav();
    const r = markAiOutput(src, 'audio/wav', GEN);
    expect(r.marked).toBe('wav');
    expect(r.bytes.readUInt32LE(4)).toBe(r.bytes.length - 8);
    expect(r.bytes.toString('latin1', src.length, src.length + 4)).toBe('_PMX');
    expect(r.bytes.length % 2).toBe(0);
    expect(markAiOutput(r.bytes, 'audio/wav', GEN).marked).toBeNull();
  });
});

describe('mp3', () => {
  const frame = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(60)]);
  const readSize = (b: Buffer) => ((b[6]! & 0x7f) << 21) | ((b[7]! & 0x7f) << 14) | ((b[8]! & 0x7f) << 7) | (b[9]! & 0x7f);
  it('a bare MP3 gets a new ID3v2.3 tag in front, the audio untouched behind it', () => {
    const r = markAiOutput(frame, 'audio/mpeg', GEN);
    expect(r.marked).toBe('mp3');
    expect(r.bytes.toString('latin1', 0, 3)).toBe('ID3');
    expect(r.bytes[3]).toBe(3);
    const size = readSize(r.bytes);
    expect(r.bytes.subarray(10 + size).equals(frame)).toBe(true);
    const tag = r.bytes.subarray(10, 10 + size).toString('latin1');
    expect(tag).toContain('TXXX');
    expect(tag).toContain('AI_GENERATED');
    expect(tag).toContain('PRIV');
    expect(markAiOutput(r.bytes, 'audio/mpeg', GEN).marked).toBeNull();
  });
  it('an existing plain ID3v2.4 tag gets the frames and a bigger size; a flagged tag is left alone', () => {
    const t = Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.from([4, 0, 0, 0, 0, 0, 0]), frame]);
    const r = markAiOutput(t, 'audio/mpeg', GEN);
    expect(r.marked).toBe('mp3');
    expect(r.bytes.subarray(10 + readSize(r.bytes)).equals(frame)).toBe(true);
    const flagged = Buffer.from(t); flagged[5] = 0x40;
    expect(markAiOutput(flagged, 'audio/mpeg', GEN).marked).toBeNull();
  });
  it('ADTS AAC is not mistaken for MP3', () => {
    expect(sniff(Buffer.from([0xff, 0xf1, 0x50, 0x80]))).toBeNull();
  });
});

describe('unsupported and the switch', () => {
  it('returns WebM, PDF and GLB unchanged', () => {
    for (const b of [Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1]), Buffer.from('%PDF-1.7'), Buffer.from('glTF\x02\0\0\0', 'latin1')]) {
      const r = markAiOutput(b, 'x', GEN);
      expect(r.marked).toBeNull();
      expect(r.bytes).toBe(b);
    }
  });
  it('is off unless AI_PROVENANCE_META is exactly 1, and off returns the same Buffer', async () => {
    const png = await solid().png().toBuffer();
    expect(aiMarkingOn({} as NodeJS.ProcessEnv)).toBe(false);
    expect(aiMarkingOn({ AI_PROVENANCE_META: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(maybeMarkAiOutput(png, 'image/png', GEN, {} as NodeJS.ProcessEnv)).toBe(png);
    expect(maybeMarkAiOutput(png, 'image/png', undefined, { AI_PROVENANCE_META: '1' } as unknown as NodeJS.ProcessEnv)).toBe(png);
    expect(maybeMarkAiOutput(png, 'image/png', GEN, { AI_PROVENANCE_META: '1' } as unknown as NodeJS.ProcessEnv).length).toBeGreaterThan(png.length);
  });
});
