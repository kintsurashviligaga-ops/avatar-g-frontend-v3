/**
 * withRetry — retry an async op with exponential backoff (Iteration 2, Phase 5).
 *
 * A small functional helper for wrapping flaky EXTERNAL API calls (image/TTS/music/
 * video providers) so a transient 5xx or network blip doesn't surface as a hard
 * failure. Retries ONLY on a thrown error; a caller-initiated cancel (AbortError) or
 * a request timeout (TimeoutError) bails immediately — there's no point retrying a
 * deliberately-aborted or already-slow request, and retrying would just compound the
 * latency before the caller's own fallback runs.
 *
 * NOTE: a class-based variant (RetryHandler.withExponentialBackoff) already exists in
 * lib/pipeline/utils/retry-handler.ts for the swarm pipeline. This is the lightweight
 * functional API for one-off call-site wrapping; both intentionally coexist.
 */

/** Errors that mean "stop now" — never worth a retry. */
function isTerminal(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  return name === 'AbortError' || name === 'TimeoutError';
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    label?: string;
  } = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 2000, label = 'operation' } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (isTerminal(error) || attempt === maxAttempts) break;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      // eslint-disable-next-line no-console
      console.warn(`[withRetry] ${label} attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`[withRetry] ${label} failed`);
}
