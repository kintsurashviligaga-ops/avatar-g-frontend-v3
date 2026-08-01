'use client';

import { useEffect, useState } from 'react';

/**
 * TEMPORARY on-screen viewport readout — for killing the iOS keyboard-docking bug.
 *
 * ⚠️ WHY THIS EXISTS. The keyboard layout has been "fixed" four times from reasoning alone and is still
 * wrong on iOS, because `interactive-widget=resizes-content` is Chromium-only — iOS Safari ignores it and
 * falls to the JS path, which has never once been observed running on a real device. Every attempt
 * typechecked, built, and was wrong in a different way. That is not bad luck; it is what debugging blind
 * looks like.
 *
 * These six numbers turn it into arithmetic:
 *   layoutH  window.innerHeight        — the viewport CSS thinks it has
 *   visualH  visualViewport.height     — what the user can actually see
 *   vvTop    visualViewport.offsetTop  — how far the browser scroll-shifted the visible band
 *   kbInset  layoutH - visualH - vvTop — the keyboard, as the hook computes it
 *   shell    the .ag-fixed-shell box   — where the app ACTUALLY is
 *   safeTop  env(safe-area-inset-top)  — the notch reserve
 *
 * If shell.top ≠ 0 while kbInset is 0, the JS is displacing the shell for no reason. If shell.bottom
 * lands above visualH, the composer is floating. If shell.top is negative, the header is being clipped —
 * which is what the screenshot shows. Whichever it is, the numbers say so directly.
 *
 * ⚠️ OFF UNLESS EXPLICITLY REQUESTED. It renders only with `?vpdebug=1` in the URL, so it can ship to
 * production and stay invisible to every real user while remaining one tap away on the affected phone.
 * DELETE THIS FILE once the bug is closed — a debug overlay that outlives its bug becomes furniture
 * nobody dares remove.
 */
export function ViewportDebugOverlay() {
  const [on, setOn] = useState(false);
  const [s, setS] = useState<Record<string, number | string>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!new URLSearchParams(window.location.search).has('vpdebug')) return;
    setOn(true);

    const read = () => {
      const vv = window.visualViewport;
      const el = document.querySelector('.ag-fixed-shell');
      const r = el ? el.getBoundingClientRect() : null;
      const layoutH = window.innerHeight;
      const visualH = vv ? Math.round(vv.height) : 0;
      const vvTop = vv ? Math.round(vv.offsetTop) : 0;
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px);';
      document.body.appendChild(probe);
      const safeTop = Math.round(probe.getBoundingClientRect().height);
      probe.remove();
      setS({
        layoutH,
        visualH,
        vvTop,
        kbInset: vv ? Math.max(0, layoutH - visualH - vvTop) : 0,
        shellTop: r ? Math.round(r.top) : -1,
        shellH: r ? Math.round(r.height) : -1,
        shellBottom: r ? Math.round(r.bottom) : -1,
        safeTop,
        dpr: window.devicePixelRatio,
        standalone:
          window.matchMedia?.('(display-mode: standalone)')?.matches
          || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
            ? 'YES' : 'no',
      });
    };

    read();
    const vv = window.visualViewport;
    // Both events: iOS fires `scroll` (not resize) when it shifts the band for a focused field.
    vv?.addEventListener('resize', read);
    vv?.addEventListener('scroll', read);
    window.addEventListener('resize', read);
    const id = window.setInterval(read, 400); // catches transitions the events miss mid-animation
    return () => {
      vv?.removeEventListener('resize', read);
      vv?.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
      window.clearInterval(id);
    };
  }, []);

  if (!on) return null;

  // Fixed to the TOP: the whole point is to stay readable while the keyboard covers the bottom half.
  // pointer-events-none so it can never intercept a tap on the UI being debugged.
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[2147483647] px-1 pt-1"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2px)' }}
      aria-hidden
    >
      <pre className="mx-auto max-w-[96vw] overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-black/85 px-2 py-1 text-[10px] leading-[1.35] text-lime-300 ring-1 ring-lime-400/40">
{Object.entries(s).map(([k, v]) => `${k}=${v}`).join('  ')}
      </pre>
    </div>
  );
}
