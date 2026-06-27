/**
 * lib/pipeline/cost.ts — wholesale API cost estimate for a generation (Pipeline
 * Iteration, Phase 6B). Pure + dependency-light so it can run anywhere (assemble
 * route, admin, tests). Numbers come from lib/credits/pricing.ts API_COSTS_USD so
 * there's a single source of truth. This is an ESTIMATE (provider mix varies); it's
 * stored in generation_jobs.result for the admin cost view, never used to bill.
 */
import { API_COSTS_USD, USD_TO_GEL } from '@/lib/credits/pricing';

export interface FilmCostMetrics {
  /** Number of video clips rendered. */
  clipCount: number;
  /** Storyboard frames generated (NanoBanana), if any. */
  imageCount?: number;
  /** Narration / dialogue characters sent to ElevenLabs TTS, if any. */
  ttsChars?: number;
  /** Music track length in seconds (0/undefined → no music cost). */
  musicSec?: number;
  /** Per-clip USD override (e.g. Kling ≈ 0.25); defaults to the LTX 5s clip rate. */
  perClipUsd?: number;
}

export interface CostEstimate {
  usd: number;
  gel: number;
  breakdown: { clips: number; images: number; tts: number; music: number };
}

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

function musicCostUsd(sec: number): number {
  if (sec <= 0) return 0;
  if (sec <= 30) return API_COSTS_USD.music.udio_30s;
  if (sec <= 60) return API_COSTS_USD.music.udio_60s;
  return API_COSTS_USD.music.udio_90s;
}

/** Estimate the wholesale USD + GEL cost of a film render from its produced units. */
export function estimateFilmCostUsd(m: FilmCostMetrics): CostEstimate {
  const perClip = m.perClipUsd ?? API_COSTS_USD.video.ltx_clip_5s;
  const clips = Math.max(0, m.clipCount) * perClip;
  const images = Math.max(0, m.imageCount ?? 0) * API_COSTS_USD.image.nanoBanana_per_image;
  const tts = Math.max(0, m.ttsChars ?? 0) * API_COSTS_USD.video.elevenlabs_tts_per_char;
  const music = musicCostUsd(m.musicSec ?? 0);
  const usd = round4(clips + images + tts + music);
  return {
    usd,
    gel: round4(usd * USD_TO_GEL),
    breakdown: { clips: round4(clips), images: round4(images), tts: round4(tts), music: round4(music) },
  };
}
