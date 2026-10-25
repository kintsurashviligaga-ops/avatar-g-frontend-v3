'use client';

/**
 * LiveOrb — the Live call's one visual signal. It swells with the USER's voice while listening and with the MODEL's
 * voice while speaking, turns a slow arc while thinking, and goes still on error. While CONNECTING the orb
 * breathes (scale and opacity within 3 %, one 2 s cycle) and the arc around it runs over a faint track, growing with
 * the time spent connecting — the wait reads as progress, not as a frozen screen. The docked call (LiveDock) draws it;
 * the full call screens draw the voice pill (LiveCallChrome's LiveVoicePill) instead.
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
 * ⚠️ NO ROCKET (the owner's P0 correction task, 2026-10-24). From 2026-10-03 this orb carried the transparent rocket on
 * a dark disc, and `backdrop` drew the same rocket large and faint behind the call. The owner retired that look from
 * every Live state: the core is now the approved call screen's blue (LiveCallChrome's LIVE_PILL_STYLE, the voice pill's
 * gradient) with the white waveform in it, and there is no backdrop. Only the dock still draws this orb.
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
    case 'thinking':
      return 0.05 + 0.04 * Math.sin(ts / 260);
    // Connecting has no voice to follow: the orb breathes instead (connectBreath, applied on top in the loop).
    default:
      return 0;
  }
}

/** One breath while connecting (docs/voice/LIVE_ACTIONS.md, "The screen"): a 2 s cycle … */
export const CONNECT_BREATH_MS = 2000;
/** … that swells the orb and lifts its opacity by at most 3 % — alive, never pulsing (DESIGN.md §5/§6). */
export const CONNECT_BREATH_DEPTH = 0.03;

/** The breath at time `ts` (ms), 0..1: a cosine, so it starts and ends at rest and has no edge to snap on. */
export function connectBreath(ts: number): number {
  if (!Number.isFinite(ts)) return 0;
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * ts) / CONNECT_BREATH_MS);
}

const CONNECT_ARC_MIN = 0.1;
const CONNECT_ARC_MAX = 0.92;
const CONNECT_ARC_TAU_MS = 3000;

/**
 * How much of the ring the arc covers while connecting (0..1), from the time spent connecting: a tenth at once, fast
 * at first and slower after (63 % of the way in 3 s), held at 92 % until the call is up — the product's elapsed ÷ cap
 * progress (DESIGN.md §8, ResultCard). A connect that takes a while visibly advances instead of spinning in place.
 */
export function connectProgress(elapsedMs: number): number {
  const e = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  return Math.min(CONNECT_ARC_MAX, CONNECT_ARC_MIN + (CONNECT_ARC_MAX - CONNECT_ARC_MIN) * (1 - Math.exp(-e / CONNECT_ARC_TAU_MS)));
}

/** The arc's length while thinking, and under reduced motion (a still spinner): a quarter of the ring. */
const ARC_REST = 0.25;
const dash = (fraction: number) => `${(fraction * 100).toFixed(1)} 100`;

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
  className?: string;
}

/**
 * The disc per state: the approved voice pill's blue at every live state (one hue), quieter while connecting, neutral
 * when idle, red on an error.
 */
const LIVE_DISC = 'bg-[linear-gradient(135deg,#1d4ed8_0%,#2563eb_50%,#38bdf8_100%)] ring-sky-300/40';
const CORE_TONE: Record<LiveOrbState, string> = {
  idle: 'bg-app-elevated ring-white/10',
  connecting: 'bg-[linear-gradient(135deg,#1d4ed8_0%,#2563eb_50%,#38bdf8_100%)] opacity-80 ring-sky-300/25',
  listening: LIVE_DISC,
  thinking: LIVE_DISC,
  speaking: LIVE_DISC,
  error: 'bg-[radial-gradient(circle_at_50%_28%,rgb(var(--app-danger)/0.3),rgb(8_12_20/0.96)_74%)] ring-app-danger/40',
};

const HALO_TONE: Record<LiveOrbState, string> = {
  idle: 'bg-transparent',
  connecting: 'bg-app-accent/10',
  listening: 'bg-app-accent/20',
  thinking: 'bg-app-accent/20',
  speaking: 'bg-app-accent/20',
  error: 'bg-app-danger/10',
};

