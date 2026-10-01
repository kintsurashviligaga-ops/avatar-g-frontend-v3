/** @jest-environment node */
/**
 * lib/ai/replicate — generateMusic passes the music panel's sliders to MusicGen as REAL sampling parameters
 * (lib/ai/musicControls `musicgenParams`), and a caller that passes none renders exactly as before. The SDK is mocked:
 * nothing leaves the process.
 */
// The client is built at module load (before this file's own consts exist), so the mock reaches `mockRun` lazily.
const mockRun = jest.fn();
jest.mock('replicate', () => jest.fn().mockImplementation(() => ({ run: (...a: unknown[]) => mockRun(...a) })));

import { generateMusic } from './replicate';
import { musicgenParams } from './musicControls';

const run = mockRun;
const MUSICGEN = 'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb';
const inputOf = () => (run.mock.calls[0][1] as { input: Record<string, unknown> }).input;

beforeEach(() => {
  run.mockReset();
  run.mockResolvedValue('https://replicate.delivery/track.mp3');
});

test('no sampling → the input is byte-for-byte what every existing caller sent (model defaults apply)', async () => {
  await generateMusic('cinematic strings', 30);
  expect(run).toHaveBeenCalledWith(MUSICGEN, {
    input: { prompt: 'cinematic strings, high quality', duration: 30, model_version: 'large', output_format: 'mp3' },
  });
});

test('the sliders arrive as temperature and classifier_free_guidance', async () => {
  await generateMusic('lo-fi beat', 60, musicgenParams({ weirdness: 100, styleInfluence: 0 }));
  expect(inputOf()).toMatchObject({ temperature: 1.3, classifier_free_guidance: 1 });
});

test('untouched sliders send neither knob', async () => {
  await generateMusic('lo-fi beat', 60, musicgenParams({ weirdness: 50, styleInfluence: 50 }));
  expect(inputOf()).not.toHaveProperty('temperature');
  expect(inputOf()).not.toHaveProperty('classifier_free_guidance');
});

test('whatever a caller sends is clamped to a range MusicGen accepts; junk is dropped', async () => {
  await generateMusic('x', 30, { temperature: 99, classifierFreeGuidance: -4 });
  expect(inputOf()).toMatchObject({ temperature: 2, classifier_free_guidance: 0 });
  run.mockClear();
  await generateMusic('x', 30, { temperature: NaN, classifierFreeGuidance: '3' as unknown as number });
  expect(inputOf()).not.toHaveProperty('temperature');
  expect(inputOf()).not.toHaveProperty('classifier_free_guidance');
});

// ⚠️ The pinned version types classifier_free_guidance as `int`, and Replicate validates the input when it creates the
// prediction, so a fraction fails the MusicGen leg with a 422. The SDK mock above checks no schema; these pin the type.
test('classifier_free_guidance is a whole number at EVERY Style influence position, 0–100', async () => {
  let sent = 0;
  for (let s = 0; s <= 100; s++) {
    run.mockClear();
    await generateMusic('lo-fi beat', 30, musicgenParams({ weirdness: 50, styleInfluence: s }));
    const g = inputOf().classifier_free_guidance;
    if (g === undefined) continue;
    sent += 1;
    expect(Number.isInteger(g)).toBe(true);
  }
  expect(sent).toBeGreaterThan(0);
});

test('a fractional guidance from any caller is rounded before it is sent', async () => {
  await generateMusic('x', 30, { classifierFreeGuidance: 1.4 });
  expect(inputOf().classifier_free_guidance).toBe(1);
  run.mockClear();
  await generateMusic('x', 30, { classifierFreeGuidance: 2.6, temperature: 1.25 });
  expect(inputOf()).toMatchObject({ classifier_free_guidance: 3, temperature: 1.25 }); // temperature is a float: kept
});
