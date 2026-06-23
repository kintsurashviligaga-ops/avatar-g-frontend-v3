import { useEffect, useState } from 'react';

/**
 * Tracks the on-screen keyboard height on mobile via the VisualViewport API.
 *
 * iOS Safari (and some Android browsers) shrink the *visual* viewport when the
 * soft keyboard opens but leave the *layout* viewport (and `100dvh`) unchanged,
 * so a bottom-anchored composer slides underneath the keyboard. Subtracting the
 * returned `keyboardOffset` from the shell height keeps the composer visible.
 *
 * Returns 0 whenever the keyboard is closed (offsets under a small threshold are
 * treated as noise from browser chrome show/hide).
 */
export function useKeyboardResilience(): { keyboardOffset: number } {
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let raf = 0;
    const compute = () => {
      raf = 0;
      // Keyboard height = how much the *visual* viewport shrank vs the layout
      // viewport. We deliberately do NOT subtract vv.offsetTop: offsetTop is the
      // page-pan of the visual viewport (positive while scrolling a focused field
      // with the keyboard open), and subtracting it made the same physical keyboard
      // compute a smaller value mid-scroll — the composer visibly jittered. Clamp
      // to >= 0 so a transient layout can never produce a negative height.
      const diff = Math.max(0, window.innerHeight - vv.height);
      const next = diff > 120 ? Math.round(diff) : 0;
      // Bail on no-op churn (scroll fires this on every frame) so an unchanged
      // value never re-renders the consuming shell.
      setKeyboardOffset((prev) => (prev === next ? prev : next));
    };
    // Coalesce bursts of resize+scroll during the open/close animation into one
    // update per frame.
    const update = () => {
      if (raf) return;
      raf = requestAnimationFrame(compute);
    };

    compute();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return { keyboardOffset };
}
