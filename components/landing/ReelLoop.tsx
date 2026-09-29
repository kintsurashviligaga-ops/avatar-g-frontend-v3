'use client';

import { useEffect, useRef } from 'react';

/**
 * One landing reel: a muted 5-second loop that plays only while it is on screen and never under reduced motion,
 * where the poster (its first frame) stays. `preload="none"` — a phone that never scrolls here downloads nothing.
 */
export function ReelLoop({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    v.muted = true; // iOS plays inline only when muted; the attribute is not reliably server-rendered
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void v.play().catch(() => { /* autoplay refused — the poster stays */ });
      else v.pause();
    }, { threshold: 0.4 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <video ref={ref} src={src} poster={poster} muted loop playsInline preload="none" aria-label={label}
      className="h-full w-full object-cover" />
  );
}
