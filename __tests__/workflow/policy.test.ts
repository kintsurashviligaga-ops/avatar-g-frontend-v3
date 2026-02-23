import { getWorkflowTierLimits, validateWorkflowForPlan } from '@/lib/workflows/runner';
import { BillingEnforcementError } from '@/lib/billing/enforce';
import type { WorkflowStepDefinition } from '@/lib/workflows/types';

function buildSteps(count: number): WorkflowStepDefinition[] {
  return Array.from({ length: count }).map((_, index) => {
    const id = `step_${index + 1}`;
    const next = index + 1 < count ? [`step_${index + 2}`] : [];

    return {
      stepId: id,
      serviceSlug: 'text-intelligence',
      inputMapping: { prompt: '$trigger.prompt' },
      outputMapping: { text: '$output.text' },
      retryPolicy: { maxRetries: 1, backoffMs: 1000 },
      nextStepIds: next,
    };
  });
}

describe('Workflow Tier Policy', () => {
  const parallelSteps: WorkflowStepDefinition[] = [
    {
      stepId: 'step_1',
      serviceSlug: 'text-intelligence',
      inputMapping: { prompt: '$trigger.prompt' },
      outputMapping: { text: '$output.text' },
      retryPolicy: { maxRetries: 0 },
      nextStepIds: ['step_2', 'step_3'],
    },
    {
      stepId: 'step_2',
      serviceSlug: 'image-creator',
      inputMapping: { prompt: '$steps.step_1.output.text' },
      outputMapping: { image: '$output.preview_url' },
      retryPolicy: { maxRetries: 1 },
      nextStepIds: [],
    },
    {
      stepId: 'step_3',
      serviceSlug: 'video-studio',
      inputMapping: { prompt: '$steps.step_1.output.text' },
      outputMapping: { video: '$output.preview_url' },
      retryPolicy: { maxRetries: 1 },
      nextStepIds: [],
    },
  ];

  test('enforces Free plan restriction', () => {
    const limits = getWorkflowTierLimits('FREE');
    expect(limits.canUseWorkflows).toBe(false);

    expect(() => validateWorkflowForPlan(buildSteps(1), 'FREE')).toThrow(BillingEnforcementError);
  });

  test('enforces Basic plan max 2 steps', () => {
    expect(() => validateWorkflowForPlan(buildSteps(2), 'PRO')).not.toThrow();
    expect(() => validateWorkflowForPlan(buildSteps(3), 'PRO')).toThrow(BillingEnforcementError);
  });

  test('enforces Premium plan max 5 steps', () => {
    expect(() => validateWorkflowForPlan(buildSteps(5), 'PREMIUM')).not.toThrow();
    expect(() => validateWorkflowForPlan(buildSteps(6), 'PREMIUM')).toThrow(BillingEnforcementError);
  });

  test('allows Full plan parallel branches', () => {
    expect(() => validateWorkflowForPlan(parallelSteps, 'ENTERPRISE')).not.toThrow();
    expect(() => validateWorkflowForPlan(parallelSteps, 'PRO')).toThrow(BillingEnforcementError);
  });

  test('enterprise downgrade safety blocks previously valid parallel workflow', () => {
    expect(() => validateWorkflowForPlan(parallelSteps, 'ENTERPRISE')).not.toThrow();
    expect(() => validateWorkflowForPlan(parallelSteps, 'PREMIUM')).toThrow(BillingEnforcementError);
    expect(() => validateWorkflowForPlan(parallelSteps, 'PRO')).toThrow(BillingEnforcementError);
  });

  test('upgrade path coverage from FREE to PRO to PREMIUM', () => {
    const twoStepWorkflow = buildSteps(2);
    const fourStepWorkflow = buildSteps(4);

    expect(() => validateWorkflowForPlan(twoStepWorkflow, 'FREE')).toThrow(BillingEnforcementError);
    expect(() => validateWorkflowForPlan(twoStepWorkflow, 'PRO')).not.toThrow();

    expect(() => validateWorkflowForPlan(fourStepWorkflow, 'PRO')).toThrow(BillingEnforcementError);
    expect(() => validateWorkflowForPlan(fourStepWorkflow, 'PREMIUM')).not.toThrow();
  });

  test('tier upgrade/downgrade simulation', () => {
    const fourStepWorkflow = buildSteps(4);

    // Upgrade path: fails on PRO, passes on PREMIUM
    expect(() => validateWorkflowForPlan(fourStepWorkflow, 'PRO')).toThrow(BillingEnforcementError);
    expect(() => validateWorkflowForPlan(fourStepWorkflow, 'PREMIUM')).not.toThrow();

    // Downgrade path: currently valid on PREMIUM, invalid after downgrade to PRO
    expect(() => validateWorkflowForPlan(fourStepWorkflow, 'PRO')).toThrow(BillingEnforcementError);
  });
});
