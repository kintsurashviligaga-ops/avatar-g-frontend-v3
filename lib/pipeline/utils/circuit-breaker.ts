// Master Prompt §9.1 — per-API circuit breaker. One flaky provider must not trip the
// others, so each agent owns its own breaker instance.
export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: BreakerState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime: number | null = null;

  constructor(
    private readonly failureThreshold: number = 3,
    private readonly resetTimeoutMs: number = 30000,
  ) {}

  async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.lastFailureTime !== null && Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit Breaker is OPEN. Request rejected.');
      }
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) this.state = 'OPEN';
  }

  /** Current breaker state — surfaced to health checks / Prometheus. */
  get status(): BreakerState {
    return this.state;
  }
}
