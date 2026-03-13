/**
 * lib/agents/orchestrator.ts
 * ==========================
 * Agent G Orchestration Engine — the brain of the multi-agent system.
 *
 * Handles:
 * 1. Intent classification (what does the user want?)
 * 2. Agent selection (which agents should handle it?)
 * 3. Pipeline planning (what order, what dependencies?)
 * 4. Execution with DAG support (parallel where possible)
 * 5. Quality gates between steps
 * 6. Result aggregation
 */

import { AGENT_CONTRACTS, matchAgentsByIntent, getAgentContract, getHandoffTargets } from './contracts';
import type { AgentContract } from './contracts';
import type {
  SessionContext,
  PipelineStatus,
  HandoffPayload,
  HandoffResult,
  AssetEntry,
} from './context';
import {
  createSessionContext,
  createPipelineStatus,
  updateStepStatus,
  addAsset,
  addNote,
  advanceStep,
} from './context';
import { AGENT_G_BUNDLES } from '@/types/agents';
import type { AgentGBundle } from '@/types/agents';

// ─── Intent Classification ───────────────────────────────────────────────────

export type IntentType =
  | 'single-agent'     // One agent can handle it
  | 'multi-agent'      // Needs multiple agents sequentially
  | 'pipeline'         // Matches a known pipeline/bundle
  | 'conversational';  // Chat/question, no generation needed

export interface ClassifiedIntent {
  type: IntentType;
  primaryAgent: string;
  supportingAgents: string[];
  matchedBundle?: AgentGBundle;
  confidence: number;
  reasoning: string;
}

/** Classify user intent into routing decision */
export function classifyIntent(userMessage: string): ClassifiedIntent {
  const msg = userMessage.toLowerCase();

  // Check for explicit bundle/pipeline requests
  const matchedBundle = matchBundle(msg);
  if (matchedBundle) {
    return {
      type: 'pipeline',
      primaryAgent: 'agent-g',
      supportingAgents: [...new Set(matchedBundle.steps.map(s => s.agentId))],
      matchedBundle,
      confidence: 0.95,
      reasoning: `Matched pipeline: ${matchedBundle.label}`,
    };
  }

  // Check for multi-step indicators
  const multiStepIndicators = [
    'and then', 'after that', 'followed by', 'next step', 'pipeline',
    'workflow', 'bundle', 'full pack', 'complete', 'end-to-end',
    'კიდე', 'შემდეგ', 'პაიპლაინი', 'სრული', 'пайплайн', 'полный',
  ];
  const isMultiStep = multiStepIndicators.some(ind => msg.includes(ind));

  // Match agents by domain keywords
  const matched = matchAgentsByIntent(userMessage);

  if (matched.length === 0) {
    // Conversational — just Agent G chatting
    return {
      type: 'conversational',
      primaryAgent: 'agent-g',
      supportingAgents: [],
      confidence: 0.7,
      reasoning: 'No specific service intent detected — conversational routing',
    };
  }

  if (matched.length === 1 && !isMultiStep) {
    const first = matched[0];
    if (first) {
      return {
        type: 'single-agent',
        primaryAgent: first.agentId,
        supportingAgents: [],
        confidence: 0.85,
        reasoning: `Single agent match: ${first.name}`,
      };
    }
  }

  // Multi-agent: pick top agents
  const primary = matched[0];
  if (!primary) {
    return {
      type: 'conversational',
      primaryAgent: 'agent-g',
      supportingAgents: [],
      confidence: 0.6,
      reasoning: 'Fallback: no primary agent resolved',
    };
  }
  const supporting = matched.slice(1, 4).map(a => a.agentId);

  return {
    type: isMultiStep ? 'multi-agent' : 'single-agent',
    primaryAgent: primary.agentId,
    supportingAgents: supporting,
    confidence: isMultiStep ? 0.8 : 0.85,
    reasoning: `Primary: ${primary.name}, supporting: ${supporting.join(', ')}`,
  };
}

/** Match user message against known bundles */
function matchBundle(msg: string): AgentGBundle | undefined {
  const bundleKeywords: Record<string, string[]> = {
    reels_pack_10: ['reels pack', 'reels 10', '10 reels', '10 shorts', 'short-form pack', 'რილსები'],
    brand_launch_kit: ['brand kit', 'brand launch', 'brand identity', 'brand pack', 'ბრენდის ნაკრები'],
    song_cover_clip: ['song release', 'single release', 'cover + clip', 'music release', 'სიმღერის გამოშვება'],
    product_promo_kit: ['product promo', 'promo kit', 'campaign pack', 'ad pack', 'პროდუქტის პრომო'],
  };

  for (const bundle of AGENT_G_BUNDLES) {
    const keywords = bundleKeywords[bundle.type] ?? [];
    if (keywords.some(kw => msg.includes(kw))) {
      return bundle;
    }
  }
  return undefined;
}

// ─── Pipeline Planning ───────────────────────────────────────────────────────

