/**
 * lib/billing/v5/quote.ts — price one capability call from the versioned book, with its worst case (v5.1 Phase 5, M-5
 * and M-12; PREPARED, NOT WIRED). Pure.
 *
 * A quote has two numbers (docs/architecture/v5.1/08 §2, §4):
 *   credits     what the call is expected to cost the user (shown on the card);
 *   maxCredits  the most it can cost: the WORST case the capability can produce, not the average. This is what is
 *               reserved before the provider is called, and the user never pays more than it (08 §1.3).
 * and it names every price row it read (versionIds), so a later price change cannot silently re-price a "yes".
 *
 * Gemini 4 Argon / Carbon (M-12, D-06): from 2026-11-13 Vertex bills a completion over 32K tokens even when it times
 * out. Their worst case therefore always counts the FULL output cap, and a timeout is never "free" to us.
 */
import { activeVersion, type PriceUnit, type PriceVersion } from './priceVersions';
import type { Econ } from '@/lib/credits/unitEconomics';
import { ECON } from '@/lib/credits/unitEconomics';

export type Usage = Partial<Record<PriceUnit, number>>;

export interface Estimate {
  capability: string;
  model: string;
  /** The usual call. */
  expected: Usage;
  /** The largest call the request allows (caps, max duration, max output tokens, session cap). */
  worst: Usage;
}

export type Quote = {
  ok: true;
  credits: number;
  maxCredits: number;
  usdExpected: number;
  usdWorst: number;
  versionIds: string[];
  pricedAt: string;
};
export type QuoteResult = Quote | { ok: false; error: string };

const roundUsd = (n: number) => Math.round(n * 1e6) / 1e6;

/** Price a usage against the book at `atIso`. Any unit without a usable row → the whole price fails (never partial). */
export function priceUsage(book: readonly PriceVersion[], capability: string, model: string, usage: Usage, atIso: string, econ: Econ = ECON):
  { ok: true; credits: number; usd: number; versionIds: string[] } | { ok: false; error: string } {
  let credits = 0;
  let usd = 0;
  const versionIds: string[] = [];
  for (const [unit, amount] of Object.entries(usage) as [PriceUnit, number][]) {
    if (amount === undefined || amount === 0) continue;
    if (!(amount > 0) || !Number.isFinite(amount)) return { ok: false, error: `${unit}: amount` };
    const a = activeVersion(book, { capability, model, unit }, atIso, econ);
    if (!a.ok) return { ok: false, error: `${capability}/${model}/${unit}: ${a.error}` };
    credits += amount * a.row.creditsPerUnit;
    usd += amount * a.row.usdPerUnit;
    versionIds.push(a.row.id);
  }
  // 1e-9 absorbs float noise so an exact whole number of credits is not rounded up.
  return { ok: true, credits: Math.ceil(credits - 1e-9), usd: roundUsd(usd), versionIds: [...new Set(versionIds)].sort() };
}

export function quote(book: readonly PriceVersion[], est: Estimate, atIso: string, econ: Econ = ECON): QuoteResult {
  const exp = priceUsage(book, est.capability, est.model, est.expected, atIso, econ);
  if (!exp.ok) return exp;
  const worst = priceUsage(book, est.capability, est.model, est.worst, atIso, econ);
  if (!worst.ok) return worst;
  if (exp.credits <= 0 || worst.credits <= 0) return { ok: false, error: 'nothing to price' };
  return {
    ok: true,
    credits: exp.credits,
    maxCredits: Math.max(exp.credits, worst.credits),
    usdExpected: exp.usd,
    usdWorst: Math.max(exp.usd, worst.usd),
    versionIds: [...new Set([...exp.versionIds, ...worst.versionIds])].sort(),
    pricedAt: atIso,
  };
}

// ── Worst-case builders (08 §4) ────────────────────────────────────────────────────────────────────────────────────────

const M = 1_000_000;

/**
 * A text / agent step. Input is counted (countTokens is free); the worst case is the full output cap plus the thinking
 * budget cap. `billsOnTimeout` (Argon / Carbon): the full output cap is billed even when the call times out.
 */
export function textEstimate(capability: string, model: string, p: { inputTokens: number; expectedOutputTokens: number; maxOutputTokens: number; thinkingBudget?: number }): Estimate {
  const input = Math.max(0, Math.ceil(p.inputTokens));
  const maxOut = Math.max(0, Math.ceil(p.maxOutputTokens)) + Math.max(0, Math.ceil(p.thinkingBudget ?? 0));
  const expOut = Math.min(Math.max(0, Math.ceil(p.expectedOutputTokens)), maxOut);
  return {
    capability, model,
    expected: { input_mtok: input / M, output_mtok: expOut / M },
    worst: { input_mtok: input / M, output_mtok: maxOut / M },
  };
}

/** Models whose long completions are billed on timeout (Vertex, from 2026-11-13). Their worst case is the full cap. */
export const BILLS_ON_TIMEOUT = new Set(['gemini-4-argon', 'gemini-4-carbon']);
export const TIMEOUT_BILLED_ABOVE_TOKENS = 32_000;

/** What a timed-out call costs us: nothing for ordinary models; the full output cap for the timeout-billed ones above 32K. */
export function timeoutBilledUsage(model: string, p: { inputTokens: number; maxOutputTokens: number; thinkingBudget?: number }): Usage | null {
  const cap = Math.ceil(p.maxOutputTokens) + Math.ceil(p.thinkingBudget ?? 0);
  if (!BILLS_ON_TIMEOUT.has(model) || cap <= TIMEOUT_BILLED_ABOVE_TOKENS) return null;
  return { input_mtok: Math.ceil(p.inputTokens) / M, output_mtok: cap / M };
}

/** Video / Omni: the longest duration the request allows. */
export const videoEstimate = (capability: string, model: string, p: { seconds: number; maxSeconds: number }): Estimate =>
  ({ capability, model, expected: { second: p.seconds }, worst: { second: Math.max(p.seconds, p.maxSeconds) } });

/** TTS: characters are known before the call, so expected = worst. */
export const ttsEstimate = (capability: string, model: string, chars: number): Estimate =>
  ({ capability, model, expected: { kchar: Math.ceil(chars) / 1000 }, worst: { kchar: Math.ceil(chars) / 1000 } });

/** Live / sandbox: priced by the minute, worst case = the session cap. */
export const minuteEstimate = (capability: string, model: string, p: { expectedMinutes: number; capMinutes: number }): Estimate =>
  ({ capability, model, expected: { minute: Math.min(p.expectedMinutes, p.capMinutes) }, worst: { minute: p.capMinutes } });
