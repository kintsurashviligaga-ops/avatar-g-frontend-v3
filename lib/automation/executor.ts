/**
 * Automation Executor — Phase 5
 * Runs plan steps async with retries, artifact storage, and status updates
 */

import type { AutomationPlan, AutomationStep } from './planner';

export interface StepResult {
  stepId: string;
  status: 'success' | 'failed' | 'retrying';
  attempt: number;
  artifacts: ArtifactResult[];
  error?: string;
  durationMs: number;
  creditsUsed: number;
}

export interface ArtifactResult {
  type: 'image' | 'video' | 'audio' | 'text' | 'json' | 'file';
  url?: string;
  content?: string;
  mimeType: string;
  sizeBytes?: number;
  label: string;
}

export interface ExecutionResult {
  planId: string;
  status: 'completed' | 'partial' | 'failed';
  stepResults: StepResult[];
  totalCreditsUsed: number;
  totalDurationMs: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

type StepHandler = (step: AutomationStep) => Promise<{
  artifacts: ArtifactResult[];
  creditsUsed: number;
}>;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a single step with retries
 */
async function executeStep(
  step: AutomationStep,
  handler: StepHandler,
): Promise<StepResult> {
  let attempt = 0;
  const startTime = Date.now();

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const result = await handler(step);
      return {
        stepId: step.stepId,
        status: 'success',
        attempt,
        artifacts: result.artifacts,
        durationMs: Date.now() - startTime,
        creditsUsed: result.creditsUsed,
      };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      return {
        stepId: step.stepId,
        status: 'failed',
        attempt,
        artifacts: [],
        error: err instanceof Error ? err.message : 'Unknown error',
        durationMs: Date.now() - startTime,
        creditsUsed: 0,
      };
    }
  }

  // Should not reach here, but TypeScript needs it
  return {
    stepId: step.stepId,
    status: 'failed',
    attempt,
    artifacts: [],
    error: 'Max retries exhausted',
    durationMs: Date.now() - startTime,
    creditsUsed: 0,
  };
}

/**
 * Build dependency graph and execute steps in order
 */
function topologicalSort(steps: AutomationStep[]): AutomationStep[][] {
  const levels: AutomationStep[][] = [];
  const completed = new Set<string>();
  const remaining = [...steps];

  while (remaining.length > 0) {
    const level: AutomationStep[] = [];
    const nextRemaining: AutomationStep[] = [];

    for (const step of remaining) {
      const depsResolved = step.dependsOn.every(dep => !dep || completed.has(dep));
      if (depsResolved) {
        level.push(step);
      } else {
        nextRemaining.push(step);
      }
    }

    if (level.length === 0 && nextRemaining.length > 0) {
      // Circular dependency — force run remaining
      levels.push(nextRemaining);
      break;
    }

    levels.push(level);
    for (const s of level) {
      completed.add(s.stepId);
    }
    remaining.length = 0;
    remaining.push(...nextRemaining);
  }

  return levels;
}

/**
 * Execute full automation plan
 */
export async function executePlan(
  plan: AutomationPlan,
  handler: StepHandler,
  onProgress?: (stepId: string, status: string) => void,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const stepResults: StepResult[] = [];
  const levels = topologicalSort(plan.steps);

  for (const level of levels) {
    // Execute steps within the same level in parallel
    const results = await Promise.all(
      level.map(async (step) => {
        onProgress?.(step.stepId, 'running');
        const result = await executeStep(step, handler);
        onProgress?.(step.stepId, result.status);
        return result;
      })
    );
    stepResults.push(...results);

    // If any step in this level failed, stop execution
    if (results.some(r => r.status === 'failed')) {
      break;
    }
  }

  const totalCreditsUsed = stepResults.reduce((sum, r) => sum + r.creditsUsed, 0);
  const allSuccess = stepResults.every(r => r.status === 'success');
  const anyFailed = stepResults.some(r => r.status === 'failed');

  return {
    planId: plan.planId,
    status: allSuccess ? 'completed' : anyFailed ? 'failed' : 'partial',
    stepResults,
    totalCreditsUsed,
    totalDurationMs: Date.now() - startTime,
  };
}
