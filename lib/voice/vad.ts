/**
 * vad.ts — a PURE, dependency-free voice-activity / endpointing reducer for the real-time
 * voice node. It turns a stream of RMS energy samples (0..1) + timestamps into speech events:
 * onset, endpoint, max-utterance, and barge-onset (the user talking over the assistant).
 *
 * Design notes (why it looks like this):
 *  - Timing is MILLISECOND-based via caller-supplied `nowMs` (performance.now()), never frame
 *    counts — a 50ms interval and a throttled background tab both stay correct.
 *  - An adaptive noise floor tracks the room, but ONLY while idle, not while the assistant is
 *    speaking, and not inside the per-chunk grace window — so TTS bleed / active speech can't
 *    pull the floor up and deafen the detector.
 *  - Barge detection reuses the SAME reducer with a stricter config (`bargeConfig`): a higher
 *    onset multiplier so the assistant's own audio doesn't self-trigger an interrupt.
 *  - No Web Audio / DOM imports → fully unit-testable in Node.
 */

export type VadEvent = 'none' | 'onset' | 'endpoint' | 'max-utterance' | 'barge-onset';
export type VadPhase = 'idle' | 'speech';

export interface VadConfig {
  /** Sustained ms above the onset threshold before speech `onset` fires (debounces clicks). */
  onsetMs: number;
  /** Sustained ms below the onset threshold before `endpoint` fires (end-of-utterance pause). */
  hangoverMs: number;
  /** Minimum voiced duration for a turn to be worth sending to the network (commit gate). */
  minSpeechMs: number;
  /** Hard cap: force an endpoint so a noisy room can't hold the mic open forever. */
  maxUtteranceMs: number;
  /** onset threshold = max(absOnsetFloor, floor * onsetMult) while listening. */
  onsetMult: number;
  /** onset multiplier used while the assistant is speaking (barge detection — stricter). */
  bargeMult: number;
  /** Sustained ms above the barge threshold before `barge-onset` fires. */
  bargeOnsetMs: number;
  /** EMA weight for the adaptive noise floor (0..1). */
  floorAttack: number;
  floorMin: number;
  floorMax: number;
  /** Absolute lower bound on the onset threshold (so a dead-quiet room can't set the bar at 0). */
  absOnsetFloor: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  onsetMs: 140,
  hangoverMs: 850,
  minSpeechMs: 300,
  maxUtteranceMs: 15_000,
  onsetMult: 3.2,
  // Master Contract V5 — barge-in desensitised (4.5→5.5): the user must OVER-talk the assistant's
  // playback more clearly to interrupt, so ambient noise / echo / the assistant's own leaked audio no
  // longer trip a false barge. Barge is already hard-gated to status==='speaking' (never during
  // 'thinking'); this only raises the amplitude bar for a genuine interruption.
  bargeMult: 5.5,
  bargeOnsetMs: 140,
  floorAttack: 0.08,
  floorMin: 0.006,
  floorMax: 0.05,
  absOnsetFloor: 0.015,
};

/** Stricter config for barge-in: the assistant's audio must be clearly overtalked. */
export function bargeConfig(base: VadConfig = DEFAULT_VAD_CONFIG): VadConfig {
  return { ...base, onsetMult: base.bargeMult, onsetMs: base.bargeOnsetMs };
}

export interface VadState {
  phase: VadPhase;
  floor: number;
  /** When rms first crossed the onset threshold (for onset/barge sustain), else null. */
  aboveSinceMs: number | null;
  /** When rms first dropped below the onset threshold in-utterance (for hangover), else null. */
  belowSinceMs: number | null;
  /** Accumulated voiced time in the current utterance (drives the commit gate). */
  voicedMs: number;
  utteranceStartMs: number | null;
  lastMs: number | null;
}

export function createVadState(floor = 0.008): VadState {
  return {
    phase: 'idle',
    floor: Math.max(0, floor),
    aboveSinceMs: null,
    belowSinceMs: null,
    voicedMs: 0,
    utteranceStartMs: null,
    lastMs: null,
  };
}

export function onsetThreshold(floor: number, cfg: VadConfig): number {
  return Math.max(cfg.absOnsetFloor, floor * cfg.onsetMult);
}

export interface StepOpts {
  /** True while the assistant's TTS is playing → only barge detection runs (state gate). */
  assistantSpeaking: boolean;
  /** performance.now() before which barge/floor updates are suppressed (per-chunk grace). */
  graceUntilMs: number;
  cfg: VadConfig;
}

