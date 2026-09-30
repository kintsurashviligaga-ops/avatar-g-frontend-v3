'use client';

/**
 * LiveOrb — the Live call's one visual signal. It swells with the USER's voice while listening and with the MODEL's
 * voice while speaking, breathes while connecting, turns a slow arc while thinking, and goes still + red on error.
 *
 * Performance contract: one requestAnimationFrame loop that writes `transform` on three refs — no React state per
 * frame, no layout properties, nothing that re-renders the call screen 60 times a second. The loop only runs in the
 * animated states and stops entirely under prefers-reduced-motion (the state then reads from colour + the label).
 *
 * ⚠️ The old Live screen animated the avatar portrait EVEN under prefers-reduced-motion ("movement is the whole
 * point of a live avatar"). This orb deliberately does not: a user who asked the OS for less motion gets a still
 * orb, and the status line still says who is talking.
 */
import { useEffect, useRef, useState } from 'react';

import type { LiveLevels, LiveStatus } from './useGeminiLiveSession';

export type LiveOrbState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

/** The orb has fewer states than the call: a resume looks like connecting, an ended call looks idle. */
export function orbStateFor(status: LiveStatus): LiveOrbState {
  switch (status) {
    case 'connecting':
    case 'reconnecting':
      return 'connecting';
    case 'listening':
    case 'thinking':
    case 'speaking':
    case 'error':
      return status;
    default:
      return 'idle';
  }
}

const ZERO: LiveLevels = { input: 0, output: 0 };

/** The level the orb follows in a state (0..1), plus the idle motion that keeps it alive between words. */
export function orbTarget(state: LiveOrbState, levels: LiveLevels, ts: number): number {
  switch (state) {
    case 'listening':
      return Math.min(1, Math.max(0, levels.input));
    case 'speaking':
      // A small floor so the orb visibly "talks" through the quiet gaps between syllables.
      return Math.min(1, Math.max(0.06, levels.output));
    case 'connecting':
      return 0.08 + 0.06 * Math.sin(ts / 420);
    case 'thinking':
      return 0.05 + 0.04 * Math.sin(ts / 260);
    default:
      return 0;
  }
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

// ⚠️ Read synchronously on the first render: starting at `false` and correcting in an effect let the animation
// loop request its first frame before the preference was known. (Client-only component — ChatChrome loads the
// Live overlay with ssr:false — so there is no server render to disagree with.)
function readReducedMotion(): boolean {
  try { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_QUERY).matches; } catch { return false; }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readReducedMotion);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(REDUCED_QUERY);
    const update = () => setReduced(mq.matches);
    update();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener?.(update);
    return () => mq.removeListener?.(update);
  }, []);
  return reduced;
}

export interface LiveOrbProps {
  state: LiveOrbState;
  /** Read once per animation frame; must be cheap (useGeminiLiveSession().getLevels is). */
  getLevels?: () => LiveLevels;
  /** Diameter in CSS px. */
  size?: number;
  /** The user's enrolled avatar poster, shown inside the orb. */
  imageUrl?: string | null;
  /** Accessible name, e.g. the localized status ("Listening"). */
  label?: string;
  className?: string;
}

const CORE_TONE: Record<LiveOrbState, string> = {
  idle: 'from-app-muted/40 to-app-muted/20',
  connecting: 'from-app-accent/50 to-app-neon/30',
  listening: 'from-app-accent to-app-neon/70',
  thinking: 'from-app-accent/70 to-app-neon/50',
  speaking: 'from-app-neon to-app-accent',
  error: 'from-app-danger/70 to-app-danger/40',
};

const HALO_TONE: Record<LiveOrbState, string> = {
  idle: 'bg-app-muted/10',
  connecting: 'bg-app-accent/15',
  listening: 'bg-app-accent/25',
  thinking: 'bg-app-accent/20',
  speaking: 'bg-app-neon/30',
  error: 'bg-app-danger/20',
};

export default function LiveOrb({ state, getLevels, size = 184, imageUrl, label, className = '' }: LiveOrbProps) {
  const haloRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const levelsRef = useRef(getLevels);
  levelsRef.current = getLevels;
  const reduced = usePrefersReducedMotion();
  const animated = !reduced && state !== 'idle' && state !== 'error';

  useEffect(() => {
    const halo = haloRef.current;
    const ring = ringRef.current;
    const core = coreRef.current;
    const reset = () => {
      if (halo) halo.style.transform = 'translateZ(0) scale(1)';
      if (core) core.style.transform = 'translateZ(0) scale(1)';
      if (ring) ring.style.transform = 'rotate(0deg)';
    };
    if (!animated || typeof requestAnimationFrame !== 'function') { reset(); return undefined; }

    let raf = 0;
    let eased = 0;
    let angle = 0;
    let last = -1;
    const tick = (ts: number) => {
      const dt = last < 0 ? 16 : Math.min(64, ts - last);
      last = ts;
      const st = stateRef.current;
      let levels = ZERO;
      try { levels = levelsRef.current?.() ?? ZERO; } catch { levels = ZERO; }
      const target = orbTarget(st, levels, ts);
      // Fast attack, slow release: syllables pop, silence settles instead of snapping shut.
      eased += (target - eased) * (target > eased ? 0.45 : 0.14);
      if (core) core.style.transform = `translateZ(0) scale(${(1 + eased * 0.22).toFixed(4)})`;
      if (halo) halo.style.transform = `translateZ(0) scale(${(1 + eased * 0.7).toFixed(4)})`;
      if (ring && (st === 'thinking' || st === 'connecting')) {
        angle = (angle + dt * (st === 'thinking' ? 0.24 : 0.12)) % 360;
        ring.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); reset(); };
  }, [animated]);

  const showArc = state === 'thinking' || state === 'connecting';

  return (
    <div
      role="img"
      aria-label={label}
      data-state={state}
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Halo: blurred glow that breathes with the voice. */}
      <div
        ref={haloRef}
        aria-hidden
        className={`absolute inset-0 rounded-full blur-2xl transition-colors duration-500 ${HALO_TONE[state]}`}
        style={{ willChange: animated ? 'transform' : undefined }}
      />
      {/* Arc: a quarter ring that turns while connecting / thinking. */}
      <div
        ref={ringRef}
        aria-hidden
        className={`absolute -inset-1.5 rounded-full border-2 border-transparent transition-opacity duration-300 ${showArc ? 'border-t-app-accent/80 opacity-100' : 'opacity-0'}`}
        style={{ willChange: animated && showArc ? 'transform' : undefined }}
      />
      {/* Core: the orb itself (or the user's avatar inside it). */}
      <div
        ref={coreRef}
        aria-hidden
        className={`absolute inset-[12%] overflow-hidden rounded-full bg-gradient-to-br shadow-2xl ring-1 ring-white/15 transition-colors duration-500 ${CORE_TONE[state]}`}
        style={{ willChange: animated ? 'transform' : undefined }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="h-full w-full rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.45),transparent_55%)]" />
        )}
      </div>
    </div>
  );
}
