/** @jest-environment node */
import { smoothBar, lerpRgb, orbColorAt, orbBarColor, stateAccent, rgba, ORB_PALETTE, ORB_STATE_GRADIENT, orbBlobRadius } from './orbViz';

describe('smoothBar — asymmetric attack/decay envelope', () => {
  test('rises fast toward a louder target (attack) but never overshoots', () => {
    const up = smoothBar(0.2, 0.8, 0.5, 0.12);
    expect(up).toBeCloseTo(0.5, 5); // 0.2 + (0.8-0.2)*0.5
    expect(up).toBeLessThan(0.8);
  });
  test('falls slowly when the sound drops (decay < attack)', () => {
    const down = smoothBar(0.8, 0.2, 0.5, 0.12);
    expect(down).toBeCloseTo(0.728, 3); // 0.8 + (0.2-0.8)*0.12
    // a fall moves LESS than the equivalent rise would — that is what kills the flicker
    expect(0.8 - down).toBeLessThan(0.5);
  });
  test('clamps to [0,1] and tolerates NaN', () => {
    expect(smoothBar(0.9, 5)).toBeLessThanOrEqual(1);
    expect(smoothBar(-3, 0.5)).toBeGreaterThanOrEqual(0);
    expect(smoothBar(NaN, NaN)).toBe(0);
  });
});

describe('lerpRgb', () => {
  test('endpoints and midpoint', () => {
    expect(lerpRgb([0, 0, 0], [255, 255, 255], 0)).toEqual([0, 0, 0]);
    expect(lerpRgb([0, 0, 0], [255, 255, 255], 1)).toEqual([255, 255, 255]);
    expect(lerpRgb([0, 0, 0], [10, 20, 40], 0.5)).toEqual([5, 10, 20]);
  });
  test('clamps t', () => {
    expect(lerpRgb([0, 0, 0], [100, 100, 100], 5)).toEqual([100, 100, 100]);
    expect(lerpRgb([0, 0, 0], [100, 100, 100], -5)).toEqual([0, 0, 0]);
  });
});

describe('orbColorAt — flowing multi-colour ring', () => {
  test('samples the palette and wraps seamlessly (p=0 with shift 0 → first colour)', () => {
    expect(orbColorAt(0, 0)).toEqual(ORB_PALETTE[0]);
  });
  test('is continuous — a tiny position delta yields a small colour delta (no jumps)', () => {
    const a = orbColorAt(0.24, 0.1);
    const b = orbColorAt(0.25, 0.1);
    const dist = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    expect(dist).toBeLessThan(60); // adjacent samples are close → smooth gradient, not a hard band
  });
  test('shift rotates the gradient (flow over time)', () => {
    expect(orbColorAt(0.5, 0)).not.toEqual(orbColorAt(0.5, 0.5));
  });
  test('wraps: position 1 folds back to position 0', () => {
    expect(orbColorAt(1, 0)).toEqual(orbColorAt(0, 0));
  });
});

describe('stateAccent + orbBarColor', () => {
  test('each state has a distinct accent + mix weight (Phase 35 cyan/white/crimson palette)', () => {
    expect(stateAccent('listening').accent).toEqual([0, 209, 255]); // bright cyan #00D1FF
    expect(stateAccent('speaking').accent).toEqual([255, 255, 255]); // clean white
    expect(stateAccent('error').accent).toEqual([255, 0, 60]); // crimson #FF003C
    expect(stateAccent('error').mix).toBeGreaterThan(stateAccent('idle').mix);
  });
  test('louder bars brighten toward white', () => {
    const quiet = orbBarColor(0.3, 0, 0, 'speaking');
    const loud = orbBarColor(0.3, 0, 1, 'speaking');
    const sum = (c: readonly number[]) => c[0]! + c[1]! + c[2]!;
    expect(sum(loud)).toBeGreaterThan(sum(quiet));
  });
});

describe('rgba', () => {
  test('formats + clamps alpha', () => {
    expect(rgba([10, 20, 30], 0.5)).toBe('rgba(10,20,30,0.5)');
    expect(rgba([10, 20, 30], 5)).toBe('rgba(10,20,30,1)');
    expect(rgba([10, 20, 30], -5)).toBe('rgba(10,20,30,0)');
  });
});

// ── PHASE 39 (Master Contract V16) — liquid orb ──────────────────────────────
describe('ORB_STATE_GRADIENT — brand-locked per-state colours', () => {
  test('every conversation state has an inner+outer gradient', () => {
    for (const s of ['idle', 'listening', 'processing', 'speaking', 'error'] as const) {
      expect(ORB_STATE_GRADIENT[s].inner).toHaveLength(3);
      expect(ORB_STATE_GRADIENT[s].outer).toHaveLength(3);
    }
  });
  test('the mandated colours: listening cyan→blue, speaking crimson→violet, processing white→silver', () => {
    expect(ORB_STATE_GRADIENT.listening.inner).toEqual([0, 209, 255]); // #00D1FF
    expect(ORB_STATE_GRADIENT.listening.outer).toEqual([0, 102, 255]); // #0066FF
    expect(ORB_STATE_GRADIENT.speaking.inner).toEqual([255, 0, 60]); //   #FF003C
    expect(ORB_STATE_GRADIENT.speaking.outer).toEqual([209, 0, 209]); //  #D100D1
    expect(ORB_STATE_GRADIENT.processing.inner).toEqual([255, 255, 255]);
  });
});

describe('orbBlobRadius — morphing liquid boundary', () => {
  test('wraps seamlessly: angleFrac 0 and 1 map to the same boundary point', () => {
    expect(orbBlobRadius(0, 3.2, 0.4, 0.9)).toBeCloseTo(orbBlobRadius(1, 3.2, 0.4, 0.9), 10);
  });
  test('is deterministic (pure) for identical inputs', () => {
    expect(orbBlobRadius(0.37, 1.1, 0.6, 2.1)).toBe(orbBlobRadius(0.37, 1.1, 0.6, 2.1));
  });
  test('louder amplitude swells the average radius', () => {
    const avg = (amp: number) => {
      let s = 0; const N = 64;
      for (let i = 0; i < N; i++) s += orbBlobRadius(i / N, 0, amp, 0);
      return s / N;
    };
    expect(avg(1)).toBeGreaterThan(avg(0)); // sound pushes the blob outward
  });
  test('stays in a sane band around 1 (never collapses or explodes)', () => {
    for (let i = 0; i <= 20; i++) {
      const r = orbBlobRadius(i / 20, i * 0.3, 0.5, 1.3);
      expect(r).toBeGreaterThan(0.7);
      expect(r).toBeLessThan(1.8);
    }
  });
});
