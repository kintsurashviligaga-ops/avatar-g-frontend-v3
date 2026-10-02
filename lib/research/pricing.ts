/**
 * lib/research/pricing.ts — what ONE Deep Research task costs the user, in credits. Pure and isomorphic: the composer
 * shows this number ("Deep Research ✦ 120") and POST /api/research/start charges it through THIS function and refuses a
 * request whose `confirmedCredits` is anything else — the number on the button is the number on the bill.
 *
 * ⚠️ A RESEARCH TASK COSTS REAL DOLLARS, AND NOT A FIXED AMOUNT. It is an agent, not a model call: one request starts a
 * loop of planning, searching, reading and writing that runs 5–60 minutes. Google's own estimate for the agent we run
 * (`deep-research-preview-04-2026`, docs "Availability and pricing → Estimated costs", page dated 2026-09-23):
 *
 *     ~80 search queries · ~250k input tokens (50–70 % served from cache) · ~60k output tokens
 *     → "~$1.00 – $3.00 per task"            (the Max agent: $3.00 – $7.00 — we do NOT run it)
 *
 * THE MATH BEHIND 120:
 *     120 credits × 0.10 ₾ (CREDIT_VALUE_GEL)         = 12.00 ₾
 *     12.00 ₾ ÷ 2.7 ₾/$ (lib/billing/fx GEL_PER_USD)   = $4.44
 *     $4.44 against Google's $1–$3                    = 1.5× the top of the range, 4.4× the bottom
 * The 1.5× over the top is the tail: a broad prompt, or up to 40,000 characters of the user's own documents folded into
 * the prompt (≲ $0.7 more in the worst, Georgian-token-dense case), pushes a task above Google's "moderate analysis"
 * example. Refunds (failure, timeout, cancel) are paid back in full, so the platform carries the cost of a run that
 * produced nothing — which is why this is priced above the typical task rather than at it, and why the platform caps
 * (lib/research/limits.ts: per-user concurrency + daily, global daily kill switch) exist.
 *
 * OWNER-TUNABLE: change RESEARCH_CREDITS — this one number. Raise it if Google's invoices for research run above ~$3 per
 * task on average. pricing.test.ts pins the margin band, so a lowering that eats the tail margin fails the suite.
 */
import { creditsToGel } from '@/lib/credits/pricing';

/** The agent every job runs (Interactions API `agent`). Preview ids change — the server reads RESEARCH_AGENT first. */
export const RESEARCH_AGENT_ID = 'deep-research-preview-04-2026' as const;

/** Credits one Deep Research task costs. See the cost math above. */
export const RESEARCH_CREDITS = 120;

/** The provider's own ceiling on one run ("maximum research time of 60 minutes") + a minute of slack. */
export const RESEARCH_MAX_MINUTES = 61;

/** Credits the user is charged — and the UI shows — for one task. A positive whole number, always. */
export function researchCredits(): number {
  return Math.max(1, Math.round(RESEARCH_CREDITS));
}

/** The same price in lari (1 credit = 0.10 ₾), for "≈ 12 ₾" hints. */
export function researchPriceGel(): number {
  return creditsToGel(researchCredits());
}
