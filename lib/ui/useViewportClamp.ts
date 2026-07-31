'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Keep an absolutely-positioned popover inside the viewport.
 *
 * ⚠️ THE PROBLEM THIS SOLVES, MEASURED RATHER THAN REASONED ABOUT. A popover anchored with `right-0` to
 * a control that is NOT itself at the screen edge will hang off the left edge once the popover is wider
 * than the distance from the control's right edge to the left of the screen. Both of this app's composer
 * and header menus do exactly that. At a 320px viewport the header language menu measured
 * `left: -36px` — the flags and the first characters of each label simply were not on screen.
 *
 * `max-w-[calc(100vw-…)]` looks like the fix and is not: it caps WIDTH, and the defect is POSITION. At
 * 320px the menu is 153px wide against a 296px cap, so the constraint never binds while the element is
 * still a third of the way off-screen.
 *
 * ⚠️ AND IT MEASURES THE ELEMENT, NOT THE CLASS. A first version of this computed the overhang from the
 * Tailwind width class (`w-48` → 192px). The same menu renders 153px. Deriving position from a class
 * name produced a 39px error in the correction — a fix that moves the element to the wrong place is
 * worse than the bug, because it looks deliberate. Reading `getBoundingClientRect()` cannot be wrong.
 *
 * useLayoutEffect, so the correction lands in the same paint the popover appears in; with useEffect the
 * first frame renders clipped and the menu visibly jumps sideways.
 */
/**
 * The pure arithmetic, exported so it is testable without a DOM.
 *
 * VERIFIED AGAINST THE REAL ELEMENT: the header language menu at a 320px viewport measured
 * left = -36, right = 117. This returns 44, and applying it put the menu at left = 8, right = 161 —
 * fully inside. That measurement is the reason this function exists rather than a width-class guess.
 */
export function clampShift(
  rect: { left: number; right: number },
  viewportWidth: number,
  gutter = 8,
): number {
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.right) || !Number.isFinite(viewportWidth)) return 0;
  // Off the left edge — push right. Checked first: a popover too wide for the viewport should have its
  // START visible, since that is where the labels begin.
  if (rect.left < gutter) return Math.round(gutter - rect.left);
  if (rect.right > viewportWidth - gutter) return -Math.round(rect.right - (viewportWidth - gutter));
  return 0;
}

export function useViewportClamp(open: boolean, gutter = 8) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shift, setShift] = useState(0);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Neutralise any correction already applied so the NATURAL position is what gets measured —
    // otherwise each pass would compound the previous one.
    const prev = el.style.transform;
    el.style.transform = 'none';
    const rect = el.getBoundingClientRect();
    el.style.transform = prev;
    setShift(clampShift(rect, document.documentElement.clientWidth, gutter));
  }, [gutter]);

  useLayoutEffect(() => {
    if (!open) { setShift(0); return; }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [open, measure]);

  /** Spread onto the popover: `<div {...clamp.props}>`. */
  const props = {
    ref,
    style: shift ? { transform: `translateX(${shift}px)` } : undefined,
  };

  return { ref, shift, props };
}
