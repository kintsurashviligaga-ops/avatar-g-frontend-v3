/**
 * lib/agents/context.ts
 * =====================
 * Shared context layer for the multi-agent system.
 * Every agent reads/writes to SessionContext during a pipeline run.
 * This is the "shared memory" that enables coordinated agent behavior.
 */

import type { LocaleCode, Platform, StylePreset } from '@/types/core';

// ─── Session Context (shared across all agents in one pipeline run) ──────────

export interface SessionContext {
  /** Unique session/project ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** User's original goal/request */
  userGoal: string;
  /** Detected or specified language */
  language: LocaleCode;
  /** Target platform */
  platform: Platform;
  /** Style preset */
  stylePreset: StylePreset;
  /** Brand guidelines, if any */
  brand?: BrandContext;
  /** Accumulated assets from previous pipeline steps */
  assets: AssetEntry[];
  /** Messages/notes between agents */
  agentNotes: AgentNote[];
  /** Current pipeline step index (0-based) */
  currentStep: number;
  /** Total pipeline steps */
  totalSteps: number;
  /** Overall pipeline status */
  pipelineStatus: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  /** Timestamp of session creation */
  createdAt: string;
  /** Last updated timestamp */
  updatedAt: string;
}

export interface BrandContext {
  brandName: string;
  colorPalette: string[];
  fontFamily?: string;
  tonOfVoice?: string;
  logoUrl?: string;
}

export interface AssetEntry {
  /** Unique asset ID */
  id: string;
  /** Which agent produced this */
  producedBy: string;
  /** At which pipeline step */
  stepIndex: number;
  /** Asset type */
  type: 'image' | 'video' | 'audio' | 'text' | 'document' | 'file' | '3d-model';
  /** Label for display */
  label: string;
  /** URL or content */
  url?: string;
  content?: string;
  /** MIME type */
  mimeType: string;
  /** Size in bytes */
  sizeBytes?: number;
  /** QA score (0-100), if evaluated */
  qaScore?: number;
}

export interface AgentNote {
  /** Which agent left this note */
  fromAgent: string;
  /** Target agent (or '*' for all) */
  toAgent: string;
  /** Note type */
  type: 'info' | 'warning' | 'error' | 'handoff' | 'qa-result';
  /** Note content */
  message: string;
  /** Timestamp */
  timestamp: string;
}

// ─── Handoff Protocol ────────────────────────────────────────────────────────

export interface HandoffPayload {
  /** Source agent ID */
  fromAgent: string;
  /** Target agent ID */
  toAgent: string;
  /** What the target agent should do */
  task: string;
  /** Input data for the target agent */
  inputs: HandoffInput[];
  /** Constraints or preferences */
  constraints?: Record<string, unknown>;
  /** Priority level */
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** Reference to session context */
  sessionId: string;
}

export interface HandoffInput {
  /** Asset ID from SessionContext.assets */
  assetId?: string;
  /** Direct text input */
  text?: string;
  /** Direct URL input */
  url?: string;
  /** Label */
  label: string;
}

export interface HandoffResult {
  /** Whether the handoff was accepted and completed */
  success: boolean;
  /** Target agent ID that handled it */
  handledBy: string;
  /** Produced assets */
  outputs: AssetEntry[];
  /** QA score for this step */
  qaScore?: number;
  /** Error message if failed */
  error?: string;
  /** Duration in ms */
  durationMs: number;
}

// ─── Pipeline Step Status ────────────────────────────────────────────────────

export interface PipelineStepStatus {
  stepIndex: number;
  agentId: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  qaScore?: number;
  outputs: AssetEntry[];
  error?: string;
}

export interface PipelineStatus {
  sessionId: string;
  bundleType?: string;
  steps: PipelineStepStatus[];
  overallStatus: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'partial';
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
}

// ─── Context Helpers ─────────────────────────────────────────────────────────