export default function LiveOrb({ state, getLevels, size = 208, label, className = '' }: LiveOrbProps) {
  const haloRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const arcRef = useRef<SVGCircleElement | null>(null);
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
    const arc = arcRef.current;
    const core = coreRef.current;
    const reset = () => {
      if (halo) halo.style.transform = 'translateZ(0) scale(1)';
      if (core) { core.style.transform = 'translateZ(0) scale(1)'; core.style.opacity = ''; }
      if (ring) ring.style.transform = 'rotate(0deg)';
      if (arc) arc.setAttribute('stroke-dasharray', dash(ARC_REST));
    };
    if (!animated || typeof requestAnimationFrame !== 'function') { reset(); return undefined; }

    let raf = 0;
    let eased = 0;
    let angle = 0;
    let last = -1;
    // How much of the connecting breath applies (0..1). It eases in and out with the state, so arriving at
    // "listening" mid-breath settles over a few frames instead of snapping back 3 %.
    let breathWeight = 0;
    let connectSince = -1;
    let arcDash = '';
    const tick = (ts: number) => {
      const dt = last < 0 ? 16 : Math.min(64, ts - last);
      last = ts;
      const st = stateRef.current;
      let levels = ZERO;
      try { levels = levelsRef.current?.() ?? ZERO; } catch { levels = ZERO; }
      const target = orbTarget(st, levels, ts);
      // Fast attack, slow release: syllables pop, silence settles instead of snapping shut.
      eased += (target - eased) * (target > eased ? 0.45 : 0.14);
      breathWeight += ((st === 'connecting' ? 1 : 0) - breathWeight) * 0.12;
      const breathing = breathWeight > 0.001;
      const breath = breathing ? connectBreath(ts) * breathWeight : 0;
      const swell = 1 + CONNECT_BREATH_DEPTH * breath;
      if (core) {
        core.style.transform = `translateZ(0) scale(${((1 + eased * 0.22) * swell).toFixed(4)})`;
        // At rest the disc sits 3 % down and breathes up to full; outside a connect the style is left alone.
        core.style.opacity = breathing ? (1 - CONNECT_BREATH_DEPTH * breathWeight + CONNECT_BREATH_DEPTH * breath).toFixed(4) : '';
      }
      if (halo) halo.style.transform = `translateZ(0) scale(${((1 + eased * 0.7) * swell).toFixed(4)})`;
      if (st === 'connecting') {
        if (connectSince < 0) connectSince = ts;
      } else {
        connectSince = -1;
      }
      if (ring && (st === 'thinking' || st === 'connecting')) {
        // One turn per breath while connecting (2 s), faster while thinking.
        angle = (angle + dt * (st === 'thinking' ? 0.24 : 360 / CONNECT_BREATH_MS)) % 360;
        ring.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      }
      if (arc) {
        const next = dash(st === 'connecting' ? connectProgress(ts - connectSince) : ARC_REST);
        if (next !== arcDash) { arc.setAttribute('stroke-dasharray', next); arcDash = next; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); reset(); };
  }, [animated]);

  const showArc = state === 'thinking' || state === 'connecting';
  // The arc is 2 px at every size: the ring box is the orb plus 6 px each side, drawn in a 100-unit viewBox.
  const arcStroke = Math.round((2 * 100 * 1000) / (size + 12)) / 1000;
  const arcRadius = Math.round((50 - arcStroke / 2) * 1000) / 1000;
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
      {/* Arc: turns while connecting / thinking. Connecting, it runs over a faint track and grows with the time spent
          connecting (connectProgress), so the wait shows progress; thinking, it is a quarter ring. Still under reduced
          motion (a quarter, on the track while connecting). One hue: the accent and a faint accent track. */}
      <div
        ref={ringRef}
        aria-hidden
        data-testid="live-orb-arc"
        className={`absolute -inset-1.5 rounded-full transition-opacity duration-300 ${showArc ? 'opacity-100' : 'opacity-0'}`}
        style={{ willChange: animated && showArc ? 'transform' : undefined }}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90 overflow-visible" fill="none">
          <circle
            cx="50"
            cy="50"
            r={arcRadius}
            strokeWidth={arcStroke}
            className={`stroke-app-accent/15 transition-opacity duration-300 ${state === 'connecting' ? 'opacity-100' : 'opacity-0'}`}
          />
          <circle
            ref={arcRef}
            cx="50"
            cy="50"
            r={arcRadius}
            strokeWidth={arcStroke}
            pathLength={100}
            strokeDasharray={dash(ARC_REST)}
            strokeLinecap="round"
            className="stroke-app-accent/80"
          />
        </svg>
      </div>
      {/* Core: the blue disc with the white waveform in it. No shadow — the halo is the only glow. */}
      <div
        ref={coreRef}
        aria-hidden
        data-testid="live-orb-core"
        className={`absolute inset-[12%] flex items-center justify-center overflow-hidden rounded-full ring-1 transition-colors duration-300 ${CORE_TONE[state]}`}
        style={{ willChange: animated ? 'transform' : undefined }}
      >
        <LiveWaveform compact state={state} getLevels={getLevels} className="[&_span]:bg-white" />
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
