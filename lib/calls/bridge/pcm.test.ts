/**
 * @jest-environment node
 *
 * The bridge's audio arithmetic: 48 kHz ↔ 16/24 kHz PCM with a real filter (voice kept, aliasing removed), chunk
 * boundaries invisible, PCM16 base64 exact.
 */
import { FRAME_48K, Resampler, dbfs, fromLiveOutput, pcm16FromBase64, pcm16ToBase64, rms, toLiveInput } from './pcm';

const sine = (hz: number, rate: number, ms: number, amp = 12000): Int16Array => {
  const n = Math.round((rate * ms) / 1000);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i += 1) out[i] = Math.round(amp * Math.sin((2 * Math.PI * hz * i) / rate));
  return out;
};
/** Skip the filter's start-up so only the steady state is measured. */
const steady = (x: Int16Array, skip = 200): Int16Array => x.slice(skip, x.length - skip);
const zeroCrossHz = (x: Int16Array, rate: number): number => {
  let c = 0;
  for (let i = 1; i < x.length; i += 1) if ((x[i - 1]! < 0) !== (x[i]! < 0)) c += 1;
  return (c / 2) * (rate / x.length);
};

describe('PCM16 base64', () => {
  it('round-trips little-endian samples exactly', () => {
    const x = Int16Array.from([0, 1, -1, 32767, -32768, 1234, -4321]);
    expect(Array.from(pcm16FromBase64(pcm16ToBase64(x)))).toEqual(Array.from(x));
    expect(Buffer.from(pcm16ToBase64(Int16Array.from([1])), 'base64')).toEqual(Buffer.from([1, 0]));
  });
  it('levels', () => {
    expect(rms(new Int16Array(10))).toBe(0);
    expect(dbfs(new Int16Array(10))).toBe(-Infinity);
    expect(dbfs(sine(1000, 16000, 100, 32767))).toBeCloseTo(-3, 0);
  });
});

describe('48 kHz → 16 kHz (caller → Gemini)', () => {
  it('keeps the voice band: 1 kHz and 3.4 kHz pass at the same level and pitch', () => {
    for (const hz of [1000, 3400]) {
      const x = sine(hz, 48000, 1000);
      const y = toLiveInput().process(x);
      expect(Math.abs(y.length - x.length / 3)).toBeLessThanOrEqual(1);
      expect(rms(steady(y)) / rms(steady(x))).toBeGreaterThan(0.97);
      expect(rms(steady(y)) / rms(steady(x))).toBeLessThan(1.03);
      expect(zeroCrossHz(steady(y), 16000)).toBeCloseTo(hz, -1);
    }
  });

  it('removes what 16 kHz cannot carry (11 kHz would fold back as a 5 kHz whistle)', () => {
    const y = toLiveInput().process(sine(11000, 48000, 1000));
    expect(rms(steady(y)) / 12000).toBeLessThan(0.01);
  });
});

describe('24 kHz → 48 kHz (Gemini → caller)', () => {
  it('doubles the rate at the same level and pitch', () => {
    const x = sine(1000, 24000, 1000);
    const y = fromLiveOutput().process(x);
    expect(y.length).toBe(x.length * 2);
    expect(rms(steady(y)) / rms(steady(x))).toBeGreaterThan(0.97);
    expect(rms(steady(y)) / rms(steady(x))).toBeLessThan(1.03);
    expect(zeroCrossHz(steady(y), 48000)).toBeCloseTo(1000, -1);
  });

  it('a 24 kHz chunk of 20 ms becomes exactly one 20 ms WhatsApp frame', () => {
    const r = fromLiveOutput();
    expect(r.process(new Int16Array(480)).length).toBe(FRAME_48K);
  });
});

describe('streaming', () => {
  it('chunk boundaries are invisible: any split gives the same samples as one call', () => {
    const x = sine(700, 48000, 300);
    const whole = toLiveInput().process(x);
    const r = toLiveInput();
    const parts: Int16Array[] = [];
    for (let i = 0, k = 1; i < x.length; k = (k * 7) % 997 + 1) { parts.push(r.process(x.slice(i, i + k))); i += k; }
    const joined = Int16Array.from(parts.flatMap((p) => Array.from(p)));
    expect(Array.from(joined)).toEqual(Array.from(whole));
  });

  it('clips instead of wrapping around at full scale', () => {
    const square = new Int16Array(4800).map((_, i) => (Math.floor(i / 120) % 2 ? 32767 : -32768));
    const y = fromLiveOutput().process(square);
    expect(Math.max(...y)).toBeLessThanOrEqual(32767);
    expect(Math.min(...y)).toBeGreaterThanOrEqual(-32768);
    // Mid-plateau samples keep their sign (a wrap-around would flip them). Plateau k spans output 240k…240k+239,
    // shifted by the filter delay (~24 samples at 48 kHz).
    expect(y[240 + 120 + 24]).toBeGreaterThan(20000);
    expect(y[480 + 120 + 24]).toBeLessThan(-20000);
  });

  it('refuses a nonsense ratio', () => {
    expect(() => new Resampler(0, 1)).toThrow();
    expect(() => new Resampler(1.5, 1)).toThrow();
  });
});
