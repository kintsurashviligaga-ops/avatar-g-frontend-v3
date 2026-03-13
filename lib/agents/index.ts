/**
 * lib/agents/index.ts
 * ===================
 * Barrel export for the unified multi-agent system.
 */

// Contracts & Registry
export {
  AGENT_CONTRACTS,
  ALL_AGENTS,
  getAgentContract,
  getSpecialistAgents,
  getAgentsForService,
  getPrimaryAgentForService,
  SERVICE_TO_AGENT_MAP,
  getHandoffTargets,
  matchAgentsByIntent,
  getAgentStats,
} from './contracts';
export type { AgentContract } from './contracts';

// Context & Handoff
export {
  createSessionContext,
  addAsset,
  addNote,
  advanceStep,
  getAssetsByAgent,
  getLatestAsset,
  buildHandoff,
  createPipelineStatus,
  updateStepStatus,
} from './context';
export type {
  SessionContext,
  BrandContext,
  AssetEntry,
  AgentNote,
  HandoffPayload,
  HandoffInput,
  HandoffResult,
  PipelineStepStatus,
  PipelineStatus,
} from './context';

// Orchestrator
export {
  classifyIntent,
  planPipeline,
  getReadySteps,
  executeStep,
  executePipeline,
  aggregateResults,
} from './orchestrator';
export type {
  IntentType,
  ClassifiedIntent,
  PlannedPipeline,
  PlannedStep,
  AggregatedResult,
} from './orchestrator';

// Pipelines
export {
  PIPELINE_DEFINITIONS,
  getAllPipelines,
  getPipeline,
  getPipelinesByCategory,
  getPipelinesForPlan,
  getPipelineAgentCount,
  pipelineToBundle,
} from './pipelines';
export type { ExtendedPipelineType, PipelineDefinition, PipelineStep } from './pipelines';