export interface PlannedPipeline {
  sessionContext: SessionContext;
  pipelineStatus: PipelineStatus;
  steps: PlannedStep[];
}

export interface PlannedStep {
  stepIndex: number;
  agentId: string;
  label: string;
  task: string;
  dependsOn: number[];
}

/** Plan a pipeline from a classified intent */
export function planPipeline(
  intent: ClassifiedIntent,
  userId: string,
  userGoal: string,
  sessionId: string
): PlannedPipeline {
  let steps: PlannedStep[];

  if (intent.type === 'pipeline' && intent.matchedBundle) {
    // Use the bundle's predefined DAG
    steps = intent.matchedBundle.steps.map((s, i) => ({
      stepIndex: i,
      agentId: s.agentId,
      label: s.label,
      task: s.label,
      dependsOn: s.dependsOn ?? [],
    }));
  } else if (intent.type === 'multi-agent') {
    // Build a sequential pipeline from matched agents
    const allAgents = [intent.primaryAgent, ...intent.supportingAgents];
    steps = allAgents.map((agentId, i) => {
      const contract = getAgentContract(agentId);
      return {
        stepIndex: i,
        agentId,
        label: contract?.name ?? agentId,
        task: `Step ${i + 1}: ${contract?.name ?? agentId}`,
        dependsOn: i > 0 ? [i - 1] : [],
      };
    });
  } else {
    // Single agent — one step
    const contract = getAgentContract(intent.primaryAgent);
    steps = [{
      stepIndex: 0,
      agentId: intent.primaryAgent,
      label: contract?.name ?? intent.primaryAgent,
      task: userGoal,
      dependsOn: [],
    }];
  }

  const ctx = createSessionContext({
    sessionId,
    userId,
    userGoal,
    totalSteps: steps.length,
  });

  const status = createPipelineStatus(
    sessionId,
    steps.map(s => ({ agentId: s.agentId, label: s.label })),
    intent.matchedBundle?.type
  );

  return { sessionContext: ctx, pipelineStatus: status, steps };
}

// ─── DAG Execution ───────────────────────────────────────────────────────────

/** Get steps that are ready to execute (all dependencies met) */
export function getReadySteps(
  steps: PlannedStep[],
  pipelineStatus: PipelineStatus
): PlannedStep[] {
  const completedIndices = new Set(
    pipelineStatus.steps
      .filter(s => s.status === 'completed' || s.status === 'skipped')
      .map(s => s.stepIndex)
  );

  const runningIndices = new Set(
    pipelineStatus.steps
      .filter(s => s.status === 'running')
      .map(s => s.stepIndex)
  );

  return steps.filter(step => {
    // Already completed or running
    if (completedIndices.has(step.stepIndex) || runningIndices.has(step.stepIndex)) {
      return false;
    }
    // All dependencies met
    return step.dependsOn.every(dep => completedIndices.has(dep));
  });
}

