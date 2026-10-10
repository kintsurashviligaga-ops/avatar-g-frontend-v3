/**
 * lib/ai/usageMetrics.ts — what one Gemini text call, and one Agent G run, actually used: tokens (prompt, output,
 * served from the context cache, thinking), wall-clock time and an estimated cost (Agent G PART 5, gaps G3 and G7).
 *
 * Measurement only. Nothing here changes a request, a price or a charge: it reads the `usageMetadata` Gemini already
 * returns and prices it with the platform's own table (lib/services/billing/costModel, the same one the budget guard
 * books with). The cost is an ESTIMATE of Google's bill, not what the user pays.
 *
 * Context caching (G3): Gemini caches a repeated prompt prefix on its own (implicit caching) and reports the hits as
 * `cachedContentTokenCount`. The hit ratio below is that report, recorded per run so a baseline exists before anyone
 * decides on an explicit cache (a stored, billed resource with a TTL — the owner's call, not made here).
 *
 * PURE: no I/O, never throws.
 */
import { estimateCost } from '@/lib/services/billing/costModel';

/** One completed text call, as Gemini reported it. */
export interface LlmCallUsage {
  model: string;
  tokensIn: number;
  /** Output INCLUDING thinking (what Google bills as output). */
  tokensOut: number;
  /** Prompt tokens served from the context cache (a subset of tokensIn). */
  tokensCached: number;
  /** Thinking tokens (already inside tokensOut). */
  tokensThinking: number;
  latencyMs: number;
  /** Estimated provider cost of this call, USD. */
  costUsd: number;
}

/** The counts generateWithGemini returns (lib/gemini/client GeminiResponse), every one optional. */
export interface ReportedUsage {
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  tokensCached?: number;
  tokensThinking?: number;
  tokensTotal?: number;
  latencyMs?: number;
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/**
 * One call's usage. Thinking is billed as output, and the REST `candidatesTokenCount` leaves it out, so output is
 * candidates + thoughts — or the total minus the prompt when that is larger (the same rule chatBudget books by).
 * When Gemini reported no usage at all, the characters stand in (≈4 per token), so a call is never counted as free.
 */
export function callUsageOf(r: ReportedUsage, chars: { input: number; output: number }): LlmCallUsage {
  const reportedIn = n(r.tokensIn);
  const tokensIn = reportedIn > 0 ? reportedIn : Math.ceil(n(chars.input) / 4);
  const thinking = n(r.tokensThinking);
  const fromParts = n(r.tokensOut) + thinking;
  const fromTotal = reportedIn > 0 ? n(r.tokensTotal) - reportedIn : 0;
  const reportedOut = Math.max(fromParts, fromTotal);
  const tokensOut = reportedOut > 0 ? reportedOut : Math.ceil(n(chars.output) / 4);
  const tokensCached = Math.min(n(r.tokensCached), tokensIn);
  const costUsd = estimateCost({ service: 'chat', model: r.model, inputTokens: tokensIn, outputTokens: tokensOut, cachedInputTokens: tokensCached }).estimatedCost;
  return { model: r.model, tokensIn, tokensOut, tokensCached, tokensThinking: thinking, latencyMs: n(r.latencyMs), costUsd };
}

/** One Agent G run, summed over its model calls and tool calls. */
export interface AgentRunMetrics {
  llmCalls: number;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  tokensThinking: number;
  /** tokensCached / tokensIn, 0 when nothing was sent (3 decimals). */
  cacheHitRatio: number;
  /** Time spent waiting on the model. */
  llmMs: number;
  toolCalls: number;
  /** Time spent in tools (search, page reads, quotes). */
  toolMs: number;
  /** The whole run, wall clock. */
  totalMs: number;
  /** Estimated provider cost of the run's model calls, USD (tools that call a model book their own). */
  costUsd: number;
  /** The models that served, in first-use order. */
  models: string[];
}

/** Accumulates one run's calls. `finish` gives the totals; it can be called more than once. */
export function newRunMeter(now: () => number = Date.now) {
  const startedAt = now();
  const calls: LlmCallUsage[] = [];
  let toolCalls = 0;
  let toolMs = 0;
  return {
    addLlm(u: LlmCallUsage): void { calls.push(u); },
    addTool(ms: number): void { toolCalls += 1; toolMs += n(ms); },
    finish(): AgentRunMetrics {
      const sum = (k: 'tokensIn' | 'tokensOut' | 'tokensCached' | 'tokensThinking' | 'latencyMs' | 'costUsd') => calls.reduce((a, c) => a + c[k], 0);
      const tokensIn = sum('tokensIn');
      const tokensCached = sum('tokensCached');
      return {
        llmCalls: calls.length,
        tokensIn,
        tokensOut: sum('tokensOut'),
        tokensCached,
        tokensThinking: sum('tokensThinking'),
        cacheHitRatio: tokensIn > 0 ? Math.round((tokensCached / tokensIn) * 1000) / 1000 : 0,
        llmMs: sum('latencyMs'),
        toolCalls,
        toolMs,
        totalMs: Math.max(0, now() - startedAt),
        costUsd: Math.round(sum('costUsd') * 1e6) / 1e6,
        models: [...new Set(calls.map((c) => c.model))],
      };
    },
  };
}
