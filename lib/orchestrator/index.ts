/**
 * Public barrel for the Core Orchestrator.
 *
 * Re-exports the CLIENT-SAFE modules so consumers can do:
 *   import { handleUserMessage, runSaga, buildSuggestedActions } from '@/lib/orchestrator';
 *
 * Server-only modules are intentionally NOT re-exported here — pulling
 * them through this barrel would drag `server-only` into any client bundle
 * that imports the orchestrator (e.g. the chat surface). Import them
 * directly from server code:
 *   idempotency.ts · ledger.ts · storage-adapter.ts
 */

export * from './types';
export * from './service-configs';
export * from './intent';
export * from './actions';
export * from './composition';
export * from './saga';
export * from './events';
export * from './render-settings';
export * from './pipeline-stages';
export * from './script-breakdown';
export * from './agents/profiles';
export * from './providers';
export * from './runpod-adapter';
export * from './orchestrator';