/**
 * Advance the VAD by one sample. Deterministic given (prev, rms, nowMs, opts) — the single
 * unit of behaviour the tests pin down.
 */
export function stepVad(
  prev: VadState,
  rmsIn: number,
  nowMs: number,
  opts: StepOpts,
): { state: VadState; event: VadEvent } {
  const cfg = opts.cfg;
  const rms = Number.isFinite(rmsIn) ? Math.max(0, Math.min(1, rmsIn)) : 0;
  const dtMs = prev.lastMs == null ? 0 : Math.max(0, nowMs - prev.lastMs);
  const s: VadState = { ...prev, lastMs: nowMs };
  const onset = onsetThreshold(s.floor, cfg);

  // Adaptive floor — only when genuinely idle, the assistant is silent, past the per-chunk grace
  // window, AND the sample is truly sub-onset ambient (rms < onset). Adapting while rms ≥ onset —
  // i.e. during the onset-debounce window, when the user is already speaking but phase is still
  // 'idle' — would let the floor CHASE the speech and lift the bar above it, so a soft/normal
  // speaker never crosses onset: permanently, silently deaf. TTS bleed / active speech are also
  // excluded (assistantSpeaking / phase gates).
  if (s.phase === 'idle' && !opts.assistantSpeaking && nowMs >= opts.graceUntilMs && rms < onset) {
    s.floor = Math.max(cfg.floorMin, Math.min(cfg.floorMax, s.floor * (1 - cfg.floorAttack) + rms * cfg.floorAttack));
  }

  // ── Barge detection (assistant is speaking): stricter, and suppressed during grace ──
  if (opts.assistantSpeaking) {
    // Suppress barge during the per-chunk grace (masks the BufferSource attack transient), but
    // DON'T discard a steady overtalker's accumulating sustain across the chunk boundary.
    if (nowMs < opts.graceUntilMs) {
      return { state: s, event: 'none' };
    }
    if (rms >= onset) {
      if (s.aboveSinceMs == null) s.aboveSinceMs = nowMs;
      if (nowMs - s.aboveSinceMs >= cfg.onsetMs) {
        s.aboveSinceMs = null;
        return { state: s, event: 'barge-onset' };
      }
    } else {
      s.aboveSinceMs = null;
    }
    return { state: s, event: 'none' };
  }

  // ── Normal onset detection while idle ──
  if (s.phase === 'idle') {
    if (rms >= onset) {
      if (s.aboveSinceMs == null) s.aboveSinceMs = nowMs;
      if (nowMs - s.aboveSinceMs >= cfg.onsetMs) {
        s.phase = 'speech';
        // Credit the sustain that PROVED the onset (~onsetMs). Zeroing here undercounts every
        // utterance by the debounce window, so genuine short words ("კი"/"არა"/"yes"/"да", ~300–450ms)
        // fall under the minSpeech commit gate and get silently dropped.
        s.voicedMs = nowMs - s.aboveSinceMs;
        s.aboveSinceMs = null;
        s.belowSinceMs = null;
        s.utteranceStartMs = nowMs;
        return { state: s, event: 'onset' };
      }
    } else {
      s.aboveSinceMs = null;
    }
    return { state: s, event: 'none' };
  }

  // ── In an utterance: accumulate voiced time, watch for the trailing-silence endpoint ──
  if (rms >= onset) {
    s.voicedMs += dtMs;
    s.belowSinceMs = null;
  } else {
    if (s.belowSinceMs == null) s.belowSinceMs = nowMs;
    if (nowMs - s.belowSinceMs >= cfg.hangoverMs) {
      return { state: s, event: 'endpoint' };
    }
  }

  if (s.utteranceStartMs != null && nowMs - s.utteranceStartMs >= cfg.maxUtteranceMs) {
    return { state: s, event: 'max-utterance' };
  }

  return { state: s, event: 'none' };
}

/** Gate before spending network on a turn: enough real speech AND a non-trivial blob. */
export function shouldCommit(voicedMs: number, byteLen: number, cfg: VadConfig, minBytes = 512): boolean {
  return voicedMs >= cfg.minSpeechMs && byteLen > minBytes;
}

/** File extension matching the recorded container — iOS Safari records mp4, not webm. */
export function extForMime(mime: string): 'webm' | 'mp4' | 'm4a' | 'mp3' | 'wav' {
  if (/mp4/i.test(mime)) return 'mp4';
  if (/aac/i.test(mime)) return 'm4a';
  if (/mpeg|mp3/i.test(mime)) return 'mp3';
  if (/wav/i.test(mime)) return 'wav';
  return 'webm';
}
