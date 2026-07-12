/**
 * lib/video/colorScience.ts
 * =========================
 * PHASE 24 — SHARED COLOR-SCIENCE / ANTI-DRIFT CONTRACT.
 *
 * One source of truth for the premium colour-grade + drift-suppression tokens, consumed by EVERY
 * video provider (Runway Gen-3/4 promptText · Replicate Kling prompt · LTX in-prompt clause). When
 * the cascade falls back mid-storyboard (Runway → Kling → LTX), every fragment carries the same
 * tone/contrast intent, so the master never shifts colour-science or warps identity across a
 * provider boundary. The drift NEGATIVE lives in filmPipeline.FILM_DRIFT_NEGATIVE (native
 * negative_prompt field); this file owns the POSITIVE tokens that append to the prompt.
 */

/**
 * Positive colour-science tokens appended to the prompt on every provider. Kept concise so it never
 * crowds the identity/seed text (and stays well inside Runway's 512-char promptText bound). Targets
 * the documented failures: yellow/sepia LUT tint, muddy gradients, flat contrast.
 */
export const COLOR_SCIENCE_POSITIVE =
  'photorealistic cinematic 8K, professional colour grading, ARRI Alexa color science, neutral white balance, ' +
  'strictly neutral colour balance, photorealistic skin texture, natural soft overcast lighting, high-end commercial grade, ' +
  'true-to-life colour, crisp sharp focus, zero sepia or yellow tint';

/**
 * Append the shared colour-science tokens to a provider prompt, de-duped (never doubles the clause
 * if the prompt already carries it) and clamped so the total stays within `max` chars (Runway
 * promptText is capped at 512). Pure → unit-testable.
 */
export function withColorScience(prompt: string, max = 900): string {
  const base = (prompt || '').trim();
  if (base.toLowerCase().includes('arri alexa')) return base.slice(0, max);
  const suffix = `, ${COLOR_SCIENCE_POSITIVE}`;
  if (base.length + suffix.length <= max) return base + suffix;
  // No room for the full clause → trim the base so the colour-science tokens always survive.
  return base.slice(0, Math.max(0, max - suffix.length)) + suffix;
}
