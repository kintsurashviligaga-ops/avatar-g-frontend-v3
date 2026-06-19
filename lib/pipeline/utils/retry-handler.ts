// Master Prompt §9.2 — exponential backoff with jitter. Jitter prevents the thundering
// herd where many retries fire in lockstep and re-overload a recovering provider.
export class RetryHandler {
  static async withExponentialBackoff<T>(
    action: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000,
  ): Promise<T> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt < maxRetries) {
      try {
        return await action();
      } catch (error) {
        lastError = error;
        attempt++;
        if (attempt >= maxRetries) break;
        const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 500;
        await new Promise((resolve) => setTimeout(resolve, exponentialDelay + jitter));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Max retries exceeded');
  }
}
