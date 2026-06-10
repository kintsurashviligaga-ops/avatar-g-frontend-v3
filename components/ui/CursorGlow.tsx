'use client';

import { useEffect, useRef } from 'react';

export default function CursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = glowRef.current;
    if (!el) return;

    let raf = 0;
    let tx = -200, ty = -200;
    let cx = -200, cy = -200;

    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };

    const tick = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      el.style.transform = `translate(${cx - 200}px, ${cy - 200}px)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={glowRef}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-0 w-[400px] h-[400px] rounded-full"
      style={{
        // INLINE position:fixed is mandatory — the global `.ag-noise > *` /
        // `.ag-silver-neon-overlay > *` rule (on the locale layout wrapper) sets
        // `position: relative` on every direct child at equal specificity to
        // Tailwind's `.fixed`, which pulled this 400×400 glow INTO normal flow and
        // shoved all page content down 400px (the "half-screen blank, scroll to
        // fix" bug on legal/flow pages). Inline style wins the cascade → out of flow.
        position: 'fixed',
        background: 'radial-gradient(circle at center, rgba(14,165,233,0.07) 0%, rgba(0,212,255,0.04) 40%, transparent 70%)',
        transition: 'opacity 0.3s',
        willChange: 'transform',
      }}
    />
  );
}
