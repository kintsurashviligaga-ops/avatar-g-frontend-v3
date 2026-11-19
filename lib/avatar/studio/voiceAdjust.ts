/**
 * lib/avatar/studio/voiceAdjust.ts — the exact speed and pitch of the Studio voice (D6, GG 2026-11-15: pace chips
 * everywhere, exact sliders ONLY on the dubbed "Studio voice"). Gemini-TTS documents no rate or pitch, so both are
 * applied to the read voice with ffmpeg before it is laid on the Omni mouth. Pure.
 *
 *   speed  0.8 – 1.25 (1 = as read)        → atempo
 *   pitch  −4 – +4 semitones (0 = as read) → asetrate × 2^(st/12), back to the rate, atempo ÷ the same (length kept)
 */
export const VOICE_SPEED_MIN = 0.8;
export const VOICE_SPEED_MAX = 1.25;
export const VOICE_PITCH_MIN = -4;
export const VOICE_PITCH_MAX = 4;
/** The rate the read voice is decoded at before the pitch shift. */
export const VOICE_RATE = 24_000;

export interface VoiceAdjust { speed: number; pitch: number }
export const NO_ADJUST: VoiceAdjust = { speed: 1, pitch: 0 };

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Clamped to the slider ranges, speed to 0.05 and pitch to 0.5 semitone steps. */
export function clampVoiceAdjust(v: { speed?: unknown; pitch?: unknown } = {}): VoiceAdjust {
  const speed = Math.min(VOICE_SPEED_MAX, Math.max(VOICE_SPEED_MIN, Math.round(num(v.speed, 1) * 20) / 20));
  const pitch = Math.min(VOICE_PITCH_MAX, Math.max(VOICE_PITCH_MIN, Math.round(num(v.pitch, 0) * 2) / 2));
  return { speed, pitch: pitch === 0 ? 0 : pitch };
}

export const isNoAdjust = (a: VoiceAdjust) => a.speed === 1 && a.pitch === 0;

const f4 = (n: number) => String(Number(n.toFixed(4)));

/** The ffmpeg audio filter for an adjustment; null when there is nothing to change. */
export function voiceAdjustFilter(a: VoiceAdjust): string | null {
  const { speed, pitch } = clampVoiceAdjust(a);
  if (speed === 1 && pitch === 0) return null;
  const parts: string[] = [];
  if (pitch !== 0) {
    const r = 2 ** (pitch / 12);
    parts.push(`aresample=${VOICE_RATE}`, `asetrate=${Math.round(VOICE_RATE * r)}`, `aresample=${VOICE_RATE}`, `atempo=${f4(1 / r)}`);
  }
  if (speed !== 1) parts.push(`atempo=${f4(speed)}`);
  return parts.join(',');
}
