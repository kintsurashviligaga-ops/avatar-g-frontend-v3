import { buildFilterComplex } from './ffmpeg-filtergraph';

describe('buildFilterComplex', () => {
  test('single clip → straight video map, no xfade', () => {
    const g = buildFilterComplex({ nClips: 1, hasVoice: false, hasMusic: false, hasSfx: false, fps: 24, duckPct: 30 });
    expect(g.vmap).toBe('[v0]');
    expect(g.filter).not.toContain('xfade');
    expect(g.amap).toBeNull();
  });

  test('5 clips → 4 xfade transitions, cumulative offsets', () => {
    const g = buildFilterComplex({ nClips: 5, hasVoice: false, hasMusic: false, hasSfx: false, fps: 24, duckPct: 30 });
    expect((g.filter.match(/xfade=/g) || []).length).toBe(4);
    // offsets at 5.5, 11.0, 16.5, 22.0 (clip 6s, transition 0.5s)
    expect(g.filter).toContain('offset=5.50');
    expect(g.filter).toContain('offset=22.00');
    expect(g.vmap).toBe('[vx4]');
  });

  test('voice + music → background ducked then mixed under voice', () => {
    const g = buildFilterComplex({ nClips: 2, hasVoice: true, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30 });
    // music input index = 2 (after 2 video inputs), voice index = ... wait order: voice first
    // voice idx = 2, music idx = 3
    expect(g.filter).toContain('volume=0.70'); // 30% duck → 0.70 background
    expect(g.filter).toContain('amix=inputs=2');
    expect(g.amap).toBe('[aout]');
  });

  test('voice + music + sfx → background pre-mixed, ducked, then under voice', () => {
    const g = buildFilterComplex({ nClips: 3, hasVoice: true, hasMusic: true, hasSfx: true, fps: 24, duckPct: 25 });
    expect(g.filter).toContain('volume=0.75'); // 25% duck
    // background music+sfx mixed first (amix inputs=2), then mixed with voice (amix inputs=2)
    expect((g.filter.match(/amix=inputs=2/g) || []).length).toBe(2);
    expect(g.amap).toBe('[aout]');
  });

  test('music only (no voice) → background is the audio map', () => {
    const g = buildFilterComplex({ nClips: 2, hasVoice: false, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30 });
    expect(g.amap).toBe('[2:a]'); // 2 video inputs (0,1), voice absent → music at index 2
  });

  test('duck 0% → background at full volume', () => {
    const g = buildFilterComplex({ nClips: 2, hasVoice: true, hasMusic: true, hasSfx: false, fps: 24, duckPct: 0 });
    expect(g.filter).toContain('volume=1.00');
  });

  test('cpu path never emits minterpolate even at fps 60', () => {
    const g = buildFilterComplex({ nClips: 2, hasVoice: false, hasMusic: false, hasSfx: false, fps: 60, duckPct: 30 });
    expect(g.filter).not.toContain('minterpolate');
  });
});
