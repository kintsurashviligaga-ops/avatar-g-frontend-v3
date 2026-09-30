/**
 * lib/services/billing/chatBudget.ts
 * ==================================
 * The chat/LLM half of the budget guard (Master Task §2.1.1), in the two calls a route needs.
 *
 * WHY A SEPARATE HELPER FROM `guardedCall`: LLM surfaces are not request/response. They stream, they fail
 * over across four providers mid-turn, and the reply is never held in memory as a string — the stream loop
 * only counts characters. `guardedCall` wraps a promise and books its result; that shape does not fit. This
 * gives the same two guarantees (refuse before spending, book only what succeeded) in a form a streaming
 * route can actually use.
 *
 * DELIBERATELY NOT `server-only`: `lib/ai/llmText.ts` is imported by modules that also reach client-adjacent
 * code paths, and a hard server-only import there would break the bundle. Everything here is a dynamic
 * import of the server guard, so nothing server-side lands in a client chunk.
 */

/** Localized refusal — shown as a normal assistant turn, never an HTTP error. */
export const BUDGET_EXHAUSTED_MESSAGE =
  'ბოდიში — პლატფორმის დღევანდელი AI ბიუჯეტი ამოიწურა. სცადეთ ცოტა ხანში.\n\n' +
  "Sorry — the platform's AI budget for this period is exhausted. Please try again later.";

/**
 * The model label used when a caller does not say which model will serve. It is not a Gemini id, so
 * `costModel.resolveTokenPrice` prices it at the FLAT Master Task rate — at or above every known Flash rate, i.e.
 * the pre-check stays exactly as strict as it was before per-model pricing existed. A pre-check that does not
 * know the model must assume the expensive one; the booking afterwards uses the real model and real usage.
 */
export const UNSPECIFIED_CHAT_MODEL = 'chat';

/**
 * May this LLM turn run? Estimates from the OUTBOUND text plus a typical reply allowance.
 *
 * FAILS OPEN. A guard fault must never make chat unavailable — the alternative is a broken Supabase
 * connection silently taking the whole product offline, which is far worse than a bounded overspend that
 * the per-user credit wallet still gates independently.
 */
export async function chatBudgetAllows(inputText: string, model: string = UNSPECIFIED_CHAT_MODEL): Promise<boolean> {
  try {
    const { canProceed } = await import('./BillingGuard');
    const { estimateCost, approximateTokens } = await import('./costModel');
    const decision = await canProceed(
      estimateCost({ service: 'chat', model: modelLabel(model), inputTokens: approximateTokens(inputText), outputTokens: 800 }),
    );
    return decision.allowed;
  } catch {
    return true;
  }
}

/**
 * One completed LLM turn, as the provider reported it. Every field but `model` is optional so a route books
 * whatever it actually has: real token usage when the stream reported it, character counts when it did not.
 */
export interface ChatUsage {
  /** The model that SERVED the turn (after rotation), e.g. 'gemini-3.8-flash'. Unknown ids → flat rate. */
  model: string;
  /** Provider-reported prompt tokens (includes any context-cache hits). */
  inputTokens?: number;
  /** Provider-reported output tokens — for Gemini via @ai-sdk/google this already INCLUDES thinking tokens. */
  outputTokens?: number;
  /** Reply length in CHARACTERS — used only when `outputTokens` is missing or 0 (≈4 chars/token). */
  chars?: number;
  /** The signed-in user the turn belongs to; recorded on the spend row. Guests / non-UUIDs → null. */
  userId?: string | null;
  /** Google Search queries the turn issued (groundingMetadata.webSearchQueries.length). */
  groundingQueries?: number;
  // ── Optional extras beyond the shared interface — every one may be omitted. ──
  /** Prompt length in CHARACTERS — used only when `inputTokens` is missing or 0. */
  inputChars?: number;
  /** Provider-reported context-cache hits (a subset of inputTokens), billed at the cached rate. */
  cachedInputTokens?: number;
  /** Provider-reported total. Any excess over input + output is booked as OUTPUT (see `resolveTokens`). */
  totalTokens?: number;
}

/**
 * Book a completed turn. Best-effort — the reply has already been delivered, so a bookkeeping failure must
 * never surface to the caller.
 *
 * Two call shapes, both supported indefinitely:
 *  - `bookChatUsage({ model, inputTokens, outputTokens, userId, groundingQueries, … })` — real usage.
 *  - `bookChatUsage(inputText, outputChars, model?)` — the legacy character-count shape (llmText, /api/chat,
 *    /api/chat/claude). `outputChars` is a CHARACTER count, not text: streaming routes count characters as they
 *    flush and never retain the reply. (Passing the count through `approximateTokens` — which expects a string —
 *    was a real bug in the first wiring: it stringified the number and under-booked every reply by ~200×.)
 */