/** Execute a single step (call delegate endpoint) */
export async function executeStep(
  step: PlannedStep,
  ctx: SessionContext,
  options: {
    origin: string;
    authHeader?: string;
    internalSecret?: string;
  }
): Promise<HandoffResult> {
  const contract = getAgentContract(step.agentId);
  if (!contract) {
    return {
      success: false,
      handledBy: step.agentId,
      outputs: [],
      error: `Agent ${step.agentId} not found in registry`,
      durationMs: 0,
    };
  }

  const startTime = Date.now();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (options.authHeader) {
    headers.authorization = options.authHeader;
  }
  if (options.internalSecret) {
    headers['x-agent-g-secret'] = options.internalSecret;
  }

  // Gather inputs from context (assets produced by dependency steps)
  const relevantAssets = ctx.assets.filter(a => {
    const depSteps = step.dependsOn;
    return depSteps.length === 0 || depSteps.includes(a.stepIndex);
  });

  const payload = {
    agent_id: step.agentId,
    agent_name: contract.name,
    task: step.task,
    session_id: ctx.sessionId,
    user_goal: ctx.userGoal,
    language: ctx.language,
    inputs: relevantAssets.map(a => ({
      type: a.type,
      url: a.url,
      content: a.content,
      label: a.label,
    })),
    system_prompt: contract.systemPrompt,
    model: contract.model,
    provider: contract.provider,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), contract.timeoutSeconds * 1000);

    const response = await fetch(`${options.origin}/api/agent-g/delegate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    const json = (await response.json().catch(() => null)) as
      | { status?: string; data?: { output?: Record<string, unknown>; artifacts?: AssetEntry[] }; error?: string }
      | null;

    const durationMs = Date.now() - startTime;

    if (!response.ok || !json || json.status === 'error') {
      return {
        success: false,
        handledBy: step.agentId,
        outputs: [],
        error: json?.error ?? `Delegate call failed (${response.status})`,
        durationMs,
      };
    }

    const outputs: AssetEntry[] = json.data?.artifacts ?? [];

    return {
      success: true,
      handledBy: step.agentId,
      outputs,
      durationMs,
    };
  } catch (error) {
    return {
      success: false,
      handledBy: step.agentId,
      outputs: [],
      error: error instanceof Error ? error.message : 'Execution failed',
      durationMs: Date.now() - startTime,
    };
  }
}

/** Execute an entire pipeline with DAG support */
export async function executePipeline(
  pipeline: PlannedPipeline,
  options: {
    origin: string;
    authHeader?: string;
    internalSecret?: string;
    onStepUpdate?: (status: PipelineStatus) => void;
  }
): Promise<{ context: SessionContext; status: PipelineStatus }> {
  let ctx = { ...pipeline.sessionContext, pipelineStatus: 'running' as SessionContext['pipelineStatus'] };
  let status = { ...pipeline.pipelineStatus, overallStatus: 'running' as PipelineStatus['overallStatus'] };

  options.onStepUpdate?.(status);

  // Keep executing until all steps are done or failed
  let maxIterations = pipeline.steps.length * 3; // safety limit
  while (maxIterations > 0) {
    maxIterations--;

    const ready = getReadySteps(pipeline.steps, status);
    if (ready.length === 0) {
      // No more steps ready — we're done
      break;
    }

    // Execute all ready steps in parallel
    const results = await Promise.all(
      ready.map(async (step) => {
        // Mark as running
        status = updateStepStatus(status, step.stepIndex, {
          status: 'running',
          startedAt: new Date().toISOString(),
        });
        options.onStepUpdate?.(status);

        const result = await executeStep(step, ctx, options);

        // Update status
        status = updateStepStatus(status, step.stepIndex, {
          status: result.success ? 'completed' : 'failed',
          completedAt: new Date().toISOString(),
          durationMs: result.durationMs,
          qaScore: result.qaScore,
          outputs: result.outputs,
          error: result.error,
        });

        // Add outputs to context
        for (const output of result.outputs) {
          ctx = addAsset(ctx, {
            producedBy: step.agentId,
            stepIndex: step.stepIndex,
            type: output.type,
            label: output.label,
            url: output.url,
            content: output.content,
            mimeType: output.mimeType,
            sizeBytes: output.sizeBytes,
            qaScore: output.qaScore,
          });
        }

        // Add agent note
        ctx = addNote(ctx, {
          fromAgent: step.agentId,
          toAgent: '*',
          type: result.success ? 'info' : 'error',
          message: result.success
            ? `${step.label} completed (${result.durationMs}ms)`
            : `${step.label} failed: ${result.error}`,
        });

        ctx = advanceStep(ctx);
        options.onStepUpdate?.(status);

        return { step, result };
      })
    );
  }

  // Final status
  const allCompleted = status.steps.every(s => s.status === 'completed' || s.status === 'skipped');
  const anyFailed = status.steps.some(s => s.status === 'failed');
  const finalOverall: PipelineStatus['overallStatus'] = allCompleted ? 'completed' : anyFailed ? 'partial' : 'failed';
  status = {
    ...status,
    overallStatus: finalOverall,
    completedAt: new Date().toISOString(),
    totalDurationMs: Date.now() - new Date(status.startedAt).getTime(),
  };

  const finalPipeline: SessionContext['pipelineStatus'] = allCompleted ? 'completed' : 'failed';
  ctx = { ...ctx, pipelineStatus: finalPipeline };

  options.onStepUpdate?.(status);

  return { context: ctx, status };
}

// ─── Result Aggregation ──────────────────────────────────────────────────────

export interface AggregatedResult {
  summary: string;
  steps: {
    agent: string;
    label: string;
    status: string;
    outputs: AssetEntry[];
    qaScore?: number;
    durationMs?: number;
  }[];
  totalAssets: number;
  totalDurationMs: number;
  overallQaScore: number;
  success: boolean;
}

/** Aggregate pipeline results into a final summary */
export function aggregateResults(
  ctx: SessionContext,
  status: PipelineStatus
): AggregatedResult {
  const steps = status.steps.map(s => {
    const contract = getAgentContract(s.agentId);
    return {
      agent: contract?.name ?? s.agentId,
      label: s.label,
      status: s.status,
      outputs: s.outputs,
      qaScore: s.qaScore,
      durationMs: s.durationMs,
    };
  });

  const completedSteps = steps.filter(s => s.status === 'completed');
  const qaScores = completedSteps.map(s => s.qaScore).filter((s): s is number => s != null);
  const avgQa = qaScores.length > 0 ? Math.round(qaScores.reduce((a, b) => a + b, 0) / qaScores.length) : 0;

  return {
    summary: `Pipeline ${status.overallStatus}: ${completedSteps.length}/${steps.length} steps completed`,
    steps,
    totalAssets: ctx.assets.length,
    totalDurationMs: status.totalDurationMs ?? 0,
    overallQaScore: avgQa,
    success: status.overallStatus === 'completed',
  };
}
