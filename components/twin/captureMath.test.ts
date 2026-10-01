/** @jest-environment node */
import {
  canStopRecording,
  centerCrop,
  fitWithin,
  formatClock,
  groupDigits,
  levelFromSamples,
  pickVoiceMime,
  shouldAutoStop,
} from './captureMath';

describe('photo geometry — the 3:4 frame, downscaled in the browser', () => {
  test('a landscape webcam frame is cropped to its centred 3:4 portrait', () => {
    expect(centerCrop(1280, 720)).toEqual({ sx: 370, sy: 0, sw: 540, sh: 720 });
  });

  test('a tall phone frame is cropped top and bottom', () => {
    expect(centerCrop(1080, 1920)).toEqual({ sx: 0, sy: 240, sw: 1080, sh: 1440 });
  });

  test('a 12 MP photo comes down to 1024 on its longest edge; a small one is never upscaled', () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 768, height: 1024 });
    expect(fitWithin(540, 720)).toEqual({ width: 540, height: 720 });
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe('the voice timer — a 12 s minimum, a 30 s auto-stop', () => {
  test('Stop unlocks at 12 s', () => {
    expect(canStopRecording(11_999)).toBe(false);
    expect(canStopRecording(12_000)).toBe(true);
  });

  test('recording stops itself at 30 s', () => {
    expect(shouldAutoStop(29_999)).toBe(false);
    expect(shouldAutoStop(30_000)).toBe(true);
  });

  test('m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(12_400)).toBe('0:12');
    expect(formatClock(30_000)).toBe('0:30');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('the level meter', () => {
  test('silence is 0, speech-like signal fills the bar, a clipped signal never exceeds 1', () => {
    expect(levelFromSamples(new Uint8Array(512).fill(128))).toBe(0);
    const speech = Uint8Array.from({ length: 512 }, (_, i) => 128 + Math.round(30 * Math.sin(i / 3)));
    expect(levelFromSamples(speech)).toBeGreaterThan(0.5);
    expect(levelFromSamples(Uint8Array.from({ length: 512 }, (_, i) => (i % 2 ? 255 : 0)))).toBe(1);
    expect(levelFromSamples([])).toBe(0);
  });
});

describe('digits and the recording type', () => {
  test('eight digits read as two groups', () => {
    expect(groupDigits('40917263')).toBe('4091 7263');
    expect(groupDigits('123456')).toBe('1234 56');
  });

  test('the first type the browser can record, in the order browsers prefer; none → null (voice is skipped)', () => {
    expect(pickVoiceMime((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickVoiceMime((t) => t === 'audio/mp4')).toBe('audio/mp4'); // Safari
    expect(pickVoiceMime(() => false)).toBeNull();
    expect(pickVoiceMime(() => { throw new Error('no'); })).toBeNull();
    expect(pickVoiceMime(undefined)).toBeNull();
  });
});
