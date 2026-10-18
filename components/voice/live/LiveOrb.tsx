'use client';

/**
 * LiveOrb — the Live call's one visual signal: the agent's logo, and nothing else, pulsing by status (the owner's PRD of
 * 2026-10-18, 2.5: „ლაივ ხმოვანი რეჟიმის გახსნისას ეკრანზე უნდა იყოს მხოლოდ აგენტის ლოგო, რომელსაც ექნება იმპულსური
 * ფეთქვის (პულსაციის) ანიმაცია სტატუსების მიხედვით“). The logo is the owner's own image, the rocket in a glowing blue
 * sphere, cut out by design/brand/agent-orb/extract.py and never redrawn. How it pulses says what the call is doing:
 *
 *   · connecting — a slow breath (one swell every 1.6 s): the call is on its way;
 *   · listening  — it swells with the USER's voice;
 *   · thinking   — a heartbeat, two quick beats and a rest: the agent is working;
 *   · speaking   — it swells with the AGENT's voice;
 *   · idle       — still and dimmed; error — still, dimmed and grey.
 *
 * Both the Gemini Live call and the ElevenLabs fallback (VoiceConversation) draw this orb, and the dock draws it small,
 * so every user sees the same agent at every size. It replaced the rocket on a dark disc, the arc that turned around it
 * and the large faint rocket behind it: the PRD asks for the logo alone.
 * LiveWaveform — the five accent bars in the dock, driven by the same levels.
 *
 * Performance contract: one requestAnimationFrame loop per component that writes `transform` on refs — no React state
 * per frame, no layout properties, nothing that re-renders the call screen 60 times a second. The loop only runs in the
 * animated states and stops entirely under prefers-reduced-motion: a user who asked the OS for less motion gets a still
 * logo, and the call's status line (read to screen readers) still says who is talking.
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

/** One breath while connecting: a 1.6 s cycle … */
export const CONNECT_BREATH_MS = 1600;

/** The breath at time `ts` (ms), 0..1: a cosine, so it starts and ends at rest and has no edge to snap on. */
export function connectBreath(ts: number): number {
  if (!Number.isFinite(ts)) return 0;
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * ts) / CONNECT_BREATH_MS);
}

/** The heartbeat while thinking: two quick beats and a rest, every 1.1 s. */
export const THINK_BEAT_MS = 1100;

/** The beat at time `ts` (ms), 0..1: a strong beat, a softer one a quarter of a second later, then rest. */
export function thinkBeat(ts: number): number {
  if (!Number.isFinite(ts)) return 0;
  const p = ((ts % THINK_BEAT_MS) + THINK_BEAT_MS) % THINK_BEAT_MS;
  const beat = (at: number, width: number) => Math.exp(-(((p - at) / width) ** 2));
  return Math.min(1, beat(90, 55) + 0.6 * beat(330, 60));
}

/** How far into its pulse the logo is in a state (0..1): the voice it follows, or its own rhythm. */
export function orbTarget(state: LiveOrbState, levels: LiveLevels, ts: number): number {
  switch (state) {
    case 'listening':
      return Math.min(1, Math.max(0, levels.input));
    case 'speaking':
      // A small floor so the logo visibly "talks" through the quiet gaps between syllables.
      return Math.min(1, Math.max(0.06, levels.output));
    case 'thinking':
      return thinkBeat(ts);
    case 'connecting':
      return connectBreath(ts);
    default:
      return 0;
  }
}

/** How much a full pulse swells the logo, per state: the voice moves it most, the call's own rhythms gently. */
export const PULSE_DEPTH: Record<LiveOrbState, number> = {
  idle: 0,
  connecting: 0.06,
  listening: 0.14,
  thinking: 0.07,
  speaking: 0.18,
  error: 0,
};

