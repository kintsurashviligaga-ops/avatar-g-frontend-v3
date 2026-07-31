/** @jest-environment node */
import { clampShift } from './useViewportClamp';

describe('the measurement taken from the real browser', () => {
  it('THE BUG, VERIFIED IN-BROWSER: header language menu at 320px sat at left -36', () => {
    // Applying this shift moved it to left 8 / right 161 — confirmed live before the test was written.
    expect(clampShift({ left: -36, right: 117 }, 320)).toBe(44);
  });

  it('the corrected position is inside the viewport with the gutter respected', () => {
    const shift = clampShift({ left: -36, right: 117 }, 320);
    expect(-36 + shift).toBe(8);
    expect(117 + shift).toBeLessThanOrEqual(320 - 8);
  });
});

describe('a popover that already fits is never moved', () => {
  it.each([
    [{ left: 100, right: 292 }, 320],
    [{ left: 8, right: 312 }, 320],
    [{ left: 400, right: 700 }, 1280],
  ])('%p at %ipx → 0', (rect, vw) => {
    expect(clampShift(rect, vw)).toBe(0);
  });
});

describe('the right edge is handled too', () => {
  it('pulls a popover back when it overflows right', () => {
    expect(clampShift({ left: 200, right: 360 }, 320)).toBe(-48);
    expect(200 + clampShift({ left: 200, right: 360 }, 320)).toBe(152);
  });

  it('left wins when a popover is wider than the viewport — labels start on the left', () => {
    // Cannot satisfy both edges; showing the start is the useful choice.
    expect(clampShift({ left: -50, right: 400 }, 320)).toBe(58);
  });
});

describe('bounds', () => {
  it('honours a custom gutter', () => {
    expect(clampShift({ left: -36, right: 117 }, 320, 16)).toBe(52);
  });

  it('returns 0 rather than NaN on junk', () => {
    expect(clampShift({ left: Number.NaN, right: 10 }, 320)).toBe(0);
    expect(clampShift({ left: 0, right: Number.POSITIVE_INFINITY }, 320)).toBe(0);
    expect(clampShift({ left: 10, right: 20 }, Number.NaN)).toBe(0);
  });
});
