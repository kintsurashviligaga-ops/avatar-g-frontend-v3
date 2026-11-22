/**
 * lib/services/montage/smart/price.ts — what the Smart Editor costs. Pure, client-safe. GG-approved 2026-11-15:
 *
 *   D1  auto-captions (Chirp 3):        ✦2 per STARTED minute of audio sent (min ✦2), charged after delivery
 *   D2  silence + filler removal:       FREE (pure ffmpeg silencedetect on our server; ≈ $0.002 CPU per minute)
 *   D3  optional "AI watches it" pass:  ✦4 per started minute of video (one Gemini 3.8 Flash call per piece)
 *       editing, export, transitions, templates, beat sync: FREE, as Montage is today
 *
 * THE 65 % RULE (#343 lib/billing/margin/econ): credits ≥ ⌈full cost USD × 104.38⌉. Checked here as `costUsd` beside
 * every price so the route can hand both to econ.enforceMargin once the wiring PR (#351) lands; the gate may only RAISE.
 *   Chirp 3: $0.016/min → ⌈1.67⌉ = 2 per minute ✓.
 *   Gemini 3.8 Flash watching video: ≈ 290 tokens/s in (258/frame at 1 fps + 32/s audio) × $1.50/1M ≈ $0.026/min,
 *   + ≈ 600 tokens out × $7.50/1M ≈ $0.0045 → ≈ $0.031/min → ⌈3.2⌉ = 4 ✓ (estimated until a real call is measured).
 */
export const CREDITS_PER_USD = 104.38;

export const SMART_COST_USD = {
  chirpPerMin: 0.016,
  geminiWatchPerMin: 0.031,
  cpuPerMin: 0.002,
} as const;

export const CAPTION_CREDITS_PER_MIN = 2;
export const AI_WATCH_CREDITS_PER_MIN = 4;
export const SILENCE_CREDITS = 0;

const startedMinutes = (sec: number): number => Math.max(1, Math.ceil(Math.max(0, sec) / 60 - 1e-9));
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export const captionCredits = (audioSec: number): number => CAPTION_CREDITS_PER_MIN * startedMinutes(audioSec);
export const captionCostUsd = (audioSec: number): number => r4((Math.max(1, audioSec) / 60) * SMART_COST_USD.chirpPerMin);
export const aiWatchCredits = (videoSec: number): number => AI_WATCH_CREDITS_PER_MIN * startedMinutes(videoSec);
export const aiWatchCostUsd = (videoSec: number): number => r4((Math.max(1, videoSec) / 60) * SMART_COST_USD.geminiWatchPerMin);

/** ⌈cost × 104.38⌉: the least the 65 % rule allows. Every price above is at or over it (tested). */
export const marginFloor = (costUsd: number): number => Math.ceil(costUsd * CREDITS_PER_USD - 1e-9);
