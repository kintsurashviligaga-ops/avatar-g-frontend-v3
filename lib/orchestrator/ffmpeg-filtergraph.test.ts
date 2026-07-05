import { buildFilterComplex, duckRatio } from './ffmpeg-filtergraph';

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

  test('hard-cut transition concatenates with NO xfade → exactly N·clipSec, no pad-freeze', () => {
    // 5 clips · 6s with hard cuts = exactly 30s: no xfade (N−1)s shortfall, so the
    // pad-to-30 clone-freeze never fires. This is the honest "exactly 30 seconds".
    const g = buildFilterComplex({ nClips: 5, hasVoice: false, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30, transition: 'cut' });
    expect(g.filter).toContain('concat=n=5:v=1:a=0'); // hard-cut concat chain
    expect(g.filter).not.toContain('xfade');          // no crossfade overlap
    expect(g.filter).not.toContain('tpad');           // already 30s → no clone-pad
    expect(g.filter).toContain('atrim=0:30.00');      // audio bed scaled to the exact 30s
    expect(g.vmap).toBe('[vfinal]');
  });

  test('every clip gets the color-match QA grade + one master cinematic grade', () => {
    const g = buildFilterComplex({ nClips: 3, hasVoice: false, hasMusic: false, hasSfx: false, fps: 24, duckPct: 30 });
    expect((g.filter.match(/eq=contrast=1\.06/g) || []).length).toBe(3); // per-clip colour-match
    expect(g.filter).toContain('colorbalance='); // single master teal-orange grade
    expect(g.filter).toContain('vignette='); // master vignette
  });

  test('lut3dPath → a lut3d=file pass is injected into the master grade (after eq, before vignette)', () => {
    const g = buildFilterComplex({ nClips: 3, hasVoice: false, hasMusic: false, hasSfx: false, fps: 24, duckPct: 30, lut3dPath: '/tmp/asm_x/myavatar-night-neon-purple-gold.cube' });
    expect(g.filter).toContain("lut3d=file='/tmp/asm_x/myavatar-night-neon-purple-gold.cube'");
    // ordering: base eq grade → lut3d → vignette
    const order = g.filter.indexOf('eq=contrast=1.04') < g.filter.indexOf('lut3d=')
      && g.filter.indexOf('lut3d=') < g.filter.indexOf('vignette=');
    expect(order).toBe(true);
  });

  test('no lut3dPath → no lut3d pass (base colorbalance grade only)', () => {
    const g = buildFilterComplex({ nClips: 3, hasVoice: false, hasMusic: false, hasSfx: false, fps: 24, duckPct: 30 });
    expect(g.filter).not.toContain('lut3d');
  });

  test('lut3d path with colons (Windows-ish) is escaped for the filtergraph', () => {
    const g = buildFilterComplex({ nClips: 2, hasVoice: false, hasMusic: false, hasSfx: false, fps: 24, duckPct: 30, lut3dPath: 'C:/tmp/grade.cube' });
    expect(g.filter).toContain("lut3d=file='C\\:/tmp/grade.cube'"); // ':' escaped
  });

  test('brand overlay composites at the LAST input index (after video + audio)', () => {
    // 5 clips (0-4) + voice (5) + music (6) → brand PNG is the next input = index 7.
    const g = buildFilterComplex({ nClips: 5, hasVoice: true, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30, hasBrandOverlay: true });
    // The brand PNG (input 7) is alpha-faded and time-gated (subtle), not a full-length full-opacity cover.
    expect(g.filter).toContain('[7:v]format=rgba,fade=t=in');
    expect(g.filter).toContain("[vbrandpng]overlay=0:0:format=auto:enable='between(");
    expect(g.vmap).toBe('[vbrand]'); // final map is the brand-composited video
  });

  test('brand overlay index tracks the present audio inputs (no voice → lower index)', () => {
    // 3 clips (0-2) + music only (3) → brand PNG = index 4 (voice/sfx absent).
    const g = buildFilterComplex({ nClips: 3, hasVoice: false, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30, hasBrandOverlay: true });
    expect(g.filter).toContain('[4:v]format=rgba,fade=t=in');
    expect(g.filter).toContain("[vbrandpng]overlay=0:0:format=auto:enable='between(");
    expect(g.vmap).toBe('[vbrand]');
  });

  test('no brand overlay → no overlay filter, vmap stays the graded video', () => {
    const g = buildFilterComplex({ nClips: 3, hasVoice: false, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30 });
    expect(g.filter).not.toContain('overlay=0:0');
    expect(g.vmap).toBe('[vfinal]');
  });

  test('voice + music → narration-forward: lifted voice, lowered + hard-ducked bed', () => {
    const g = buildFilterComplex({ nClips: 2, hasVoice: true, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30 });
    expect(g.filter).toContain('sidechaincompress');
    expect(g.filter).toContain('ratio=12'); // 30% → round(8 + 0.3*12) = 12 (strong duck)
    expect(g.filter).toContain('asplit=2');
    expect(g.filter).toContain('volume=1.25'); // voice lifted on top
    expect(g.filter).toContain('volume=0.6');  // music/SFX bed sits lower
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
    // The 5-clip film is padded to the 30s brand target (was 26s after xfades).
    expect(g.filter).toContain('apad,atrim=0:30.00,asetpts=N/SR/TB,');
    expect(g.filter).toContain('tpad=stop_mode=clone'); // video held to 30s with a fade tail
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

  test('duck 0% → floor sidechain ratio still keeps the narration on top', () => {
    const g = buildFilterComplex({ nClips: 2, hasVoice: true, hasMusic: true, hasSfx: false, fps: 24, duckPct: 0 });
    expect(g.filter).toContain('ratio=8'); // 0% → floor 8 (narration-forward: never lets music bury the voice)
  });

  test('cpu path never emits minterpolate even at fps 60', () => {
    const g = buildFilterComplex({ nClips: 2, hasVoice: false, hasMusic: false, hasSfx: false, fps: 60, duckPct: 30 });
    expect(g.filter).not.toContain('minterpolate');
  });

  // ── MUSIC VIDEO / SONG-MASTER MODE (v330) ──────────────────────────────────
  test('music video mode → song rules the master, narrator OMITTED entirely', () => {
    // The classic clash: a narrator over a song. In music-video mode the voice is
    // dropped from the mix even though it is present (and its input index reserved).
    const g = buildFilterComplex({ nClips: 5, hasVoice: true, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30, musicVideo: true });
    // music is index 6 (5 clips 0-4, voice 5, music 6) → song is the master at unity
    expect(g.filter).not.toContain('volume=1.25'); // NO voice lift — voice is gone
    expect(g.filter).not.toContain('[vkey]');       // voice never split into the mix
    expect(g.filter).not.toContain('[vraw]');
    expect(g.filter).not.toContain('sidechaincompress'); // no SFX → no duck needed
    expect(g.amap).toBe('[aout]'); // the song still flows through the master chain
  });

  test('music video mode + SFX → secondary bed sidechain-ducked under the SONG (~−12dB)', () => {
    const g = buildFilterComplex({ nClips: 4, hasVoice: true, hasMusic: true, hasSfx: true, fps: 24, duckPct: 30, musicVideo: true });
    expect(g.filter).toContain('asplit=2[songkey][songmaster]'); // song keys the duck
    expect(g.filter).toContain('[songkey]sidechaincompress');     // SFX ducked under the song
    expect(g.filter).toContain('ratio=20');                       // deep, ~−12dB duck
    expect(g.filter).toContain('[songmaster][sfxduck]amix=inputs=2'); // song stays on top
    expect(g.filter).not.toContain('volume=1.25'); // narrator still omitted
    expect(g.amap).toBe('[aout]');
  });

  test('music video mode reserves the voice input index → brand overlay index unshifted', () => {
    // 3 clips (0-2) + voice (3, reserved/omitted) + music (4) → brand PNG = index 5.
    const g = buildFilterComplex({ nClips: 3, hasVoice: true, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30, musicVideo: true, hasBrandOverlay: true });
    expect(g.filter).toContain('[5:v]format=rgba,fade=t=in');
    expect(g.filter).toContain("[vbrandpng]overlay=0:0:format=auto:enable='between(");
    expect(g.vmap).toBe('[vbrand]');
  });

  test('default (no musicVideo flag) → unchanged narration-forward mix', () => {
    // Regression guard: without the flag the documentary mix is byte-for-byte intact.
    const g = buildFilterComplex({ nClips: 2, hasVoice: true, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30 });
    expect(g.filter).toContain('volume=1.25'); // voice still lifted on top
    expect(g.filter).toContain('sidechaincompress');
    expect(g.filter).not.toContain('songmaster');
  });

  // ── MTV-STYLE MUSIC INFO BUG (v330) ────────────────────────────────────────
  test('music bug → faded, time-gated overlay composited AFTER the brand PNG', () => {
    // 5 clips (0-4) + music (5) → brand PNG = index 6, music-bug PNG = index 7.
    const g = buildFilterComplex({ nClips: 5, hasVoice: false, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30, musicVideo: true, hasBrandOverlay: true, hasMusicBug: true });
    // brand waits until the bug fades (~5s), then shows briefly with its own alpha fades
    expect(g.filter).toContain('[6:v]format=rgba,fade=t=in:st=5.00');
    expect(g.filter).toContain("[vbrandpng]overlay=0:0:format=auto:enable='between(t,5.00,");
    expect(g.filter).toContain('[7:v]format=rgba,fade=t=in'); // bug PNG alpha-faded
    expect(g.filter).toContain("[vbrand][mbug]overlay=0:0:enable='between(t,0,4.4)'"); // bug over the opening
    expect(g.vmap).toBe('[vmbug]');
  });

  test('music bug without a brand overlay → bug takes the first overlay input index', () => {
    // 3 clips (0-2) + music (3) → music-bug PNG = index 4 (no brand PNG before it).
    const g = buildFilterComplex({ nClips: 3, hasVoice: false, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30, hasMusicBug: true });
    expect(g.filter).toContain('[4:v]format=rgba,fade=t=in');
    expect(g.filter).not.toContain('[vbrand]');
    expect(g.vmap).toBe('[vmbug]');
  });

  // STEP 2 (L6) — the smart-duck / duck-dB sliders now drive the COMMON 2-track (voice + music bed)
  // narration-forward mix, not just the rare 3-lane master. The dB→ratio map is anchored so the UI
  // default (−12 dB) reproduces the prior FIXED ratio (12) → existing/default films are byte-identical.
  const twoTrack = (over: Record<string, unknown> = {}) =>
    buildFilterComplex({ nClips: 3, hasVoice: true, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30, ...over }).filter;

  test('2-track duck-dB: default (no slider) AND −12 dB both reproduce the prior ratio 12 (zero regression)', () => {
    expect(twoTrack()).toContain('sidechaincompress=threshold=0.03:ratio=12:attack=5:release=250');
    expect(twoTrack({ duckDb: -12 })).toContain('sidechaincompress=threshold=0.03:ratio=12:attack=5:release=250');
  });

  test('2-track duck-dB slider changes the ducking depth (−18 → deeper 17 · −6 → floor 8)', () => {
    expect(twoTrack({ duckDb: -18 })).toContain('sidechaincompress=threshold=0.03:ratio=17:');
    expect(twoTrack({ duckDb: -6 })).toContain('sidechaincompress=threshold=0.03:ratio=8:');
  });

  test('2-track smart-duck OFF → static mix, NO sidechain pumping', () => {
    const off = twoTrack({ smartDuck: false });
    expect(off).not.toContain('sidechaincompress');   // no ducking
    expect(off).not.toContain('[vkey]');              // voice is not split for a sidechain key
    expect(off).toContain('volume=1.25');             // voice still lifted on top
    expect(off).toContain('amix=inputs=2:normalize=0[apre]'); // static voice+bed mix
  });

  // FINAL SWEEP — the dB→ratio map is now UNIFIED via the shared duckRatio() helper, so the
  // 2-track (voice + bed) and 3-track (dialogue + music + sfx) master duck IDENTICALLY for the
  // same duck-dB input. Previously the 3-track used a divergent |duckDb|·(20/12) map → −12 dB
  // produced ratio 20 there vs 12 in the 2-track; that asymmetry is the bug this closes.
  const threeTrack = (over: Record<string, unknown> = {}) =>
    buildFilterComplex({ nClips: 3, hasVoice: true, hasMusic: true, hasSfx: true, fps: 24, duckPct: 30, ...over }).filter;

  test('3-track duck-dB now matches the 2-track ratio for identical input (unified map, was 20 not 12 at −12)', () => {
    for (const [db, ratio] of [[-12, 12], [-18, 17], [-6, 8]] as const) {
      const needle = `sidechaincompress=threshold=0.03:ratio=${ratio}:attack=5:release=250`;
      expect(threeTrack({ duckDb: db })).toContain(needle);
      expect(twoTrack({ duckDb: db })).toContain(needle);
    }
  });

  test('duckRatio() is the single source of truth: 2-track and 3-track agree across the dB range', () => {
    for (const db of [-6, -9, -12, -15, -18, -24]) {
      const r = duckRatio(db, 0.3); // duckPct 30 → duck 0.3, matching both helpers above
      expect(twoTrack({ duckDb: db })).toContain(`ratio=${r}:`);
      expect(threeTrack({ duckDb: db })).toContain(`ratio=${r}:`);
    }
  });

  test('duckRatio() maths: anchor −12→12, scales with depth, clamps 8..30', () => {
    expect(duckRatio(-12, 0.3)).toBe(12);       // anchor (round 11.6)
    expect(duckRatio(-18, 0.3)).toBe(17);       // deeper (round 17.4)
    expect(duckRatio(-6, 0.3)).toBe(8);         // floor clamp (5.8 → 6 → 8)
    expect(duckRatio(-60, 0.3)).toBe(30);       // ceiling clamp
    expect(duckRatio(undefined, 0.3)).toBe(12); // no dB → pure duckPct baseline
  });
});
