/**
 * lib/services/billing/costModel.ts
 * =================================
 * Master Task §2.1.1 / §1.6 / §1.8 — what a call to each of the TEN services COSTS US.
 *
 * PURE + TOTAL (no imports, no I/O, never throws) so the whole cost matrix is unit-testable and can never
 * itself trigger a paid call. The server-side guard that reads/writes real spend lives in `BillingGuard.ts`.
 *
 * Chat is priced PER MODEL FAMILY (`GEMINI_PRICE_TABLE`: Flash / Flash-Lite / Pro / Live audio / TTS, by
 * generation) plus Google Search grounding; an id the table cannot place keeps the old flat Master Task rate.
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
 * The FLAT fallback rate, USD per 1M tokens (Master Task §1.6.1): what a chat call costs when its model id is
 * not in `GEMINI_PRICE_TABLE` below — unknown ids, retired ids, and the non-Gemini labels some callers still
 * pass ('gpt', 'claude-haiku-4-5', llmText's 'deepseek' / 'gemini' leg labels). It was the ONLY rate before
 * per-model pricing, and it sits at or above every known Flash / Flash-Lite rate, so "unknown" errs toward
 * protecting the budget. Cached input is 10× cheaper; we bill the caller's declared counts, never a guess at
 * cache state.
 */
export const GEMINI_TOKEN_PRICING = {
  inputPerMillion: 1.5,
  outputPerMillion: 9.0,
  cachedInputPerMillion: 0.15,
} as const;

/**
 * Per-model Gemini pricing is keyed by FAMILY (generation × tier), not by exact id: a new `-preview-MM-YYYY`
 * suffix or a `-001` pin must not silently drop a model onto the flat fallback. `geminiPriceFamily()` maps an id
 * to one of these; anything it cannot place is priced at `GEMINI_TOKEN_PRICING`.
 */
export type GeminiPriceFamily =
  | 'pro-3'          // gemini-3-pro*, gemini-3.1-pro-preview, gemini-pro-latest, any newer Pro
  | 'pro-2.5'        // gemini-2.5-pro
  | 'flash-3.6'      // gemini-3.6 / 3.7 / 3.8-flash
  | 'flash-3.5'      // gemini-3.5-flash, gemini-flash-latest, any Flash newer than 3.8
  | 'flash-3'        // gemini-3-flash-preview (3.0 – 3.4)
  | 'flash-2.5'      // gemini-2.5-flash
  | 'flash-lite-3.5' // gemini-3.5-flash-lite
  | 'flash-lite-3'   // gemini-3.x-flash-lite below 3.5
  | 'flash-lite-2.5' // gemini-2.5-flash-lite
  | 'live-audio'     // Live API native-audio / *-live / *-transcribe-live
  | 'tts-flash'      // *-flash-*tts*
  | 'tts-pro';       // *-pro-*tts*

/**
 * Google Search grounding. Two different billing units on the published list: the 2.5 generation bills per
 * grounded PROMPT (a request that used search, however many queries it ran); Gemini 3+ bills per search QUERY
 * the model issued. `usd` is the price of ONE unit. `usd: 0` means "price unknown" — see the TODOs on the rows.
 */
export interface GeminiGroundingPrice {
  per: 'prompt' | 'query';
  usd: number;
}

export interface GeminiTokenRates {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion: number;
}

export interface GeminiFamilyPrice extends GeminiTokenRates {
  /** Rates once the PROMPT exceeds `LONG_CONTEXT_THRESHOLD_TOKENS` (Pro tiers only). */
  longContext?: GeminiTokenRates;
  grounding: GeminiGroundingPrice;
}

/** Pro tiers switch to the long-context rates above this many prompt tokens. */
export const LONG_CONTEXT_THRESHOLD_TOKENS = 200_000;

/** The date the table below was last reconciled against the published price list. */
export const GEMINI_PRICES_AS_OF = '2026-09-30';

