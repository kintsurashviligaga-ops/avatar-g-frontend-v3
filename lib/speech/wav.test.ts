/** @jest-environment node */
/**
 * lib/speech/wav — the WAV facts are read from the bytes, and the faults a blind wrapper makes are named (§5.2).
 */
import { inspectWav, looksLikeWav, wavSamples, wrapPcm16, WAV_HEADER_BYTES } from './wav';
import {
  MONO_16K,
  MONO_24K,
  MULTI_PART_24K,
  PCM_ODD_BYTES,
  STEREO_24K,
  WAV_DOUBLE_WRAPPED,
  WAV_MONO_24K,
  WAV_TRUNCATED,
  pcm16Tone,
} from '../../tests/fixtures/speechAudio';

/** The read-aloud route's own wrapper as it stands on main (app/api/tts/gemini/route.ts pcmToWav), byte for byte. */
function routePcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

describe('wrapPcm16', () => {
  test('mono 24 kHz: the same bytes the route writes today', () => {
    const ours = wrapPcm16(MONO_24K, { sampleRate: 24000, channels: 1 });
    expect(Buffer.from(ours).equals(routePcmToWav(Buffer.from(MONO_24K), 24000))).toBe(true);
    expect(ours.length).toBe(WAV_HEADER_BYTES + MONO_24K.length);
  });

  test('the samples are copied unchanged after the header (no resampling, no relabelling)', () => {
    const wav = wrapPcm16(MONO_16K, { sampleRate: 16000, channels: 1 });
    expect(Buffer.from(wav.subarray(WAV_HEADER_BYTES)).equals(Buffer.from(MONO_16K))).toBe(true);
  });

  test('refuses what it cannot describe: a half sample, a stereo half frame, a rate out of range, 3 channels', () => {
    expect(() => wrapPcm16(PCM_ODD_BYTES, { sampleRate: 24000, channels: 1 })).toThrow('partial frame');
    expect(() => wrapPcm16(new Uint8Array(6), { sampleRate: 24000, channels: 2 })).toThrow('partial frame');
    expect(() => wrapPcm16(MONO_24K, { sampleRate: 4000, channels: 1 })).toThrow('sampleRate');
    expect(() => wrapPcm16(MONO_24K, { sampleRate: 24000.5, channels: 1 })).toThrow('sampleRate');
    expect(() => wrapPcm16(MONO_24K, { sampleRate: 24000, channels: 3 })).toThrow('channels');
  });
});

