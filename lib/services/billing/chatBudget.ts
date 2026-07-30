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
 * May this LLM turn run? Estimates from the OUTBOUND text plus a typical reply allowance.
 *
 * FAILS OPEN. A guard fault must never make chat unavailable — the alternative is a broken Supabase
 * connection silently taking the whole product offline, which is far worse than a bounded overspend that
 * the per-user credit wallet still gates independently.
 */
export async function chatBudgetAllows(inputText: string, model = 'gemini-2.5-flash'): Promise<boolean> {
  try {
    const { canProceed } = await import('./BillingGuard');
    const { estimateCost, approximateTokens } = await import('./costModel');
    const decision = await canProceed(
      estimateCost({ service: 'chat', model, inputTokens: approximateTokens(inputText), outputTokens: 800 }),
    );
    return decision.allowed;
  } catch {
    return true;
  }
}

/**
 * Book a completed turn. Best-effort — the reply has already been delivered, so a bookkeeping failure must
 * never surface to the caller.
 *
 * `outputChars` is a CHARACTER count, not text: streaming routes count characters as they flush and never
 * retain the reply. Tokens are derived with the same ~4 chars/token rule the estimator uses. (Passing the
 * count through `approximateTokens` — which expects a string — was a real bug in the first wiring: it
 * stringified the number and under-booked every reply by ~200×.)
 */
export async function bookChatUsage(inputText: string, outputChars: number, model = 'gemini-2.5-flash'): Promise<void> {
  try {
    const { recordUsage } = await import('./BillingGuard');
    const { estimateCost, approximateTokens } = await import('./costModel');
    await recordUsage(estimateCost({
      service: 'chat',
      model,
      inputTokens: approximateTokens(inputText),
      outputTokens: Math.ceil(Math.max(0, Number(outputChars) || 0) / 4),
    }));
  } catch {
    /* bookkeeping only */
  }
}
