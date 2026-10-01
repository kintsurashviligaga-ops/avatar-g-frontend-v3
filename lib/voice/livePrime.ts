'use client';

/**
 * lib/voice/livePrime.ts — start Live's audio INSIDE the user's tap.
 *
 * The Live screen mounts from ChatChrome via `dynamic()` and connects in a mount effect — after the tap's user
 * activation is spent. On iOS/Safari an AudioContext created or resumed outside a gesture stays 'suspended' (a call
 * that connects and is silent), and a slow chunk load stretches the gap. So the Live button calls `primeLive()`
 * SYNCHRONOUSLY in its click handler, before dispatching `myavatar:voice-open`: it asks other mic holders to release,
 * creates + resumes the playback AudioContext and starts mic acquisition while the gesture is live. The Live session
 * then adopts both with `takePrimed()` (a stale or missing prime just means it creates its own, as before).
 *
 * CONTRACT (callers depend only on these exports):
 *   primeLive(): void                                  — call synchronously in the click handler; never throws.
 *   takePrimed(maxAgeMs?): PrimedLive | null           — one-shot: returns the fresh prime and clears the slot.
 *   disposePrimed(p): void                             — release a prime nobody adopted.
 *
 * The prime's mic is ONE plain getUserMedia with the ladder's first-rung constraints. If it fails, the session feeds
 * the rejection into lib/voice/micAcquire.ts, which classifies it and continues the ladder from there.
 */
import { MIC_CONSTRAINTS } from './micAcquire';
import { requestMicRelease } from './micBus';

export interface PrimedLive {
  /** The playback context, created and resumed inside the gesture (null when the engine refused to create one). */
  playCtx: AudioContext | null;
  /** The mic acquisition started inside the gesture. Settles with the stream, or rejects with the DOMException. */
  mic: Promise<MediaStream> | null;
  /** performance.now()/Date.now() when primed. */
  at: number;
}

/**
 * An unclaimed prime is disposed after this long. The Live screen normally adopts it within a second or two; one that
 * never mounts (ChatChrome fell back to another voice tier, the user navigated away) must not keep the mic hot — the
 * browser's recording indicator would stay on with nobody listening.
 */
export const PRIME_TTL_MS = 15_000;

let slot: PrimedLive | null = null;
let ttlTimer: ReturnType<typeof setTimeout> | null = null;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function clearTtl(): void {
  if (ttlTimer) { clearTimeout(ttlTimer); ttlTimer = null; }
}

/** Synchronous, gesture-safe. Never throws. */
export function primeLive(): void {
  if (typeof window === 'undefined') return;
  try {
    // Drop an older prime that nobody took (its mic tracks must not stay hot).
    const stale = slot;
    slot = null;
    clearTtl();
    if (stale) disposePrimed(stale);

    requestMicRelease('live');

    let playCtx: AudioContext | null = null;
    try {
      const Ctx = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        playCtx = new Ctx();
        void playCtx.resume().catch(() => {});
      }
    } catch {
      playCtx = null;
    }

    let mic: Promise<MediaStream> | null = null;
    try {
      // Insecure pages and in-app browsers have no mediaDevices: leave `mic` null and let the session's preflight
      // name the reason (mic_insecure / mic_in_app) instead of surfacing a bare TypeError.
      const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
      if (window.isSecureContext !== false && md && typeof md.getUserMedia === 'function') {
        mic = md.getUserMedia(MIC_CONSTRAINTS.full);
        mic.catch(() => {}); // the session re-classifies the rejection; never an unhandled rejection here
      }
    } catch {
      mic = null;
    }

    const primed: PrimedLive = { playCtx, mic, at: now() };
    slot = primed;
    ttlTimer = setTimeout(() => {
      ttlTimer = null;
      if (slot !== primed) return;
      slot = null;
      disposePrimed(primed);
    }, PRIME_TTL_MS);
  } catch {
    /* never throws: a failed prime only means the session creates its own */
  }
}

/** One-shot adoption. A prime older than `maxAgeMs` is disposed and null is returned. */
export function takePrimed(maxAgeMs = 10_000): PrimedLive | null {
  const p = slot;
  slot = null;
  clearTtl();
  if (!p) return null;
  if (now() - p.at > maxAgeMs) {
    disposePrimed(p);
    return null;
  }
  return p;
}

/** Release a prime nobody adopted: stop its mic tracks, close its context. */
export function disposePrimed(p: PrimedLive): void {
  try { void p.mic?.then((s) => s.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } })).catch(() => {}); } catch { /* noop */ }
  try { void p.playCtx?.close().catch(() => {}); } catch { /* noop */ }
}