describe('inspectWav', () => {
  test.each([
    ['1 s of 24 kHz mono', MONO_24K, 24000, 1, 24000, 1000],
    ['0.5 s of 16 kHz mono', MONO_16K, 16000, 1, 8000, 500],
    ['0.25 s of 24 kHz stereo', STEREO_24K, 24000, 2, 6000, 250],
  ])('%s: rate, channels, frames and duration come from the bytes', (_name, pcm, rate, channels, frames, ms) => {
    const r = inspectWav(wrapPcm16(pcm, { sampleRate: rate, channels }));
    expect(r).toEqual({
      ok: true,
      info: { sampleRate: rate, channels, bitsPerSample: 16, dataOffset: 44, dataBytes: pcm.length, frames, durationMs: ms },
    });
  });

  test('the same samples labelled at the wrong rate give a different duration: the rate is never guessed', () => {
    const asIf16k = inspectWav(wrapPcm16(MONO_24K, { sampleRate: 16000, channels: 1 }));
    expect(asIf16k.ok && asIf16k.info.durationMs).toBe(1500);
  });

  test('a WAV wrapped inside another WAV is named, not played as samples', () => {
    expect(inspectWav(WAV_DOUBLE_WRAPPED)).toEqual({ ok: false, fault: 'double_wrapped' });
  });

  test('a data chunk that claims more bytes than arrived is truncated', () => {
    expect(inspectWav(WAV_TRUNCATED)).toEqual({ ok: false, fault: 'truncated' });
  });

  test('header faults', () => {
    const wav = () => Uint8Array.from(WAV_MONO_24K);
    const set16 = (b: Uint8Array, at: number, v: number) => new DataView(b.buffer).setUint16(at, v, true);
    const set32 = (b: Uint8Array, at: number, v: number) => new DataView(b.buffer).setUint32(at, v, true);

    expect(inspectWav(new Uint8Array(8))).toEqual({ ok: false, fault: 'too_short' });
    expect(inspectWav(MONO_24K)).toEqual({ ok: false, fault: 'not_riff' });

    const notWave = wav(); notWave.set([0x41, 0x56, 0x49, 0x20], 8); // 'AVI '
    expect(inspectWav(notWave)).toEqual({ ok: false, fault: 'not_wave' });

    const float = wav(); set16(float, 20, 3); // IEEE float
    expect(inspectWav(float)).toEqual({ ok: false, fault: 'not_pcm' });

    const eightBit = wav(); set16(eightBit, 34, 8);
    expect(inspectWav(eightBit)).toEqual({ ok: false, fault: 'not_16_bit' });

    const sixChannels = wav(); set16(sixChannels, 22, 6);
    expect(inspectWav(sixChannels)).toEqual({ ok: false, fault: 'bad_channels' });

    const slowRate = wav(); set32(slowRate, 24, 4000);
    expect(inspectWav(slowRate)).toEqual({ ok: false, fault: 'bad_rate' });

    // A header that says 48 kHz while byteRate still says 24 kHz: one of them lies.
    const disagree = wav(); set32(disagree, 24, 48000);
    expect(inspectWav(disagree)).toEqual({ ok: false, fault: 'bad_block_align' });

    const noData = wav().subarray(0, 36);
    expect(inspectWav(noData)).toEqual({ ok: false, fault: 'no_data' });
  });

  test('a stereo data chunk that ends half-way through a frame is a partial frame', () => {
    const wav = wrapPcm16(new Uint8Array(8), { sampleRate: 24000, channels: 2 });
    const cut = Uint8Array.from(wav.subarray(0, wav.length - 2));
    new DataView(cut.buffer).setUint32(40, 6, true);
    new DataView(cut.buffer).setUint32(4, 36 + 6, true);
    expect(inspectWav(cut)).toEqual({ ok: false, fault: 'partial_frame' });
  });

  test('chunks before data (LIST, odd-sized with its pad byte) are skipped', () => {
    const pcm = MONO_16K;
    const list = new Uint8Array([0x4c, 0x49, 0x53, 0x54, 3, 0, 0, 0, 0x61, 0x62, 0x63, 0x00]); // 'LIST', size 3, 'abc', pad
    const base = wrapPcm16(pcm, { sampleRate: 16000, channels: 1 });
    const out = new Uint8Array(base.length + list.length);
    out.set(base.subarray(0, 36));
    out.set(list, 36);
    out.set(base.subarray(36), 36 + list.length);
    const r = inspectWav(out);
    expect(r.ok && r.info).toMatchObject({ sampleRate: 16000, frames: 8000, dataOffset: 44 + list.length });
  });
});

describe('wavSamples / looksLikeWav', () => {
  test('wavSamples hands back exactly the samples that were wrapped', () => {
    const r = wavSamples(WAV_MONO_24K);
    expect(r.pcm && Buffer.from(r.pcm).equals(Buffer.from(MONO_24K))).toBe(true);
    expect(wavSamples(WAV_DOUBLE_WRAPPED)).toEqual({ pcm: null, fault: 'double_wrapped' });
  });

  test('looksLikeWav tells a WAV from headerless PCM', () => {
    expect(looksLikeWav(WAV_MONO_24K)).toBe(true);
    expect(looksLikeWav(MONO_24K)).toBe(false);
    expect(looksLikeWav(new Uint8Array(4))).toBe(false);
  });
});

describe('fixtures', () => {
  test('are deterministic: the same spec gives the same bytes', () => {
    const a = pcm16Tone({ channels: 1, frames: 4800, period: 100 });
    const b = pcm16Tone({ channels: 1, frames: 4800, period: 100 });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  test('the multi-part fixture is 1.2 s in three parts that differ from each other', () => {
    const frames = MULTI_PART_24K.reduce((n, p) => n + p.length / 2, 0);
    expect(frames).toBe(28800);
    expect(Buffer.from(MULTI_PART_24K[0].subarray(0, 400)).equals(Buffer.from(MULTI_PART_24K[1].subarray(0, 400)))).toBe(false);
  });
});
