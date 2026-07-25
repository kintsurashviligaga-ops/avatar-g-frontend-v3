/**
 * ROUTING CONTRACT — a render dispatched from the Video Studio storyboard must ALWAYS reach the film
 * pipeline, never a generic single-clip render.
 *
 * LIVE-FOUND BUG this locks: the router only reached handleFilmComposite via the conservative
 * isThirtySecondFilm() keyword gate ("30-second film" / "short film" / "mini-movie"). A perfectly ordinary
 * brief — "Create a cinematic video of a calm ocean wave at sunset" — failed that gate, fell through to a
 * generic SINGLE-CLIP (LTX) render, and silently DISCARDED the 3 approved storyboard scenes the user had
 * just reviewed. Verified live on myavatar.ge: the dispatch reported engine 'ltx' with no film matrix.
 *
 * The structural signals below (sceneFrames / sceneScripts / sceneCount) are emitted ONLY by
 * driveFilmStudio's storyboard dispatch, so they are an unambiguous "this is a film render".
 */
import { hasFilmDispatchSignal } from './filmDispatchSignal';
import { isThirtySecondFilm } from './filmPipeline';

describe('hasFilmDispatchSignal — storyboard renders always route to the film pipeline', () => {
  it('routes when approved per-scene FRAMES are attached', () => {
    expect(hasFilmDispatchSignal({ sceneFrames: ['https://x/1.webp', 'https://x/2.webp'] })).toBe(true);
  });

  it('routes when approved per-scene SCRIPTS are attached', () => {
    expect(hasFilmDispatchSignal({ sceneScripts: ['wide establishing shot', 'close-up'] })).toBe(true);
  });

  it('routes when the user pinned a scene COUNT (the 8s grid: 8s→1 · 24s→3 · 48s→6)', () => {
    expect(hasFilmDispatchSignal({ sceneCount: 1 })).toBe(true);
    expect(hasFilmDispatchSignal({ sceneCount: 3 })).toBe(true);
    expect(hasFilmDispatchSignal({ sceneCount: 6 })).toBe(true);
  });

  it('does NOT route a plain chat message with no film metadata', () => {
    expect(hasFilmDispatchSignal(undefined)).toBe(false);
    expect(hasFilmDispatchSignal({})).toBe(false);
    expect(hasFilmDispatchSignal({ referenceImages: ['https://x/a.jpg'] })).toBe(false);
  });

  it('ignores empty / malformed signals (no accidental film routing)', () => {
    expect(hasFilmDispatchSignal({ sceneFrames: [] })).toBe(false);
    expect(hasFilmDispatchSignal({ sceneScripts: [] })).toBe(false);
    expect(hasFilmDispatchSignal({ sceneCount: 0 })).toBe(false);
    expect(hasFilmDispatchSignal({ sceneCount: Number.NaN })).toBe(false);
    expect(hasFilmDispatchSignal({ sceneCount: '3' })).toBe(false);
    expect(hasFilmDispatchSignal({ sceneFrames: 'not-an-array' })).toBe(false);
  });

  it('THE REGRESSION: a brief the keyword gate rejects still routes to film when the storyboard dispatched it', () => {
    const brief = 'Create a cinematic video of a calm ocean wave at sunset';
    // The keyword gate alone would NOT have routed this to the film pipeline …
    expect(isThirtySecondFilm(brief)).toBe(false);
    // … but the storyboard's structural signals must.
    expect(hasFilmDispatchSignal({ sceneCount: 3, sceneFrames: ['https://x/1.webp'] })).toBe(true);
  });
});
