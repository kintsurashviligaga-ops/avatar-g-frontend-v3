import { filmFrameChainOn, chainEndFrame } from './frameChain';

describe('frameChain', () => {
  const F = ['https://x/1.png', 'https://x/2.png', 'https://x/3.png'];
  const env = process.env.FILM_FRAME_CHAIN;
  afterEach(() => {
    if (env === undefined) delete process.env.FILM_FRAME_CHAIN;
    else process.env.FILM_FRAME_CHAIN = env;
  });

  it('chains 8 s clips that all have a first frame', () => {
    expect(filmFrameChainOn(8, F)).toBe(true);
  });
  it('stays off for other clip lengths, a missing frame, or a single scene', () => {
    expect(filmFrameChainOn(6, F)).toBe(false);
    expect(filmFrameChainOn(8, [F[0], null, F[2]])).toBe(false);
    expect(filmFrameChainOn(8, [F[0]])).toBe(false);
  });
  it('FILM_FRAME_CHAIN=0 is the kill switch', () => {
    process.env.FILM_FRAME_CHAIN = '0';
    expect(filmFrameChainOn(8, F)).toBe(false);
  });
  it('each clip ends on the next scene\'s first frame; the last clip ends freely', () => {
    expect(F.map((_, i) => chainEndFrame(F, i))).toEqual([F[1], F[2], null]);
  });
  it('one anchor reused for every scene is not chained (the clip would loop to its own start)', () => {
    expect(chainEndFrame([F[0], F[0]], 0)).toBeNull();
  });
});