export function bookChatUsage(usage: ChatUsage): Promise<void>;
export function bookChatUsage(inputText: string, outputChars: number, model?: string): Promise<void>;
export async function bookChatUsage(
  usageOrInput: ChatUsage | string,
  outputChars?: number,
  model?: string,
): Promise<void> {
  try {
    const usage: ChatUsage =
      typeof usageOrInput === 'object' && usageOrInput !== null
        ? usageOrInput
        : {
            model: model ?? UNSPECIFIED_CHAT_MODEL,
            inputChars: String(usageOrInput ?? '').length,
            chars: outputChars,
          };
    const { recordUsage } = await import('./BillingGuard');
    const { estimateCost } = await import('./costModel');
    const tokens = resolveTokens(usage);
    await recordUsage(
      estimateCost({
        service: 'chat',
        model: modelLabel(usage.model),
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        ...(tokens.cachedInputTokens > 0 ? { cachedInputTokens: tokens.cachedInputTokens } : {}),
        ...(tokens.groundingQueries > 0 ? { groundingQueries: tokens.groundingQueries } : {}),
      }),
      { userId: ledgerUserId(usage.userId) },
    );
  } catch {
    /* bookkeeping only */
  }
}

/** A provider-reported count: a finite, non-negative number, else undefined. Never coerces strings. */
function count(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** ~4 chars/token, rounded UP — the same rule as costModel.approximateTokens, for a bare character count. */
function charsToTokens(chars: unknown): number {
  return Math.ceil((count(chars) ?? 0) / 4);
}

/**
 * The token counts to book. Real usage wins whenever it is present and positive; characters are the fallback.
 *
 * ⚠️ A reported `0` does NOT win over a non-zero character count: a stream that delivered text but reported
 * zero output tokens is a broken usage report (an aborted stream's partial usage, a proxy stripping
 * usageMetadata), and booking it at 0 would make the turn free. Chars/4 under-counts Georgian (the script is
 * token-dense), which is exactly why real usage is preferred whenever it exists.
 *
 * ⚠️ `totalTokens` beyond input + output is booked as OUTPUT. The raw Gemini REST `usageMetadata` reports
 * `candidatesTokenCount` WITHOUT thinking tokens while `totalTokenCount` includes them; a caller that maps
 * candidates → outputTokens would otherwise book a thinking turn as if it never thought. (@ai-sdk/google
 * already folds thoughts into outputTokens, so for it the excess is 0 and nothing is double-counted.)
 */
function resolveTokens(u: ChatUsage): {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  groundingQueries: number;
} {
  const inReal = count(u.inputTokens) ?? 0;
  const outReal = count(u.outputTokens) ?? 0;
  const inputTokens = inReal > 0 ? inReal : charsToTokens(u.inputChars);
  let outputTokens = outReal > 0 ? outReal : charsToTokens(u.chars);
  const total = count(u.totalTokens) ?? 0;
  if (inReal > 0 && total > inReal + outReal) {
    outputTokens = Math.max(outputTokens, total - inReal);
  } else if (inputTokens === 0 && outputTokens === 0 && total > 0) {
    // Only a total is known (e.g. a Live `usageMetadata` frame): book it all at the output rate — the dearer side.
    outputTokens = total;
  }
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens: Math.min(count(u.cachedInputTokens) ?? 0, inputTokens),
    groundingQueries: count(u.groundingQueries) ?? 0,
  };
}

/** A bounded, printable model label for the ledger row. Garbage → the unspecified label (→ flat rate). */
function modelLabel(model: unknown): string {
  const m = typeof model === 'string' ? model.trim() : '';
  return m ? m.slice(0, 128) : UNSPECIFIED_CHAT_MODEL;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ⚠️ Only a real auth UUID is forwarded. `agent_evolution_traces.user_id` is `UUID REFERENCES auth.users`, and
 * supabase-js RETURNS the insert error instead of throwing (recordTrace ignores it) — so a malformed id would not
 * just lose the attribution, it would silently drop the whole SPEND row and the budget guard would never see
 * the money. A guest turn is booked with a null user instead.
 */
function ledgerUserId(userId: unknown): string | null {
  return typeof userId === 'string' && UUID_RE.test(userId.trim()) ? userId.trim() : null;
}
