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

    const update = () => {
      const diff = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardOffset(diff > 120 ? Math.round(diff) : 0);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return { keyboardOffset };
}
