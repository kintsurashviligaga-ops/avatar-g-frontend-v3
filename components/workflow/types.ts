/**
 * Shared types for the Workflow Pipeline Builder UI.
 */

export interface PipelineStep {
  id: string;
  serviceId: string;
  prompt: string;
  parameters: Record<string, string>;
  retryPolicy: { maxRetries: number; backoffMs: number };
}

export type BuilderMode = 'gallery' | 'build' | 'run';

export interface RunStepStatus {
  stepId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  outputPreview?: string;
  errorMessage?: string;
  executionMs?: number;
  costCredits?: number;
}

export interface PipelineRunState {
  runId: string;
  workflowId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  steps: RunStepStatus[];
  logs: { at: string; level: string; message: string }[];
}

/** Convert UI pipeline steps to the backend WorkflowStepDefinition format */
export function toWorkflowSteps(steps: PipelineStep[]) {
  return steps.map((step, idx) => {
    const prev = idx > 0 ? steps[idx - 1] : undefined;
    const next = idx < steps.length - 1 ? steps[idx + 1] : undefined;
    return {
      stepId: step.id,
      serviceSlug: step.serviceId,
      inputMapping:
        idx === 0 || !prev
          ? { prompt: '$trigger.prompt', input: '$trigger.input' }
          : {
              prompt: step.prompt ? '$trigger.prompt' : `$steps.${prev.id}.output`,
              input: `$steps.${prev.id}.output`,
            },
      outputMapping: { output: '$output.result' },
      retryPolicy: step.retryPolicy,
      nextStepIds: next ? [next.id] : [],
    };
  });
}

/** Generate a short unique step id */
export function newStepId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
