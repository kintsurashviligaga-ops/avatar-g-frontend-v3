import { clipLastFrameFits, clipLastFrameServerOn, clipLastFrameUiOn, parseClipLastFrame } from './clipLastFrame';
import { composeClipPrompt } from './clipPrompt';

const KEYS = ['NEXT_PUBLIC_CLIP_LAST_FRAME', 'CLIP_LAST_FRAME'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

test('both flags are off unless set', () => {
  for (const k of KEYS) delete process.env[k];
  expect([clipLastFrameUiOn(), clipLastFrameServerOn()]).toEqual([false, false]);
  for (const k of KEYS) process.env[k] = 'true';
  expect([clipLastFrameUiOn(), clipLastFrameServerOn()]).toEqual([true, true]);
});

test('first → last needs exactly two photos', () => {
  expect([0, 1, 2, 3].map(clipLastFrameFits)).toEqual([false, false, true, false]);
  expect(parseClipLastFrame({}, 2)).toEqual({ ok: true, value: false });
  expect(parseClipLastFrame({ lastFrame: false }, 1)).toEqual({ ok: true, value: false });
  expect(parseClipLastFrame({ lastFrame: true }, 2)).toEqual({ ok: true, value: true });
  expect(parseClipLastFrame({ lastFrame: true }, 3)).toEqual({ ok: false, field: 'lastFrame', code: 'needs_two_photos' });
  expect(parseClipLastFrame({ lastFrame: 1 }, 2)).toEqual({ ok: false, field: 'lastFrame', code: 'invalid' });
  expect(parseClipLastFrame(null, 2)).toEqual({ ok: true, value: false });
});

test('the prompt says start on the first frame and end on the last, and never "keep the setting throughout"', () => {
  const p = composeClipPrompt({ reading: { english: 'A fox runs.', lines: [], speakers: [], speaker: null, silent: true }, photos: 'frames' });
  expect(p).toContain('end exactly on the last frame');
  expect(p).not.toMatch(/throughout|reference images/);
});