/** The logo's scale for a pulse (0..1) in a state. */
export function orbScale(state: LiveOrbState, pulse: number): number {
  const p = Number.isFinite(pulse) ? Math.min(1, Math.max(0, pulse)) : 0;
  return 1 + PULSE_DEPTH[state] * p;
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
  /** Width and height in CSS px (the logo's glow included). */
  size?: number;
  /** Accessible name, e.g. the localized status ("Listening"). */
  label?: string;
  className?: string;
}

/** The agent's logo, transparent around its glow (design/brand/agent-orb/extract.py — never redrawn). */
export const LIVE_LOGO_SRC = '/brand/agent-orb-512.webp';
const LIVE_LOGO_SRCSET = '/brand/agent-orb-256.webp 256w, /brand/agent-orb-512.webp 512w';

/** The logo rests dimmed when nothing is live and loses its colour on an error; live, it is shown in full. */
const LOGO_TONE: Record<LiveOrbState, string> = {
  idle: 'opacity-60',
  connecting: 'opacity-80',
  listening: '',
  thinking: '',
  speaking: '',
  error: 'opacity-50 grayscale',
};

/** One soft halo of the accent under the logo, which swells with it. */
const HALO_TONE: Record<LiveOrbState, string> = {
  idle: 'bg-transparent',
  connecting: 'bg-app-accent/10',
  listening: 'bg-app-accent/20',
  thinking: 'bg-app-accent/20',
  speaking: 'bg-app-accent/20',
  error: 'bg-transparent',
};

export default function LiveOrb({ state, getLevels, size = 208, label, className = '' }: LiveOrbProps) {
  const haloRef = useRef<HTMLDivElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const levelsRef = useRef(getLevels);
  levelsRef.current = getLevels;
  const reduced = usePrefersReducedMotion();
  const animated = !reduced && state !== 'idle' && state !== 'error';

  useEffect(() => {
    const halo = haloRef.current;
    const logo = logoRef.current;
    const reset = () => {
      if (halo) halo.style.transform = 'translateZ(0) scale(1)';
      if (logo) logo.style.transform = 'translateZ(0) scale(1)';
    };
    if (!animated || typeof requestAnimationFrame !== 'function') { reset(); return undefined; }

    let raf = 0;
    let eased = 0;
    const tick = (ts: number) => {
      const st = stateRef.current;
      let levels = ZERO;
      try { levels = levelsRef.current?.() ?? ZERO; } catch { levels = ZERO; }
      const target = orbTarget(st, levels, ts);
      // A voice pops on and settles off (fast attack, slow release); the call's own rhythms are followed closely, so a
      // heartbeat keeps its two beats.
      const rhythm = st === 'thinking' || st === 'connecting';
      eased += (target - eased) * (target > eased ? 0.5 : rhythm ? 0.35 : 0.14);
      if (logo) logo.style.transform = `translateZ(0) scale(${orbScale(st, eased).toFixed(4)})`;
      if (halo) halo.style.transform = `translateZ(0) scale(${(1 + eased * 0.5).toFixed(4)})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); reset(); };
  }, [animated]);

  return (
    <div
      role="img"
      aria-label={label}
      data-state={state}
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* The one halo: a blurred disc of the accent under the sphere, swelling with the pulse. */}
      <div
        ref={haloRef}
        aria-hidden
        data-testid="live-orb-halo"
        className={`absolute inset-[18%] rounded-full blur-2xl transition-colors duration-300 ${HALO_TONE[state]}`}
        style={{ willChange: animated ? 'transform' : undefined }}
      />
      {/* The logo itself: whole at every size (object-contain), the raster the pixels need (`sizes`). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={logoRef}
        src={LIVE_LOGO_SRC}
        srcSet={LIVE_LOGO_SRCSET}
        sizes={`${Math.max(16, Math.round(size))}px`}
        alt=""
        width={512}
        height={512}
        decoding="async"
        draggable={false}
        data-testid="live-orb-logo"
        className={`absolute inset-0 h-full w-full select-none object-contain transition-opacity duration-300 ${LOGO_TONE[state]}`}
        style={{ willChange: animated ? 'transform' : undefined }}
      />
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
