'use client';

/**
 * LiveOrb — the Live call's one visual signal. It swells with the USER's voice while listening and with the MODEL's
 * voice while speaking, breathes while connecting, turns a slow arc while thinking, and goes still on error.
 * LiveWaveform — the five accent bars in the control pill, driven by the same levels.
 *
 * Performance contract: one requestAnimationFrame loop per component that writes `transform` on refs — no React state
 * per frame, no layout properties, nothing that re-renders the call screen 60 times a second. The loops only run in
 * the animated states and stop entirely under prefers-reduced-motion (the state then reads from the label).
 *
 * Look (docs/DESIGN.md §6 exception for Live): ONE hue — accent → cyan-500 → cyan-dim — and exactly ONE
 * audio-reactive halo behind the core. ⚠️ The core used to carry `shadow-2xl` (a second glow) and its gradient ran
 * accent → neon, which are the same colour in the dark theme: a flat disc with two glows. The depth now comes from
 * the cyan shades of the one hue.
 *
 * ⚠️ The old Live screen animated the avatar portrait EVEN under prefers-reduced-motion ("movement is the whole
 * point of a live avatar"). This orb deliberately does not: a user who asked the OS for less motion gets a still
 * orb, and the status line still says who is talking.
 *
 * ⚠️ THE ROCKET IS THE AGENT (the owner's brief, 2026-10-03). The orb used to show the user's enrolled avatar poster —
 * on the owner's phone, a photo of a man inside the orb and blurred into a cropped photo behind it. The agent the user
 * talks to is MyAvatar's, so its face is the brand mark: the transparent rocket (public/brand/rocket-mark*.png, never
 * redrawn) sits on a dark glass disc, `object-contain` with padding, so it is never cropped or stretched at any size
 * from the dock's 40 px to the call's 208 px; `srcSet` picks the 256 or the 512 px raster for the pixels it needs.
 * `backdrop` adds the same rocket large and faint behind the orb, on a soft wash of the rocket's blue — static (no
 * motion to reduce), one hue, under the one audio-reactive halo.
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
  /** Accessible name, e.g. the localized status ("Listening"). */
  label?: string;
  /** The full call's backdrop: the rocket large and faint behind the orb, on a soft wash of its blue. */
  backdrop?: boolean;
  className?: string;
}

/** The brand mark, transparent (made by design/brand/rocket/extract.py — never redrawn). */
export const LIVE_ROCKET_SRC = '/brand/rocket-mark-512.png';
const LIVE_ROCKET_SRCSET = '/brand/rocket-mark.png 256w, /brand/rocket-mark-512.png 512w';
/** The rocket's box inside the core: 70 % of it, centred — the mark runs corner to corner, and a square of 70 % of a
 *  circle's diameter keeps its corners inside the circle, so the nose and the flame are never clipped. */
const ROCKET_FILL = 0.7;
/** The core is the orb minus its 12 % ring of breathing room on each side. */
const CORE_FILL = 0.76;

/**
 * The disc the rocket sits on, per state. Dark glass lit from above by the rocket's own blue — one hue at every live
 * state; idle goes neutral and error red. (The old core was a blue gradient: the blue rocket would vanish on it.)
 */
const LIVE_DISC = 'bg-[radial-gradient(circle_at_50%_28%,rgb(var(--app-accent)/0.42),rgb(var(--app-accent-deep)/0.2)_48%,rgb(8_12_20/0.96)_78%)] ring-app-accent/45';
const CORE_TONE: Record<LiveOrbState, string> = {
  idle: 'bg-app-elevated ring-white/10',
  connecting: 'bg-[radial-gradient(circle_at_50%_28%,rgb(var(--app-accent)/0.22),rgb(8_12_20/0.96)_74%)] ring-app-accent/25',
  listening: LIVE_DISC,
  thinking: LIVE_DISC,
  speaking: LIVE_DISC,
  error: 'bg-[radial-gradient(circle_at_50%_28%,rgb(var(--app-danger)/0.3),rgb(8_12_20/0.96)_74%)] ring-app-danger/40',
};
/** The rocket itself dims when nothing is live, and loses its colour on an error. */
const ROCKET_TONE: Record<LiveOrbState, string> = {
  idle: 'opacity-60',
  connecting: 'opacity-80',
  listening: '',
  thinking: '',
  speaking: '',
  error: 'opacity-50 grayscale',
};

const HALO_TONE: Record<LiveOrbState, string> = {
  idle: 'bg-transparent',
  connecting: 'bg-app-accent/10',
  listening: 'bg-app-accent/20',
  thinking: 'bg-app-accent/20',
  speaking: 'bg-app-accent/20',
  error: 'bg-app-danger/10',
};