/**
 * USD per 1M tokens (grounding: USD per prompt/query), Standard paid tier of the Gemini Developer API.
 *
 * RECONCILED LIVE on 2026-09-30 against ai.google.dev/gemini-api/docs/pricing for every CHAT row (Pro, Flash,
 * Flash-Lite — the models the chat dropdown can route to): input, output, cached input and grounding all match the
 * page. The page cannot be read from CI, so a later price change is only caught by re-reading it by hand. The
 * Live-audio and TTS rows were NOT re-checked in that pass and keep their UNCERTAIN marks. A wrong row only mis-sizes
 * the PLATFORM budget guard — the customer's credit charge lives in lib/credits/pricing.ts and never reads this table.
 *
 * ⚠️ WHERE GOOGLE PUBLISHES A DATED PRICE, THE LATER (HIGHER) ONE IS USED. 3.6 / 3.7 / 3.8 Flash are $0.75 / $3.75
 * until 2026-12-31 and $1.50 / $7.50 from 2027-01-01; the table carries the 2027 price so it stays on the safe side
 * without a date switch nobody would remember to flip (it over-books those three by 2× until the new year).
 *
 * Output rates INCLUDE thinking tokens (Google bills thoughts as output; @ai-sdk/google 3.0.70 already folds
 * `thoughtsTokenCount` into `usage.outputTokens`). The free grounding allowances (1,500 grounded prompts/day on
 * 2.5; 5,000 queries/month on Gemini 3) are NOT netted out — TODO when the ledger can count them; until then the
 * guard over-books grounding, which is the safe direction.
 */
export const GEMINI_PRICE_TABLE: Readonly<Record<GeminiPriceFamily, GeminiFamilyPrice>> = {
  // Gemini 3 / 3.1 Pro (preview) — live 2026-09-30, cached rates included. The Pro chat mode. Pro ≥3.5 has no
  // published price → priced as 3.x Pro, which is at least the flat fallback, so an unknown newer Pro can never look
  // cheaper than it probably is.
  'pro-3': {
    inputPerMillion: 2.0, outputPerMillion: 12.0, cachedInputPerMillion: 0.2,
    longContext: { inputPerMillion: 4.0, outputPerMillion: 18.0, cachedInputPerMillion: 0.4 },
    grounding: { per: 'query', usd: 14 / 1000 },
  },
  // Live 2026-09-30, cached rates included (10% of input).
  'pro-2.5': {
    inputPerMillion: 1.25, outputPerMillion: 10.0, cachedInputPerMillion: 0.125,
    longContext: { inputPerMillion: 2.5, outputPerMillion: 15.0, cachedInputPerMillion: 0.25 },
    grounding: { per: 'prompt', usd: 35 / 1000 },
  },
  // Gemini 3.6 / 3.7 / 3.8 Flash — the 2027-01-01 list price (see the note above; $0.75 / $3.75 / $0.075 until then).
  // The Fast and Thinking chat modes run on this row.
  'flash-3.6': {
    inputPerMillion: 1.5, outputPerMillion: 7.5, cachedInputPerMillion: 0.15,
    grounding: { per: 'query', usd: 14 / 1000 },
  },
  // Gemini 3.5 Flash (live: $1.50 / $9.00, cached $0.15) — the dearest Flash on the list, so it also prices the
  // `gemini-flash-latest` alias (whatever it points at today) and any Flash newer than 3.8 (no published price yet):
  // an unknown Flash can never look cheaper than every known one. Same numbers as the flat fallback.
  'flash-3.5': {
    inputPerMillion: 1.5, outputPerMillion: 9.0, cachedInputPerMillion: 0.15,
    grounding: { per: 'query', usd: 14 / 1000 },
  },
  // Gemini 3 Flash (preview), text/image/video input (audio input is $1.00 — not split out here). Cached UNCERTAIN.
  'flash-3': {
    inputPerMillion: 0.5, outputPerMillion: 3.0, cachedInputPerMillion: 0.05,
    grounding: { per: 'query', usd: 14 / 1000 },
  },
  // Text/image/video input (audio input is $1.00 — not split out here). Live 2026-09-30, cached included.
  'flash-2.5': {
    inputPerMillion: 0.3, outputPerMillion: 2.5, cachedInputPerMillion: 0.03,
    grounding: { per: 'prompt', usd: 35 / 1000 },
  },
  // Gemini 3.5 Flash-Lite (live: $0.30 / $2.50, cached $0.03, text/image/video/audio input) — the Lite chat mode's
  // fallback. Before this row it fell to the flat fallback, whose grounding price is $0 — so its Google Search
  // queries were booked as free.
  'flash-lite-3.5': {
    inputPerMillion: 0.3, outputPerMillion: 2.5, cachedInputPerMillion: 0.03,
    grounding: { per: 'query', usd: 14 / 1000 },
  },
  // Gemini 3.1 Flash-Lite, text/image/video input (audio input is $0.50 — not split out here). The Lite chat mode.
  // Flash-Lite NEWER than 3.5 is not placed (no published price) → flat fallback.
  'flash-lite-3': {
    inputPerMillion: 0.25, outputPerMillion: 1.5, cachedInputPerMillion: 0.025,
    grounding: { per: 'query', usd: 14 / 1000 },
  },
  // Text/image/video input (audio input is $0.30). Live 2026-09-30, cached included.
  'flash-lite-2.5': {
    inputPerMillion: 0.1, outputPerMillion: 0.4, cachedInputPerMillion: 0.01,
    grounding: { per: 'prompt', usd: 35 / 1000 },
  },
  // gemini-2.5-flash-native-audio: AUDIO rates on both sides (text in is $0.50, text out $2.00) because a voice
  // call is audio-dominated and under-booking is the unsafe direction. UNCERTAIN for gemini-3.8-live,
  // gemini-3.1-flash-live-preview and gemini-3.5-transcribe-live (never on the list I knew) — priced as 2.5.
  // No context-cache discount on Live. TODO: Live API grounding price unknown → 0.
  'live-audio': {
    inputPerMillion: 3.0, outputPerMillion: 12.0, cachedInputPerMillion: 3.0,
    grounding: { per: 'query', usd: 0 },
  },
  // gemini-2.5-flash-preview-tts: text in, AUDIO out. UNCERTAIN for the 3.x TTS ids — priced as 2.5. No tools.
  'tts-flash': {
    inputPerMillion: 0.5, outputPerMillion: 10.0, cachedInputPerMillion: 0.5,
    grounding: { per: 'query', usd: 0 },
  },
  // gemini-2.5-pro-preview-tts.
  'tts-pro': {
    inputPerMillion: 1.0, outputPerMillion: 20.0, cachedInputPerMillion: 1.0,
    grounding: { per: 'query', usd: 0 },
  },
} as const;