/** Create a fresh session context */
export function createSessionContext(params: {
  sessionId: string;
  userId: string;
  userGoal: string;
  language?: LocaleCode;
  platform?: Platform;
  stylePreset?: StylePreset;
  totalSteps?: number;
}): SessionContext {
  const now = new Date().toISOString();
  return {
    sessionId: params.sessionId,
    userId: params.userId,
    userGoal: params.userGoal,
    language: params.language ?? 'en',
    platform: params.platform ?? 'website',
    stylePreset: params.stylePreset ?? 'Business Pro',
    assets: [],
    agentNotes: [],
    currentStep: 0,
    totalSteps: params.totalSteps ?? 1,
    pipelineStatus: 'idle',
    createdAt: now,
    updatedAt: now,
  };
}

/** Add an asset to the session context */
export function addAsset(ctx: SessionContext, asset: Omit<AssetEntry, 'id'>): SessionContext {
  const id = `asset_${ctx.assets.length + 1}_${Date.now()}`;
  return {
    ...ctx,
    assets: [...ctx.assets, { ...asset, id }],
    updatedAt: new Date().toISOString(),
  };
}

/** Add an agent note to the session context */
export function addNote(ctx: SessionContext, note: Omit<AgentNote, 'timestamp'>): SessionContext {
  return {
    ...ctx,
    agentNotes: [...ctx.agentNotes, { ...note, timestamp: new Date().toISOString() }],
    updatedAt: new Date().toISOString(),
  };
}

/** Advance to next pipeline step */
export function advanceStep(ctx: SessionContext): SessionContext {
  return {
    ...ctx,
    currentStep: Math.min(ctx.currentStep + 1, ctx.totalSteps),
    updatedAt: new Date().toISOString(),
  };
}

/** Get assets produced by a specific agent */
export function getAssetsByAgent(ctx: SessionContext, agentId: string): AssetEntry[] {
  return ctx.assets.filter(a => a.producedBy === agentId);
}

/** Get the latest asset of a given type */
export function getLatestAsset(ctx: SessionContext, type: AssetEntry['type']): AssetEntry | undefined {
  return [...ctx.assets].reverse().find(a => a.type === type);
}

/** Build a handoff payload from context */
export function buildHandoff(params: {
  fromAgent: string;
  toAgent: string;
  task: string;
  sessionId: string;
  assetIds?: string[];
  text?: string;
  priority?: HandoffPayload['priority'];
}): HandoffPayload {
  const inputs: HandoffInput[] = [];

  if (params.assetIds) {
    for (const assetId of params.assetIds) {
      inputs.push({ assetId, label: `Asset ${assetId}` });
    }
  }
  if (params.text) {
    inputs.push({ text: params.text, label: 'Text input' });
  }

  return {
    fromAgent: params.fromAgent,
    toAgent: params.toAgent,
    task: params.task,
    inputs,
    priority: params.priority ?? 'normal',
    sessionId: params.sessionId,
  };
}

/** Create initial pipeline status tracker */
export function createPipelineStatus(
  sessionId: string,
  steps: { agentId: string; label: string }[],
  bundleType?: string
): PipelineStatus {
  return {
    sessionId,
    bundleType,
    steps: steps.map((s, i) => ({
      stepIndex: i,
      agentId: s.agentId,
      label: s.label,
      status: 'pending',
      outputs: [],
    })),
    overallStatus: 'idle',
    startedAt: new Date().toISOString(),
  };
}

/** Update a pipeline step status */
export function updateStepStatus(
  pipeline: PipelineStatus,
  stepIndex: number,
  update: Partial<PipelineStepStatus>
): PipelineStatus {
  const steps = pipeline.steps.map((s, i) =>
    i === stepIndex ? { ...s, ...update } : s
  );

  const allDone = steps.every(s => s.status === 'completed' || s.status === 'skipped');
  const anyFailed = steps.some(s => s.status === 'failed');
  const anyRunning = steps.some(s => s.status === 'running');

  let overallStatus: PipelineStatus['overallStatus'] = pipeline.overallStatus;
  if (anyRunning) overallStatus = 'running';
  if (allDone && !anyFailed) overallStatus = 'completed';
  if (allDone && anyFailed) overallStatus = 'partial';
  if (anyFailed && !anyRunning) overallStatus = 'failed';

  return {
    ...pipeline,
    steps,
    overallStatus,
    completedAt: overallStatus === 'completed' || overallStatus === 'partial' || overallStatus === 'failed'
      ? new Date().toISOString()
      : undefined,
  };
}
