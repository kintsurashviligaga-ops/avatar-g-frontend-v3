import { buildFilterComplex } from './ffmpeg-filtergraph';

describe('buildFilterComplex', () => {
  test('single clip → straight video map, no xfade', () => {
    const g = buildFilterComplex({ nClips: 1, hasVoice: false, hasMusic: false, hasSfx: false, fps: 24, duckPct: 30 });
    expect(g.vmap).toBe('[v0]');
    expect(g.filter).not.toContain('xfade');
    expect(g.amap).toBeNull();
  });

  test('5 clips → 4 xfade transitions, cumulative offsets (1s crossfade)', () => {
    const g = buildFilterComplex({ nClips: 5, hasVoice: false, hasMusic: false, hasSfx: false, fps: 24, duckPct: 30 });
    expect((g.filter.match(/xfade=/g) || []).length).toBe(4);
    // offsets at 5, 10, 15, 20 (clip 6s, transition 1s)
    expect(g.filter).toContain('duration=1');
    expect(g.filter).toContain('offset=5.00');
    expect(g.filter).toContain('offset=20.00');
    expect(g.vmap).toBe('[vx4]');
  });

  test('every clip gets the color-match QA grade', () => {
    const g = buildFilterComplex({ nClips: 3, hasVoice: false, hasMusic: false, hasSfx: false, fps: 24, duckPct: 30 });
    expect((g.filter.match(/eq=contrast/g) || []).length).toBe(3);
  });

  test('voice + music → sidechain-ducked background under voice', () => {
    const g = buildFilterComplex({ nClips: 2, hasVoice: true, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30 });
    expect(g.filter).toContain('sidechaincompress');
    expect(g.filter).toContain('ratio=7'); // 30% → round(2 + 0.3*18) = 7
    expect(g.filter).toContain('asplit=2');
    expect(g.amap).toBe('[aout]');
  });

  test('voice + music + sfx → bed pre-mixed, sidechain-ducked under voice', () => {
    const g = buildFilterComplex({ nClips: 3, hasVoice: true, hasMusic: true, hasSfx: true, fps: 24, duckPct: 25 });
    expect(g.filter).toContain('sidechaincompress');
    // music+sfx mixed first, then ducked-bed + voice mixed → two amix=inputs=2
    expect((g.filter.match(/amix=inputs=2/g) || []).length).toBe(2);
    expect(g.amap).toBe('[aout]');
  });

  test('music only (no voice) → background is the audio map', () => {
    const g = buildFilterComplex({ nClips: 2, hasVoice: false, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30 });
    expect(g.amap).toBe('[2:a]'); // 2 video inputs (0,1), voice absent → music at index 2
  });

  test('duck 0% → minimal sidechain ratio (≈no ducking)', () => {
    const g = buildFilterComplex({ nClips: 2, hasVoice: true, hasMusic: true, hasSfx: false, fps: 24, duckPct: 0 });
    expect(g.filter).toContain('ratio=2'); // 0% → round(2 + 0) = 2
  });

  test('cpu path never emits minterpolate even at fps 60', () => {
    const g = buildFilterComplex({ nClips: 2, hasVoice: false, hasMusic: false, hasSfx: false, fps: 60, duckPct: 30 });
    expect(g.filter).not.toContain('minterpolate');
  });
});
