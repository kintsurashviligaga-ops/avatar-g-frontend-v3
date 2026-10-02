/** @jest-environment node */
/**
 * The price of a research task, and the economics its header claims. The margin assertions are the point: they turn the
 * cost-math comment into something a careless edit cannot silently break.
 */
import { GEL_PER_USD } from '@/lib/billing/fx';
import { creditsToGel } from '@/lib/credits/pricing';
import { RESEARCH_AGENT_ID, RESEARCH_CREDITS, RESEARCH_MAX_MINUTES, researchCredits, researchPriceGel } from './pricing';
import { RESEARCH_CONTEXT_MAX_CHARS } from './context';

// Google's published estimate for the agent we run (docs "Estimated costs", 2026-09-23): $1.00 – $3.00 per task.
const GOOGLE_LOW_USD = 1;
const GOOGLE_HIGH_USD = 3;
const usdOf = (credits: number) => creditsToGel(credits) / GEL_PER_USD;

describe('researchCredits', () => {
  test('a positive whole number — the owner-tunable constant, 120 by default', () => {
    expect(Number.isInteger(researchCredits())).toBe(true);
    expect(researchCredits()).toBeGreaterThan(0);
    expect(researchCredits()).toBe(RESEARCH_CREDITS);
    expect(RESEARCH_CREDITS).toBe(120);
  });

  test('is 12 ₾ at 0.10 ₾ a credit, ≈ $4.44 at the repo FX rate', () => {
    expect(researchPriceGel()).toBe(12);
    expect(usdOf(researchCredits())).toBeCloseTo(4.44, 2);
  });

  test('covers the TOP of Google\'s estimate with at least a 1.4× margin, and never costs less than its worst typical run', () => {
    const usd = usdOf(researchCredits());
    expect(usd).toBeGreaterThanOrEqual(GOOGLE_HIGH_USD * 1.4);
    // …and is not absurdly above it either (a price 10× the cost is a different decision, made on purpose).
    expect(usd).toBeLessThanOrEqual(GOOGLE_HIGH_USD * 2.5);
    expect(usd / GOOGLE_LOW_USD).toBeGreaterThan(4);
  });

  test('the folded-documents cap is the one the price assumes (≤ 40k chars)', () => {
    expect(RESEARCH_CONTEXT_MAX_CHARS).toBe(40_000);
  });
});

describe('the run', () => {
  test('uses the standard agent, never a Max id, and lives at most an hour (+slack)', () => {
    expect(RESEARCH_AGENT_ID).toBe('deep-research-preview-04-2026');
    expect(RESEARCH_AGENT_ID).not.toMatch(/max/);
    expect(RESEARCH_MAX_MINUTES).toBeGreaterThanOrEqual(60);
    expect(RESEARCH_MAX_MINUTES).toBeLessThanOrEqual(75);
  });
});
