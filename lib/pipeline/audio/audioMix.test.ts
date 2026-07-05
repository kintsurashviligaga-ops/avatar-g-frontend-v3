/** @jest-environment node */
import { compileAudioMix, hardMuteExpr, DEFAULT_DUCK_DB, DEFAULT_HARD_MUTE } from './audioMix';

describe('hardMuteExpr', () => {
  it('builds a between() volume gate and clamps', () => {
    expect(hardMuteExpr({ startSec: 6, endSec: 8 })).toBe("volume=enable='between(t,6,8)':volume=0");
    expect(hardMuteExpr({ startSec: 8, endSec: 6 })).toBeNull(); // degenerate (b ≤ a) → no mute
    expect(hardMuteExpr({ startSec: Number.NaN, endSec: 8 })).toBe("volume=enable='between(t,0,8)':volume=0"); // NaN start → 0
    expect(hardMuteExpr(null)).toBeNull();
  });
});

describe('compileAudioMix', () => {
  const all = { dialogue: 'd.m4a', narrator: 'n.m4a', music: 'm.m4a', sfx: 's.m4a' };

  it('4 fields → voice-keyed -12dB duck (ratio 12) + hard-mute 6-8 + amix of 4', () => {
    const plan = compileAudioMix(all);
    expect(plan.duckDb).toBe(DEFAULT_DUCK_DB);
    expect(plan.inputCount).toBe(4);
    expect(plan.fields).toEqual({ dialogue: true, narrator: true, music: true, sfx: true });
    // ducking uses the shared duckRatio map: -12 → 12
    expect(plan.filterComplex).toContain('sidechaincompress=threshold=0.03:ratio=12');
    // hard-mute window on the score
    expect(plan.filterComplex).toContain("between(t,6,8)");
    // dialogue is split into a mix lane + a sidechain key
    expect(plan.filterComplex).toContain('asplit=2[vmix][vkey]');
    // all four lanes amixed
    expect(plan.filterComplex).toContain('amix=inputs=4');
    expect(plan.hardMuteAf).toBe("volume=enable='between(t,6,8)':volume=0");
    expect(plan.outLabel).toBe('[aout]');
  });

  it('without dialogue → no sidechain (music not ducked, just leveled + muted)', () => {
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

  it('honors a custom duckDb and a disabled hard-mute', () => {
    const plan = compileAudioMix(all, { duckDb: -18, hardMute: null });
    expect(plan.filterComplex).not.toContain('between(t');
    expect(plan.hardMuteAf).toBeNull();
    expect(plan.filterComplex).toContain('ratio=17'); // duckRatio(-18) = 17
  });

  it('exposes the default hard-mute window (0:06–0:08)', () => {
    expect(DEFAULT_HARD_MUTE).toEqual({ startSec: 6, endSec: 8 });
  });
});
