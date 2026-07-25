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
  // AFFIRMATIVE ONLY. Diffusion/video models tokenise "no yellow tint" as {no, yellow, tint} — the negation
  // is not understood and the concept gets INJECTED, which is the very yellow cast these tokens were added to
  // fight. The suppression belongs in the provider's native negative field (FILM_DRIFT_NEGATIVE already
  // carries those tokens and is passed to Veo/Kling as negativePrompt), so the positive stream stays positive.
  'true-to-life colour, crisp sharp focus, clean neutral whites, ' +
  // Master Contract V8 — physical-grounding tokens. On the Runway primary i2v path these are the ONLY
  // quality lever (the 2024-11-06 image_to_video contract has no negative_prompt field), so they target
  // the reported flicker / warped-limb / floaty-physics failures directly. Kept tight — withColorScience
  // clamps the whole clause into Runway's 512-char promptText, trimming the SCENE text (never the grade).
  'physically consistent, correct gravity, stable temporally-consistent motion, anatomically correct hands and limbs';

/**
 * Chars of the prompt TAIL that a clamp must never eat. `planFilmScenes` puts the character-lock /
 * "same protagonist" clause AND the consistency seed at the END of the scene prompt, so a naive
 * `slice(0, max)` silently deleted exactly the instruction that keeps one person across every shot —
 * the root cause of "scene 2 is a different person". Trim from the MIDDLE instead.
 */
const TAIL_KEEP = 480;

/** Clamp to `max` chars while preserving both the opening (the user's brief) and the tail (identity+seed). */
export function clampPreservingTail(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 0) return '';
  const keep = Math.min(TAIL_KEEP, Math.floor(max / 2));
  const head = Math.max(0, max - keep - 3);
  return `${s.slice(0, head)} … ${s.slice(-keep)}`;
}

/**
 * Append the shared colour-science tokens to a provider prompt, de-duped (never doubles the clause
 * if the prompt already carries it) and clamped so the total stays within `max` chars (Runway
 * promptText is capped at 512). Pure → unit-testable.
 */
export function withColorScience(prompt: string, max = 900): string {
  const base = (prompt || '').trim();
  // Already carries the grade (buildStyleGuide + the Prompt Agent both emit "ARRI Alexa color science") →
  // don't double it, but STILL clamp tail-preserving: the old naked slice() cut mid-word and threw away the
  // character-lock + seed that live at the end.
  if (base.toLowerCase().includes('arri alexa')) return clampPreservingTail(base, max);
  const suffix = `, ${COLOR_SCIENCE_POSITIVE}`;
  if (base.length + suffix.length <= max) return base + suffix;
  // No room for the full clause → trim the base so the colour-science tokens always survive, while keeping
  // the identity/seed tail intact.
  return clampPreservingTail(base, Math.max(0, max - suffix.length)) + suffix;
}
