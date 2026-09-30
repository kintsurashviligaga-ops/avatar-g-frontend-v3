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

/** One hue at every live state; only idle (grey) and error (red) leave it. */
const LIVE_TONE = 'from-app-accent via-cyan-500 to-cyan-dim';
const CORE_TONE: Record<LiveOrbState, string> = {
  idle: 'from-app-muted/40 to-app-muted/20',
  connecting: 'from-app-accent/70 via-cyan-500/60 to-cyan-dim/70',
  listening: LIVE_TONE,
  thinking: LIVE_TONE,
  speaking: LIVE_TONE,
  error: 'from-app-danger/70 to-app-danger/40',
};

const HALO_TONE: Record<LiveOrbState, string> = {
  idle: 'bg-transparent',
  connecting: 'bg-app-accent/10',
  listening: 'bg-app-accent/20',
  thinking: 'bg-app-accent/20',
  speaking: 'bg-app-accent/20',
  error: 'bg-app-danger/10',
};

export default function LiveOrb({ state, getLevels, size = 208, imageUrl, label, className = '' }: LiveOrbProps) {
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
      {/* Core: the orb itself (or the user's avatar inside it). No shadow — the halo is the only glow. */}
      <div
        ref={coreRef}
        aria-hidden
        className={`absolute inset-[12%] overflow-hidden rounded-full bg-gradient-to-br ring-1 ring-white/10 transition-colors duration-300 ${CORE_TONE[state]}`}
        style={{ willChange: animated ? 'transform' : undefined }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="h-full w-full rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        )}
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
  className?: string;
}

export function LiveWaveform({ state, getLevels, className = '' }: LiveWaveformProps) {
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
    <span aria-hidden data-state={state} className={`flex h-6 items-center justify-center gap-[3px] ${className}`}>
      {WAVE_REST.map((h, i) => (
        <span
          key={i}
          ref={(el) => { barsRef.current[i] = el; }}
          className="h-full w-[3px] origin-center rounded-full bg-app-accent"
          style={{ transform: `scaleY(${h})`, willChange: animated ? 'transform' : undefined }}
        />
      ))}
    </span>
  );
}
