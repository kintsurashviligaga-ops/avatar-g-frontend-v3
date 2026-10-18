import { mp3DurationSec } from './mp3Duration';

/** `n` MPEG-1 layer III frames at `kbps` / 44.1 kHz (no padding): a header and zeroed audio data. */
function frames(n: number, kbps: 128 | 64 = 128): Uint8Array {
  const idx = kbps === 128 ? 9 : 5;
  const len = Math.floor(144 * kbps * 1000 / 44_100);
  const out = new Uint8Array(n * len);
  for (let f = 0; f < n; f++) out.set([0xff, 0xfb, idx << 4, 0x00], f * len);
  return out;
}
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const FRAME_SEC = 1152 / 44_100;

describe('mp3DurationSec — the length an MP3 plays, from its frames', () => {
  it('constant bitrate: frames × 1152 samples', () => {
    expect(mp3DurationSec(frames(100))).toBeCloseTo(100 * FRAME_SEC, 6);
  });

  it('variable bitrate is counted frame by frame, not from the byte size', () => {
    expect(mp3DurationSec(concat(frames(50, 128), frames(50, 64)))).toBeCloseTo(100 * FRAME_SEC, 6);
  });

  it('skips an ID3v2 tag in front and stops at a trailing tag', () => {
    const id3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 20, ...new Array(20).fill(0)]);
    const tail = new Uint8Array(Buffer.from('TAG' + ' '.repeat(125)));
    expect(mp3DurationSec(concat(id3, frames(10), tail))).toBeCloseTo(10 * FRAME_SEC, 6);
  });

  it('not an MP3 → null', () => {
    expect(mp3DurationSec(new Uint8Array(Buffer.from('{"detail":"error"}')))).toBeNull();
    expect(mp3DurationSec(new Uint8Array(0))).toBeNull();
  });
});
