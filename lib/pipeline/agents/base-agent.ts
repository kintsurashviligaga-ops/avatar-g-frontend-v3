// Master Prompt §B.1 — every external-service agent extends this. Centralizing the
// breaker + retry + hard-timeout stack guarantees uniform failure behavior across all
// eight providers (the #1 source of inconsistency in multi-API pipelines).
import { CircuitBreaker } from '../utils/circuit-breaker';
import { RetryHandler } from '../utils/retry-handler';
import { logger } from '../utils/logger';

export interface AgentContext {
  jobId: string; // correlationId for tracing
  sceneNumber?: number; // optional scene scope
}

export abstract class BaseAgent {
  protected readonly breaker: CircuitBreaker;

  constructor(
    protected readonly name: string,
    protected readonly timeoutMs: number,
    failureThreshold = 3,
    resetTimeoutMs = 30000,
  ) {
    this.breaker = new CircuitBreaker(failureThreshold, resetTimeoutMs);
  }

  /** Run an action through the breaker + retry stack with a hard timeout. */
  protected async guarded<T>(ctx: AgentContext, action: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await this.breaker.execute(() =>
        RetryHandler.withExponentialBackoff(() => this.withTimeout(action())),
      );
      logger.info({ agent: this.name, jobId: ctx.jobId, scene: ctx.sceneNumber, ms: Date.now() - start }, 'agent.success');
      return result;
    } catch (err) {
      logger.error({ agent: this.name, jobId: ctx.jobId, scene: ctx.sceneNumber, err: String(err) }, 'agent.failure');
      throw err;
    }
  }

  private withTimeout<T>(p: Promise<T>): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${this.name} timed out after ${this.timeoutMs}ms`)), this.timeoutMs),
      ),
    ]);
  }
}
