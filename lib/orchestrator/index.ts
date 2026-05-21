/**
 * Public barrel for the Core Orchestrator.
 *
 * Re-exports the CLIENT-SAFE modules so consumers can do:
 *   import { handleUserMessage, runSaga, buildSuggestedActions } from '@/lib/orchestrator';
 *
 * `idempotency.ts` is intentionally NOT re-exported here: it is marked
 * `server-only` (Redis token-lock / idempotency / circuit breaker) and
 * pulling it through this barrel would drag `server-only` into any client
 * bundle that imports the orchestrator (e.g. the chat surface). Server
 * code must import it directly:
 *   import { claimIdempotencyKey } from '@/lib/orchestrator/idempotency';
 */

export * from './types';
export * from './service-configs';
export * from './intent';
export * from './actions';
export * from './composition';
export * from './saga';
export * from './orchestrator';
