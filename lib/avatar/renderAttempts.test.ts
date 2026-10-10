/** @jest-environment node */
/**
 * The avatar composer must never start a second PAID render while the first is still rendering.
 *
 * Both avatar routes reserve the price at POST, so a fallback fired on a poll TIMEOUT reserved a second price for one
 * video — and a user who could afford exactly one got a 402 on the fallback while the first, unpolled job finished
 * unseen. Only a terminal verdict (refunded server-side) may move on to the next engine.
 */
import { nextAvatarAttempt } from './renderAttempts';

const base = { settled: true, url: null, error: null, usedHeygen: false };

describe('nextAvatarAttempt', () => {
  it('delivers a landed video', () => {
    expect(nextAvatarAttempt({ ...base, url: 'https://x/out.mp4' })).toBe('deliver');
  });

  it.each([
    ['HeyGen', true],
    ['SadTalker', false],
  ])('%s still rendering when the polls run out → stop (no second reservation)', (_l, usedHeygen) => {
    expect(nextAvatarAttempt({ ...base, settled: false, usedHeygen })).toBe('stop');
  });

  it('a terminal HeyGen failure stops: no silent SadTalker (Replicate) render of the same video', () => {
    expect(nextAvatarAttempt({ ...base, usedHeygen: true, error: 'render failed' })).toBe('stop');
    expect(nextAvatarAttempt({ ...base, usedHeygen: true, error: "module 'PIL.Image' has no attribute 'ANTIALIAS'" })).toBe('stop');
  });

  it("SadTalker's known transient crash → retry; anything else → stop", () => {
    expect(nextAvatarAttempt({ ...base, error: "module 'PIL.Image' has no attribute 'ANTIALIAS'" })).toBe('retry');
    expect(nextAvatarAttempt({ ...base, error: 'no face detected' })).toBe('stop');
  });

  it('a terminal SadTalker verdict with no reason keeps the old retry', () => {
    expect(nextAvatarAttempt(base)).toBe('retry');
  });
});