export default function LiveOrb({ state, getLevels, size = 208, label, backdrop = false, className = '' }: LiveOrbProps) {
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
  // The rocket's rendered width in CSS px: `sizes` lets the browser take the 256 px raster for the dock and the 512 px
  // one for the full call on a 3x screen — crisp at both ends without shipping 512 px to a 40 px orb.
  const rocketPx = Math.max(16, Math.round(size * CORE_FILL * ROCKET_FILL));

  return (
    <div
      role="img"
      aria-label={label}
      data-state={state}
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {backdrop && (
        // Centred on the orb, so it follows the orb wherever the call's layout puts it; at most 92 % of the screen's
        // width, so the rocket is always whole — a background, never a cropped photo. Static: nothing to reduce.
        <div
          aria-hidden
          data-testid="live-orb-backdrop"
          className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2"
        >
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(var(--app-accent-deep)/0.26)_0%,rgb(var(--app-accent-deep)/0.08)_42%,transparent_68%)]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LIVE_ROCKET_SRC}
            alt=""
            width={512}
            height={512}
            decoding="async"
            draggable={false}
            className="absolute inset-[6%] h-[88%] w-[88%] select-none object-contain opacity-[0.07]"
          />
        </div>
      )}
      {/* The one halo: a blurred disc of the accent that breathes with the voice. */}
      <div
        ref={haloRef}
        aria-hidden
        className={`absolute inset-0 rounded-full blur-3xl transition-colors duration-300 ${HALO_TONE[state]}`}
        style={{ willChange: animated ? 'transform' : undefined }}
      />
      {/* Arc: a quarter ring that turns while connecting / thinking. */}
      <div
        ref={ringRef}
        aria-hidden
        className={`absolute -inset-1.5 rounded-full border-2 border-transparent transition-opacity duration-300 ${showArc ? 'border-t-app-accent/80 opacity-100' : 'opacity-0'}`}
        style={{ willChange: animated && showArc ? 'transform' : undefined }}
      />
      {/* Core: the dark glass disc with the rocket on it. No shadow — the halo is the only glow. */}
      <div
        ref={coreRef}
        aria-hidden
        className={`absolute inset-[12%] overflow-hidden rounded-full ring-1 transition-colors duration-300 ${CORE_TONE[state]}`}
        style={{ willChange: animated ? 'transform' : undefined }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LIVE_ROCKET_SRC}
          srcSet={LIVE_ROCKET_SRCSET}
          sizes={`${rocketPx}px`}
          alt=""
          width={512}
          height={512}
          decoding="async"
          draggable={false}
          data-testid="live-orb-rocket"
          className={`absolute inset-[15%] h-[70%] w-[70%] select-none object-contain transition-opacity duration-300 ${ROCKET_TONE[state]}`}
        />
      </div>
    </div>
  );
}

// ─── Waveform ──────────────────────────────────────────────────────────────────

/** Resting bar heights (also the still waveform under reduced motion): a symmetric "voice" silhouette. */
export const WAVE_REST = [0.35, 0.6, 0.9, 0.6, 0.35] as const;
/** How much each bar follows the level: the middle moves most, like a voice meter. */
const WAVE_GAIN = [0.45, 0.75, 1, 0.75, 0.45] as const;

/** The level the bars follow: the user while listening, the model while speaking, nothing otherwise. */
export function waveLevel(state: LiveOrbState, levels: LiveLevels): number {
  if (state === 'listening') return Math.min(1, Math.max(0, levels.input));
  if (state === 'speaking') return Math.min(1, Math.max(0, levels.output));
  return 0;
}

export interface LiveWaveformProps {
  state: LiveOrbState;
  getLevels?: () => LiveLevels;
  /** 16 px tall with thinner bars — the status line and the dock. */
  compact?: boolean;
  className?: string;
}

export function LiveWaveform({ state, getLevels, compact = false, className = '' }: LiveWaveformProps) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const levelsRef = useRef(getLevels);
  levelsRef.current = getLevels;
  const reduced = usePrefersReducedMotion();
  const animated = !reduced && (state === 'listening' || state === 'speaking' || state === 'thinking' || state === 'connecting');

  useEffect(() => {
    const bars = barsRef.current;
    // Same string as the initial inline style, so React and the loop never disagree about the resting shape.
    const rest = () => bars.forEach((b, i) => { if (b) b.style.transform = `scaleY(${WAVE_REST[i] ?? 0.5})`; });
    if (!animated || typeof requestAnimationFrame !== 'function') { rest(); return undefined; }
    let raf = 0;
    let eased = 0;
    const tick = (ts: number) => {
      let levels = ZERO;
      try { levels = levelsRef.current?.() ?? ZERO; } catch { levels = ZERO; }
      const target = waveLevel(stateRef.current, levels);
      eased += (target - eased) * (target > eased ? 0.5 : 0.18);
      bars.forEach((b, i) => {
        if (!b) return;
        // A slow per-bar sway keeps the bars "fluid" rather than a single bar graph jumping in unison.
        const sway = 0.08 * Math.sin(ts / 180 + i * 1.3);
        const h = Math.min(1, Math.max(0.12, 0.28 + sway + eased * (WAVE_GAIN[i] ?? 0.5)));
        b.style.transform = `scaleY(${h.toFixed(3)})`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); rest(); };
  }, [animated]);

  return (
    <span aria-hidden data-state={state} className={`flex items-center justify-center ${compact ? 'h-4 gap-[2px]' : 'h-6 gap-[3px]'} ${className}`}>
      {WAVE_REST.map((h, i) => (
        <span
          key={i}
          ref={(el) => { barsRef.current[i] = el; }}
          className={`h-full ${compact ? 'w-[2px]' : 'w-[3px]'} origin-center rounded-full bg-app-accent`}
          style={{ transform: `scaleY(${h})`, willChange: animated ? 'transform' : undefined }}
        />
      ))}
    </span>
  );
}
