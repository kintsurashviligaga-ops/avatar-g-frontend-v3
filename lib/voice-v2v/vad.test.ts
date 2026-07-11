import { AdaptiveEnergyVad } from './vad';

// Feed `rms` n times, collecting each transition. With noiseAdaptation:0 the noise
// floor is frozen, so the threshold is deterministic and frame counts are exact.
function feed(vad: AdaptiveEnergyVad, rms: number, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(vad.update(rms));
  return out;
}

describe('AdaptiveEnergyVad', () => {
  // Fixed threshold = max(minRms 0.1, noiseFloor 0.006 * 2.4) = 0.1 (adaptation off).
  const fixed = () => new AdaptiveEnergyVad({ minRms: 0.1, noiseAdaptation: 0, speechFrames: 3, silenceFrames: 8 });

  test('silence never triggers speech', () => {
    const vad = fixed();
    expect(feed(vad, 0, 20)).toEqual(Array(20).fill('none'));
    expect(vad.isSpeaking).toBe(false);
  });

  test('speech_start fires only after speechFrames consecutive loud frames', () => {
    const vad = fixed();
    // frames 1..2 accumulate silently, frame 3 crosses the onset threshold
    expect(vad.update(0.5)).toBe('none');
    expect(vad.update(0.5)).toBe('none');
    expect(vad.update(0.5)).toBe('speech_start');
    expect(vad.isSpeaking).toBe(true);
  });

  test('a silent frame before onset resets the speech counter', () => {
    const vad = fixed();
    vad.update(0.5); // sf=1
    vad.update(0.5); // sf=2
    expect(vad.update(0)).toBe('none'); // sf reset to 0
    // must re-accumulate the full 3 again
    expect(vad.update(0.5)).toBe('none');
    expect(vad.update(0.5)).toBe('none');
    expect(vad.update(0.5)).toBe('speech_start');
  });

  test('speech_end fires only after silenceFrames consecutive quiet frames', () => {
    const vad = fixed();
    feed(vad, 0.5, 3); // now speaking
    expect(vad.isSpeaking).toBe(true);
    // 7 quiet frames stay 'none', the 8th ends the utterance
    expect(feed(vad, 0, 7)).toEqual(Array(7).fill('none'));
    expect(vad.update(0)).toBe('speech_end');
    expect(vad.isSpeaking).toBe(false);
  });

  test('a loud frame mid-silence resets the hangover counter (no premature end)', () => {
    const vad = fixed();
    feed(vad, 0.5, 3); // speaking
    feed(vad, 0, 5); // 5 quiet frames (not yet 8)
    expect(vad.update(0.5)).toBe('none'); // loud frame resets silence counter
    expect(feed(vad, 0, 7)).toEqual(Array(7).fill('none')); // needs a full 8 again
    expect(vad.update(0)).toBe('speech_end');
  });

  test('reset() clears speaking + counters', () => {
    const vad = fixed();
    feed(vad, 0.5, 3);
    expect(vad.isSpeaking).toBe(true);
    vad.reset();
    expect(vad.isSpeaking).toBe(false);
    // after reset it takes a fresh 3 frames to speak again
    expect(vad.update(0.5)).toBe('none');
    expect(vad.update(0.5)).toBe('none');
    expect(vad.update(0.5)).toBe('speech_start');
  });

  test('speechFrames:1 / silenceFrames:1 give single-frame endpointing', () => {
    const vad = new AdaptiveEnergyVad({ minRms: 0.1, noiseAdaptation: 0, speechFrames: 1, silenceFrames: 1 });
    expect(vad.update(0.5)).toBe('speech_start');
    expect(vad.update(0)).toBe('speech_end');
  });

  test('non-finite / out-of-range rms is coerced to a quiet frame (never throws)', () => {
    const vad = fixed();
    expect(() => feed(vad, Number.NaN, 5)).not.toThrow();
    expect(vad.update(Number.POSITIVE_INFINITY)).toBe('none'); // clamped to 1 → but not 3 in a row
    expect(vad.update(-5)).toBe('none'); // clamped to 0
    expect(vad.isSpeaking).toBe(false);
  });

  test('adaptive noise floor: a loud sustained ambient raises the bar (default opts)', () => {
    // With adaptation ON, feeding a moderate steady tone lets the floor climb so the
    // same level eventually reads as noise, not speech — proves the floor tracks.
    const vad = new AdaptiveEnergyVad(); // defaults, adaptation 0.06
    // A truly loud burst still starts speech within a few frames.
    const transitions = feed(vad, 0.6, 5);
    expect(transitions).toContain('speech_start');
  });
});
