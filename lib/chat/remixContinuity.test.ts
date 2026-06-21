import {
  assembleContinuityCut,
  summarizeContinuity,
  reusedOrdinals,
  type SceneClipRef,
} from './remixContinuity';

const clips = (n: number): SceneClipRef[] =>
  Array.from({ length: n }, (_, i) => ({ ordinal: i + 1, url: `https://cdn/clip-${i + 1}.mp4` }));

describe('assembleContinuityCut', () => {
  it('reuses every untouched scene verbatim and swaps in the re-rendered one', () => {
    const cut = assembleContinuityCut({
      sceneCount: 5,
      editedOrdinals: [2],
      originalClips: clips(5),
      rerendered: new Map([[2, 'https://cdn/clip-2-remixed.mp4']]),
    });

    expect(cut.total).toBe(5);
    expect(cut.reused).toBe(4);
    expect(cut.rerendered).toBe(1);
    expect(cut.pending).toBe(0);

    // Scene 2 takes the fresh clip; the rest carry over the originals.
    expect(cut.scenes.find((s) => s.ordinal === 2)).toMatchObject({ action: 'rerendered', url: 'https://cdn/clip-2-remixed.mp4' });
    expect(cut.scenes.find((s) => s.ordinal === 1)).toMatchObject({ action: 'reused', url: 'https://cdn/clip-1.mp4' });
    expect(cut.scenes.find((s) => s.ordinal === 5)).toMatchObject({ action: 'reused', url: 'https://cdn/clip-5.mp4' });
  });

  it('marks an edited scene as pending when its re-render was gated/failed', () => {
    const cut = assembleContinuityCut({
      sceneCount: 3,
      editedOrdinals: [3],
      originalClips: clips(3),
      rerendered: new Map(), // no key → no fresh clip
    });

    expect(cut.pending).toBe(1);
    expect(cut.rerendered).toBe(0);
    expect(cut.reused).toBe(2);
    expect(cut.scenes.find((s) => s.ordinal === 3)).toMatchObject({ action: 'rerender-pending' });
    expect(cut.scenes.find((s) => s.ordinal === 3)?.url).toBeUndefined();
  });

  it('still reports reuse when no original clips are supplied (preserved, not re-rendered)', () => {
    const cut = assembleContinuityCut({ sceneCount: 4, editedOrdinals: [1] });
    expect(cut.reused).toBe(3);
    expect(cut.pending).toBe(1); // edited scene 1 had no re-render
    expect(cut.scenes.filter((s) => s.action === 'reused').every((s) => s.url === undefined)).toBe(true);
  });

  it('handles multiple edited scenes and stamps the shared seed on every outcome', () => {
    const seeds = new Map([1, 2, 3, 4, 5].map((o) => [o, 42]));
    const cut = assembleContinuityCut({
      sceneCount: 5,
      editedOrdinals: [1, 4],
      originalClips: clips(5),
      rerendered: new Map([
        [1, 'https://cdn/clip-1-remixed.mp4'],
        [4, 'https://cdn/clip-4-remixed.mp4'],
      ]),
      seeds,
    });
    expect(cut.rerendered).toBe(2);
    expect(cut.reused).toBe(3);
    expect(cut.scenes.every((s) => s.seed === 42)).toBe(true);
    expect(reusedOrdinals(cut)).toEqual([2, 3, 5]);
  });

  it('summarizeContinuity reads truthfully and omits pending when zero', () => {
    const clean = assembleContinuityCut({ sceneCount: 5, editedOrdinals: [2], originalClips: clips(5), rerendered: new Map([[2, 'u']]) });
    expect(summarizeContinuity(clean)).toBe('Re-stitched 5 scenes — 1 re-rendered, 4 reused (continuity held)');

    const withPending = assembleContinuityCut({ sceneCount: 5, editedOrdinals: [2, 3], originalClips: clips(5), rerendered: new Map([[2, 'u']]) });
    expect(summarizeContinuity(withPending)).toContain('1 pending');
  });
});
