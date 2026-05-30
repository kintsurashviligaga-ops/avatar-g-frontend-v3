/**
 * lib/chat/specialistRouting.ts
 * =============================
 * PHASE 49 §1 — Strict hybrid cognitive-routing decision (PURE, dependency-free).
 *
 * Extracted from providerRouter so the routing gate can be unit-tested in
 * isolation WITHOUT dragging in the heavy provider SDKs (Replicate/Anthropic/
 * Gemini) that providerRouter imports at module load.
 *
 * Contract:
 *   Gemini = PRIMARY foundational core — ALL default interactions, customer
 *            chat, prompt execution and Georgian linguistic processing stay
 *            Gemini-led.
 *   Claude = SECONDARY specialist — invoked first ONLY for complex programming,
 *            deep science/math parsing, or large technical blueprints.
 */

const CLAUDE_CODE_SIGNALS =
  /\b(refactor|debug|stack ?trace|typescript|javascript|python|rust|golang|c\+\+|sql|regex|algorithm|big-?o|complexity|endpoint|unit test|compile|webpack|kubernetes|dockerfile|terraform|race condition|memory leak|segfault|null pointer|microservice|data structure|recursion|async\/await)\b/i;
const CLAUDE_SCIENCE_SIGNALS =
  /\b(integral|derivative|theorem|proof|eigen|matrix|differential equation|quantum|thermodynamics|stoichiometry|calculus|linear algebra|probability distribution|standard deviation)\b/i;
const CLAUDE_BLUEPRINT_SIGNALS =
  /\b(blueprint|technical spec(ification)?|system design|design doc|implementation plan|migration plan|architecture diagram)\b/i;

/**
 * True when a message should be routed FIRST to the Claude specialist instead of
 * the Gemini primary core. Pure + side-effect-free so it is trivially testable.
 */
export function prefersClaudeSpecialist(message: string): boolean {
  const text = message || '';
  if (text.trim().length === 0) return false;
  // A fenced code block is the strongest possible "this is a programming task" signal.
  if (/```/.test(text)) return true;
  return (
    CLAUDE_CODE_SIGNALS.test(text) ||
    CLAUDE_SCIENCE_SIGNALS.test(text) ||
    CLAUDE_BLUEPRINT_SIGNALS.test(text)
  );
}
