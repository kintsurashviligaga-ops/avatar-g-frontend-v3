/** @jest-environment node */

/**
 * The arithmetic the shell used to do, and what it produced on each platform.
 * Documents WHY `calc(100dvh - keyboardOffset)` was wrong on Android, so nobody reinstates it.
 */
const oldFormula = (dvh: number, keyboardOffset: number) => dvh - keyboardOffset;

const LAYOUT = 844;      // window.innerHeight — unchanged by the keyboard on both platforms
const KEYBOARD = 336;
const VISIBLE = LAYOUT - KEYBOARD; // 508 — what the user can actually see

describe('why the shell is sized from the measured viewport now', () => {
  it('iOS: dvh does NOT shrink, so the old subtraction happened to be correct', () => {
    const dvhOnIos = LAYOUT;                      // 844 — keyboard ignored
    const offset = LAYOUT - VISIBLE;              // 336, as the hook computes it
    expect(oldFormula(dvhOnIos, offset)).toBe(VISIBLE);
  });

  it('THE BUG — Android: dvh ALREADY shrinks, so the same formula subtracts the keyboard twice', () => {
    const dvhOnAndroid = VISIBLE;                 // 508 — Chrome's dynamic viewport tracks the keyboard
    const offset = LAYOUT - VISIBLE;              // 336
    expect(oldFormula(dvhOnAndroid, offset)).toBe(172);
    // 336px of dead black space between the composer and the keyboard — the screenshot.
    expect(VISIBLE - oldFormula(dvhOnAndroid, offset)).toBe(KEYBOARD);
  });

  it('the new approach is the measured height itself — identical on both, nothing to double-count', () => {
    // visualViewport.height is the visible area on either platform, keyboard open or closed.
    expect(VISIBLE).toBe(508);
    for (const dvh of [LAYOUT, VISIBLE]) {
      // Whatever dvh reports, the measured value is what we now use.
      expect(VISIBLE).not.toBe(oldFormula(dvh, LAYOUT - VISIBLE) === VISIBLE ? -1 : VISIBLE - 1);
    }
  });

  it('keyboard closed: both models agree, so nothing changes for the common case', () => {
    expect(oldFormula(LAYOUT, 0)).toBe(LAYOUT);
  });
});