/**
 * Which price family a model id belongs to, or null when it cannot be placed (→ flat fallback).
 *
 * Order matters: TTS and Live ids ALSO contain "flash" ('gemini-3.1-flash-live-preview',
 * 'gemini-2.5-flash-preview-tts'), and pricing a voice call as text Flash would under-book its audio 4–10×.
 * Retired generations (gemini-2.0-*, 1.5-*) return null — they 404, so nothing is ever booked against them.
 */
export function geminiPriceFamily(model: string | null | undefined): GeminiPriceFamily | null {
  const id = String(model ?? '').trim().toLowerCase().replace(/^models\//, '');
  if (!id.startsWith('gemini-') || id.length > 128) return null;
  if (/(^|-)tts(-|$)/.test(id)) return /-pro(-|$)/.test(id) ? 'tts-pro' : 'tts-flash';
  if (/native-audio|(^|-)live(-|$)|transcribe/.test(id)) return 'live-audio';
  // Image-OUTPUT models bill image tokens at a far higher output rate than text; not a chat price — fallback.
  if (/(^|-)image(-|$)/.test(id)) return null;
  if (/^gemini-pro-latest(-|$)/.test(id)) return 'pro-3';
  if (/^gemini-flash-latest(-|$)/.test(id)) return 'flash-3.5';
  const m = /^gemini-(\d+(?:\.\d+)?)-(flash-lite|flash|pro)(?:-|$)/.exec(id);
  if (!m) return null;
  const version = Number(m[1]);
  if (!Number.isFinite(version) || version < 2.5) return null;
  switch (m[2]) {
    case 'pro':
      return version >= 3 ? 'pro-3' : 'pro-2.5';
    case 'flash':
      if (version >= 3.6 && version <= 3.8) return 'flash-3.6';
      return version >= 3.5 ? 'flash-3.5' : version >= 3 ? 'flash-3' : 'flash-2.5';
    default: // flash-lite
      if (version > 3.5) return null;
      if (version === 3.5) return 'flash-lite-3.5';
      return version >= 3 ? 'flash-lite-3' : 'flash-lite-2.5';
  }
}

export interface ResolvedTokenPrice extends GeminiTokenRates {
  /** The family that priced the call, or 'fallback' for the flat Master Task rate. */
  family: GeminiPriceFamily | 'fallback';
  grounding: GeminiGroundingPrice;
}

/** TODO: grounding for an id we cannot price is unknown → 0 (in practice these are non-Google labels). */
const FALLBACK_GROUNDING: GeminiGroundingPrice = { per: 'query', usd: 0 };

/**
 * The effective per-token rates for `model`, given the prompt size (Pro tiers step up past 200k prompt tokens).
 * Total: an unknown or garbage id resolves to the flat fallback, never to zero.
 */
export function resolveTokenPrice(model: string | null | undefined, promptTokens = 0): ResolvedTokenPrice {
  const family = geminiPriceFamily(model);
  if (!family) {
    return {
      family: 'fallback',
      inputPerMillion: GEMINI_TOKEN_PRICING.inputPerMillion,
      outputPerMillion: GEMINI_TOKEN_PRICING.outputPerMillion,
      cachedInputPerMillion: GEMINI_TOKEN_PRICING.cachedInputPerMillion,
      grounding: FALLBACK_GROUNDING,
    };
  }
  const row = GEMINI_PRICE_TABLE[family];
  const rates = row.longContext && safeUnits(promptTokens) > LONG_CONTEXT_THRESHOLD_TOKENS ? row.longContext : row;
  return {
    family,
    inputPerMillion: rates.inputPerMillion,
    outputPerMillion: rates.outputPerMillion,
    cachedInputPerMillion: rates.cachedInputPerMillion,
    grounding: row.grounding,
  };
}

/**
 * ⚠️ Hard cap on grounding units per call. A single Gemini turn issues a handful of search queries; a caller bug
 * passing a byte count or a token count here would otherwise book thousands of dollars in ONE ledger row — and
 * because the guard sums that ledger, one bad row would trip the daily limit and FULL-STOP every service for
 * the rest of the day. 50 × $0.035 = $1.75 is the most one call can ever book for search.
 */
export const MAX_GROUNDING_UNITS_PER_CALL = 50;

/** USD for the Google Search grounding of ONE call. Garbage / non-positive counts cost nothing. */
export function groundingCostUsd(grounding: GeminiGroundingPrice, queries: unknown): number {
  const q = Math.min(Math.ceil(safeUnits(queries)), MAX_GROUNDING_UNITS_PER_CALL);
  if (q <= 0 || !(grounding.usd > 0)) return 0;
  return grounding.per === 'prompt' ? grounding.usd : q * grounding.usd;
}

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
  /**
   * chat only — how many of `inputTokens` were context-cache hits (the provider's `cachedInputTokens`; a SUBSET of
   * inputTokens, clamped to it). Ignored when `cachedInput` is true (that already means "all of them").
   */
  cachedInputTokens?: number;
  /** chat only — Google Search queries the call issued (groundingMetadata.webSearchQueries.length). */
  groundingQueries?: number;
  /**
   * Per-unit USD for a call whose price the caller knows exactly — a Veo clip's tier × resolution × audio rate
   * (lib/veo/capabilities.costPerSecondUsd) is 0.03–0.60 $/s, and the flat `video` line would under-reserve a
   * Standard clip 3×. Ignored unless finite and positive; per-token services never use it.
   */
  unitCostUsd?: number;
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
    const price = resolveTokenPrice(model, inTok);
    const cachedTok = input.cachedInput ? inTok : Math.min(inTok, safeUnits(input.cachedInputTokens));
    estimatedCost =
      ((inTok - cachedTok) * price.inputPerMillion +
        cachedTok * price.cachedInputPerMillion +
        outTok * price.outputPerMillion) / 1_000_000 +
      groundingCostUsd(price.grounding, input.groundingQueries);
  } else {
    // Default to ONE unit rather than zero: a missing `units` must not make an expensive call look free.
    const units = safeUnits(input.units, 1);
    const override = Number(input.unitCostUsd);
    const rate = Number.isFinite(override) && override > 0 ? override : UNIT_COST_USD[service];
    estimatedCost = units * rate;
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
