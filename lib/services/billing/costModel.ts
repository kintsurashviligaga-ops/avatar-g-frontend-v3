/**
 * lib/services/billing/costModel.ts
 * =================================
 * Master Task §2.1.1 / §1.6 / §1.8 — what a call to each of the TEN services COSTS US.
 *
 * PURE + TOTAL (no imports, no I/O, never throws) so the whole cost matrix is unit-testable and can never
 * itself trigger a paid call. The server-side guard that reads/writes real spend lives in `BillingGuard.ts`.
 *
 * THE DISTINCTION THAT MATTERS: this file models the PLATFORM's provider spend (what Google/ElevenLabs/Meshy
 * bill us), NOT what the customer pays. The user-facing charge is the existing credit wallet
 * (`lib/credits/pricing.ts` → `deduct_credits`), which is unchanged and untouched by this module. The two are
 * different ledgers on purpose: one protects the $300 API budget, the other prices the product.
 */

/** The ten official services. Ordered as in the Master Task §1.2/§1.3. */
export type ServiceType =
  | 'chat'
  | 'image'
  | 'video'
  | 'music'
  | 'avatar'
  | 'remix'
  | 'montage'
  | 'dubbing'
  | 'model3d'
  | 'presentation';

export const SERVICE_TYPES: readonly ServiceType[] = [
  'chat', 'image', 'video', 'music', 'avatar', 'remix', 'montage', 'dubbing', 'model3d', 'presentation',
] as const;

/** Master Task §2.1.1 — the estimate handed to `BillingGuard.canProceed()` before every provider call. */
export interface CostEstimate {
  service: ServiceType;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost: number;
  currency: 'USD';
}

/**
 * Gemini text pricing, USD per 1M tokens (Master Task §1.6.1). Cached input is a quarter-step cheaper than
 * uncached; we bill the caller's declared token counts, never a guess at cache state.
 */
export const GEMINI_TOKEN_PRICING = {
  inputPerMillion: 1.5,
  outputPerMillion: 9.0,
  cachedInputPerMillion: 0.15,
} as const;

/**
 * Per-unit provider cost for the non-token services, USD (Master Task §1.8 budget allocation).
 * `video` is per SECOND (the §1.8 line is $0.60 per 5s clip); `dubbing` is per MINUTE of source; every other
 * service is per generated artefact.
 */
export const UNIT_COST_USD: Readonly<Record<Exclude<ServiceType, 'chat'>, number>> = {
  image: 0.03,
  video: 0.12,
  music: 0.10,
  avatar: 0.05,
  remix: 0.10,
  montage: 0.50,
  dubbing: 0.05,
  model3d: 0.10,
  presentation: 0.02,
} as const;

/** What the `units` argument means for each service — surfaced so callers cannot silently pass the wrong thing. */
export const UNIT_OF: Readonly<Record<ServiceType, string>> = {
  chat: 'tokens',
  image: 'images',
  video: 'seconds',
  music: 'songs',
  avatar: 'avatars',
  remix: 'remixes',
  montage: 'edits',
  dubbing: 'minutes',
  model3d: 'models',
  presentation: 'decks',
} as const;

/**
 * Round to MICRO-dollars (6dp). Not cosmetic: a single cached chat call costs $0.00015, which 4dp rounding
 * flattens to $0.0001 — a 33% under-count, and the §1.8 budget expects ~15,000 chat messages a month. 6dp
 * keeps the running total honest while still killing floating-point drift across thousands of calls.
 */
function roundUsd(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** Coerce any caller-supplied number into a safe, non-negative, bounded quantity. */
function safeUnits(n: unknown, fallback = 0): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(v, 1_000_000);
}

export interface EstimateInput {
  service: ServiceType;
  model: string;
  /** chat → not used (pass tokens instead). Others → images / seconds / songs / minutes / … see UNIT_OF. */
  units?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** True when the input tokens are served from Gemini's context cache (a 10× cheaper input rate). */
  cachedInput?: boolean;
}

/**
 * Estimate what ONE call will cost us, in USD. Total: unknown/garbage input yields a finite number (0 at
 * worst), never NaN — a NaN estimate would slip past every `>=` comparison in the budget guard.
 */
export function estimateCost(input: EstimateInput): CostEstimate {
  const { service, model } = input;
  let estimatedCost = 0;

  if (service === 'chat') {
    const inTok = safeUnits(input.inputTokens);
    const outTok = safeUnits(input.outputTokens);
    const inRate = input.cachedInput
      ? GEMINI_TOKEN_PRICING.cachedInputPerMillion
      : GEMINI_TOKEN_PRICING.inputPerMillion;
    estimatedCost = (inTok / 1_000_000) * inRate + (outTok / 1_000_000) * GEMINI_TOKEN_PRICING.outputPerMillion;
  } else {
    // Default to ONE unit rather than zero: a missing `units` must not make an expensive call look free.
    const units = safeUnits(input.units, 1);
    estimatedCost = units * UNIT_COST_USD[service];
  }

  const estimate: CostEstimate = {
    service,
    model,
    estimatedCost: roundUsd(estimatedCost),
    currency: 'USD',
  };
  if (input.inputTokens !== undefined) estimate.inputTokens = safeUnits(input.inputTokens);
  if (input.outputTokens !== undefined) estimate.outputTokens = safeUnits(input.outputTokens);
  return estimate;
}

/**
 * A rough token count for a string, used only to PRE-estimate a chat call before the provider reports real
 * usage. ~4 chars/token is the standard English approximation; Georgian is denser in bytes but similar in
 * tokens, and we deliberately round UP so the guard errs toward protecting the budget.
 */
export function approximateTokens(text: string | null | undefined): number {
  const s = String(text ?? '');
  if (!s) return 0;
  return Math.ceil(s.length / 4);
}
