import {
  resample, floatTo16BitPCM, int16ToFloat32, bytesToBase64, base64ToBytes,
  encodeMicChunk, decodePlaybackChunk,
} from './pcm';

describe('pcm — Gemini Live audio conversion', () => {
  it('resample is identity when rates match, and halves length 48k→24k', () => {
    const buf = Float32Array.from([0, 0.5, -0.5, 1]);
    expect(resample(buf, 16000, 16000)).toBe(buf);
    const down = resample(Float32Array.from([0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25]), 48000, 24000);
    expect(down.length).toBe(4);
  });

  it('resample is fail-safe on empty / bad rates', () => {
    expect(resample(new Float32Array(0), 48000).length).toBe(0);
    expect(resample(Float32Array.from([1]), 0).length).toBe(0);
  });

  it('floatTo16BitPCM clamps out-of-range and hits the int16 rails', () => {
    const pcm = floatTo16BitPCM(Float32Array.from([0, 1, -1, 2, -2]));
    expect(pcm[0]).toBe(0);
    expect(pcm[1]).toBe(32767);   // +1 → max
    expect(pcm[2]).toBe(-32768);  // -1 → min
    expect(pcm[3]).toBe(32767);   // clamped from 2
    expect(pcm[4]).toBe(-32768);  // clamped from -2
  });

  it('int16↔float round-trips within one quantisation step', () => {
    const original = Float32Array.from([0, 0.5, -0.5, 0.999]);
    const back = int16ToFloat32(floatTo16BitPCM(original));
    for (let i = 0; i < original.length; i++) {
      // asymmetric encode (×32767) vs decode (÷32768) → ~1 LSB error near full-scale; well under 1/16000.
      expect(Math.abs((back[i] ?? 0) - (original[i] ?? 0))).toBeLessThan(1 / 16000);
    }
  });

  it('bytesToBase64 ↔ base64ToBytes round-trip (incl. a >32k buffer, no stack overflow)', () => {
    const bytes = new Uint8Array(70000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const round = base64ToBytes(bytesToBase64(bytes));
    expect(round.length).toBe(bytes.length);
    expect(round[0]).toBe(0);
    expect(round[255]).toBe(255);
    expect(round[69999]).toBe(69999 % 256);
  });

  it('encodeMicChunk returns a non-empty base64 string for real audio, empty for none', () => {
    expect(encodeMicChunk(new Float32Array(0), 48000)).toBe('');
    const b64 = encodeMicChunk(Float32Array.from([0.1, -0.2, 0.3, -0.4, 0.5, -0.6]), 48000);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);
  });

  it('decodePlaybackChunk decodes a known 24k int16 frame and drops an odd trailing byte', () => {
    const pcm = Int16Array.from([0, 16384, -16384, 32767]);
    const b64 = bytesToBase64(new Uint8Array(pcm.buffer));
    const out = decodePlaybackChunk(b64);
    expect(out.length).toBe(4);
    expect(Math.abs((out[1] ?? 0) - 0.5)).toBeLessThan(0.001); // 16384/32768 = 0.5
    // odd trailing byte → dropped, still well-formed
    const odd = base64ToBytes(b64);
    const withOdd = new Uint8Array(odd.length + 1);
    withOdd.set(odd);
    expect(decodePlaybackChunk(bytesToBase64(withOdd)).length).toBe(4);
  });
});
