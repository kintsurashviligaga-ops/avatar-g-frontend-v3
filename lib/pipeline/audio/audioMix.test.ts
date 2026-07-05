/** @jest-environment node */
import { compileAudioMix, hardMuteExpr, muteAf, windowsExpr, clampWindows, DEFAULT_DUCK_DB } from './audioMix';

describe('clampWindows', () => {
  it('trims overruns, drops fully out-of-range/degenerate windows, and counts drops', () => {
    const r = clampWindows(
      [
        { startSec: 6, endSec: 8 }, // in range → kept
        { startSec: 25, endSec: 40 }, // overruns 30 → trimmed to 25-30
        { startSec: 35, endSec: 50 }, // starts past 30 → dropped
        { startSec: 8, endSec: 6 }, // degenerate → dropped
      ],
      30,
    );
    expect(r.windows).toEqual([{ startSec: 6, endSec: 8 }, { startSec: 25, endSec: 30 }]);
    expect(r.dropped).toBe(2);
  });
  it('a zero/invalid master caps everything out', () => {
    expect(clampWindows([{ startSec: 1, endSec: 2 }], 0)).toEqual({ windows: [], dropped: 1 });
    expect(clampWindows(null, 30)).toEqual({ windows: [], dropped: 0 });
  });
});

describe('windowsExpr / muteAf', () => {
  it('ORs multiple windows and drops degenerate/non-finite ones', () => {
    expect(windowsExpr([{ startSec: 6, endSec: 8 }, { startSec: 20, endSec: 22 }])).toBe('between(t,6,8)+between(t,20,22)');
    expect(windowsExpr([{ startSec: 8, endSec: 6 }])).toBeNull(); // b ≤ a → dropped
    expect(windowsExpr([{ startSec: Number.NaN, endSec: 8 }])).toBe('between(t,0,8)'); // NaN start → 0
    expect(windowsExpr([])).toBeNull();
    expect(windowsExpr(null)).toBeNull();
  });
  it('muteAf wraps the expr into a volume gate', () => {
    expect(muteAf([{ startSec: 6, endSec: 8 }])).toBe("volume=enable='between(t,6,8)':volume=0");
    expect(muteAf([])).toBeNull();
  });
});

describe('hardMuteExpr (back-compat single window)', () => {
  it('builds a between() volume gate and clamps', () => {
    expect(hardMuteExpr({ startSec: 6, endSec: 8 })).toBe("volume=enable='between(t,6,8)':volume=0");
    expect(hardMuteExpr({ startSec: 8, endSec: 6 })).toBeNull(); // degenerate (b ≤ a) → no mute
    expect(hardMuteExpr({ startSec: Number.NaN, endSec: 8 })).toBe("volume=enable='between(t,0,8)':volume=0"); // NaN start → 0
    expect(hardMuteExpr(null)).toBeNull();
  });
});

describe('compileAudioMix', () => {
  const all = { dialogue: 'd.m4a', narrator: 'n.m4a', music: 'm.m4a', sfx: 's.m4a' };

  it('4 fields, no script windows → voice-keyed -12dB sidechain duck (ratio 12), NO mute, amix of 4', () => {
    const plan = compileAudioMix(all);
    expect(plan.duckDb).toBe(DEFAULT_DUCK_DB);
    expect(plan.inputCount).toBe(4);
    expect(plan.fields).toEqual({ dialogue: true, narrator: true, music: true, sfx: true });
    // no explicit dialogueSpans → signal-driven sidechain (ducking map: -12 → 12)
    expect(plan.filterComplex).toContain('sidechaincompress=threshold=0.03:ratio=12');
    // script-driven: NO hardcoded 6-8 mute anymore
    expect(plan.filterComplex).not.toContain('between(t');
    expect(plan.hardMuteAf).toBeNull();
    expect(plan.muteWindowCount).toBe(0);
    expect(plan.filterComplex).toContain('asplit=2[vmix][vkey]');
    expect(plan.filterComplex).toContain('amix=inputs=4');
    expect(plan.outLabel).toBe('[aout]');
  });

  it('explicit muteWindows → multi-window hard-mute on the score + hardMuteAf', () => {
    const plan = compileAudioMix(all, { muteWindows: [{ startSec: 6, endSec: 8 }, { startSec: 20, endSec: 22 }] });
    expect(plan.filterComplex).toContain("volume=enable='between(t,6,8)+between(t,20,22)':volume=0");
    expect(plan.hardMuteAf).toBe("volume=enable='between(t,6,8)+between(t,20,22)':volume=0");
    expect(plan.muteWindowCount).toBe(2);
  });

  it('explicit dialogueSpans → TIME-driven ducking (no sidechain), score volume drops to duck-gain', () => {
    const plan = compileAudioMix(all, { dialogueSpans: [{ startSec: 3, endSec: 9 }] });
    expect(plan.filterComplex).not.toContain('sidechaincompress');
    // -12 dB → linear gain ~0.251
    expect(plan.filterComplex).toContain("volume=enable='between(t,3,9)':volume=0.251");
  });

  it('legacy single hardMute still maps into muteWindows', () => {
    const plan = compileAudioMix(all, { hardMute: { startSec: 6, endSec: 8 } });
    expect(plan.hardMuteAf).toBe("volume=enable='between(t,6,8)':volume=0");
    expect(plan.muteWindowCount).toBe(1);
  });

  it('without dialogue → no sidechain (music not ducked, just leveled)', () => {
    const plan = compileAudioMix({ music: 'm.m4a', sfx: 's.m4a' });
    expect(plan.filterComplex).not.toContain('sidechaincompress');
    expect(plan.filterComplex).toContain('amix=inputs=2');
    expect(plan.fields.dialogue).toBe(false);
  });

  it('single field → anull passthrough (no amix)', () => {
    const plan = compileAudioMix({ dialogue: 'd.m4a' });
    expect(plan.filterComplex).toContain('anull[aout]');
    expect(plan.filterComplex).not.toContain('amix');
    expect(plan.inputCount).toBe(1);
  });

  it('no fields → empty graph, no crash', () => {
    const plan = compileAudioMix({});
    expect(plan.filterComplex).toBe('');
    expect(plan.inputCount).toBe(0);
  });

  it('honors a custom duckDb', () => {
    const plan = compileAudioMix(all, { duckDb: -18 });
    expect(plan.filterComplex).toContain('ratio=17'); // duckRatio(-18) = 17
  });
});
