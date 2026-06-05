import { buildFilterComplex } from './ffmpeg-filtergraph';

describe('buildFilterComplex', () => {
  test('single clip → no xfade, routed through the cinematic master', () => {
    const g = buildFilterComplex({ nClips: 1, hasVoice: false, hasMusic: false, hasSfx: false, fps: 24, duckPct: 30 });
    expect(g.vmap).toBe('[vfinal]'); // fade-in/out bookends applied to every film
    expect(g.filter).not.toContain('xfade');
    expect(g.filter).toContain('scale=1920:1080'); // every clip normalised to 1080p
    expect(g.filter).toContain('fade=t=in'); // professional fade-up open
    expect(g.amap).toBeNull();
  });

  test('5 clips → 4 xfade transitions, cumulative offsets (1s crossfade)', () => {
    const g = buildFilterComplex({ nClips: 5, hasVoice: false, hasMusic: false, hasSfx: false, fps: 24, duckPct: 30 });
    expect((g.filter.match(/xfade=/g) || []).length).toBe(4);
    // offsets at 5, 10, 15, 20 (clip 6s, transition 1s)
    expect(g.filter).toContain('duration=1');
    expect(g.filter).toContain('offset=5.00');
    expect(g.filter).toContain('offset=20.00');
    expect(g.vmap).toBe('[vfinal]'); // xfade chain → cinematic fade bookends
    expect(g.filter).toContain('fade=t=out'); // fade-down close
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

  test('music only (no voice) → background feeds the timeline-scaled audio map', () => {
    const g = buildFilterComplex({ nClips: 2, hasVoice: false, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30 });
    // 2 video inputs (0,1), voice absent → music at index 2 feeds the pad+trim stage.
    expect(g.filter).toContain('[2:a]apad,atrim=0:');
    expect(g.amap).toBe('[aout]');
  });

  test('PHASE 52 — final audio is padded + trimmed to the master timeline', () => {
    // 5 clips · 6s − 4 transitions · 1s = 26s compiled master.
    const g = buildFilterComplex({ nClips: 5, hasVoice: true, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30 });
    expect(g.filter).toContain('apad,atrim=0:26.00,asetpts=N/SR/TB,');
    expect(g.filter).toContain('loudnorm=I=-14'); // EBU R128 broadcast loudness
    expect(g.amap).toBe('[aout]');
    // The ducked mix is computed FIRST (intermediate [apre]) then scaled.
    expect(g.filter).toContain('[apre]apad');
  });

  test('PHASE 52 — single clip music bed still scales to clip length', () => {
    const g = buildFilterComplex({ nClips: 1, hasVoice: false, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30 });
    expect(g.filter).toContain('atrim=0:6.00'); // 1 clip · 6s, no transitions
    expect(g.amap).toBe('[aout]');
  });

  test('no audio at all → amap stays null (no pad/trim stage emitted)', () => {
    const g = buildFilterComplex({ nClips: 3, hasVoice: false, hasMusic: false, hasSfx: false, fps: 24, duckPct: 30 });
    expect(g.amap).toBeNull();
    expect(g.filter).not.toContain('apad');
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
