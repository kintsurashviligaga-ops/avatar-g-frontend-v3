import 'server-only';

import { createServerClient } from '@/lib/supabase/server';
import {
  BillingEnforcementError,
  deductCreditsTransaction,
  enforcePlanAndCredits,
  getBillingSnapshot,
} from '@/lib/billing/enforce';
import { getCreditCost, getPlanRank, type PlanTier } from '@/lib/billing/plans';
import { getServiceBySlug } from '@/lib/app/services';
import type {
  WorkflowDefinitionEntity,
  WorkflowLogEntry,
  WorkflowRunContext,
  WorkflowRunEntity,
  WorkflowStepDefinition,
  WorkflowStepRunEntity,
  WorkflowTierLimits,
} from '@/lib/workflows/types';

export function getWorkflowTierLimits(plan: PlanTier): WorkflowTierLimits {
  if (plan === 'FREE') {
    return { canUseWorkflows: false, maxSteps: 0, allowParallel: false, label: 'Free' };
  }
  if (plan === 'PRO') {
    return { canUseWorkflows: true, maxSteps: 2, allowParallel: false, label: 'Basic' };
  }
  if (plan === 'PREMIUM') {
    return { canUseWorkflows: true, maxSteps: 5, allowParallel: false, label: 'Premium' };
  }
  return { canUseWorkflows: true, maxSteps: Number.MAX_SAFE_INTEGER, allowParallel: true, label: 'Full' };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseJsonArray(value: unknown): WorkflowLogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value as WorkflowLogEntry[];
}

function mapWorkflowDefinitionRow(row: Record<string, unknown>): WorkflowDefinitionEntity {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    steps: (Array.isArray(row.steps) ? row.steps : []) as WorkflowStepDefinition[],
    status: String(row.status) as WorkflowDefinitionEntity['status'],
    currentStep: row.current_step ? String(row.current_step) : null,
    result: row.result ? parseJsonObject(row.result) : null,
    logs: parseJsonArray(row.logs),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapWorkflowRunRow(row: Record<string, unknown>): WorkflowRunEntity {
  return {
    id: String(row.id),
    workflowId: String(row.workflow_id),
    userId: String(row.user_id),
    status: String(row.status) as WorkflowRunEntity['status'],
    currentStep: row.current_step ? String(row.current_step) : null,
    result: row.result ? parseJsonObject(row.result) : null,
    logs: parseJsonArray(row.logs),
    triggerInput: parseJsonObject(row.trigger_input),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
  };
}

function mapStepRunRow(row: Record<string, unknown>): WorkflowStepRunEntity {
  return {
    id: String(row.id),
    workflowRunId: String(row.workflow_run_id),
    workflowId: String(row.workflow_id),
    userId: String(row.user_id),
    stepId: String(row.step_id),
    serviceSlug: String(row.service_slug),
    status: String(row.status) as WorkflowStepRunEntity['status'],
    attemptCount: Number(row.attempt_count ?? 0),
    maxAttempts: Number(row.max_attempts ?? 1),
    inputPayload: parseJsonObject(row.input_payload),
    outputPayload: row.output_payload ? parseJsonObject(row.output_payload) : null,
    diagnostics: row.diagnostics ? parseJsonObject(row.diagnostics) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    costCredits: Number(row.cost_credits ?? 0),
    executionMs: row.execution_ms ? Number(row.execution_ms) : null,
    serviceJobId: row.service_job_id ? String(row.service_job_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
  };
}

function getByPath(root: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.').filter(Boolean);
  let current: unknown = root;
  for (const key of keys) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setByPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.').filter(Boolean);
  if (keys.length === 0) return;

  let cursor = root;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!key) {
      continue;
    }
    const existing = cursor[key];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  const lastKey = keys[keys.length - 1];
  if (!lastKey) {
    return;
  }
  cursor[lastKey] = value;
}

function applyInputMapping(
  mapping: Record<string, string>,
  context: WorkflowRunContext
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [targetPath, sourcePath] of Object.entries(mapping)) {
    let value: unknown;
    if (sourcePath.startsWith('$trigger.')) {
      value = getByPath(context.trigger, sourcePath.replace('$trigger.', ''));
    } else if (sourcePath.startsWith('$steps.')) {
      value = getByPath(context.steps, sourcePath.replace('$steps.', ''));
    } else if (sourcePath.startsWith('$run.')) {
      value = getByPath(context.run, sourcePath.replace('$run.', ''));
    } else {
      value = sourcePath;
    }

    if (value !== undefined) {
      setByPath(payload, targetPath, value);
    }
  }

  return payload;
}

function applyOutputMapping(
  mapping: Record<string, string>,
  output: Record<string, unknown>
): Record<string, unknown> {
  if (Object.keys(mapping).length === 0) {
    return output;
  }

  const mapped: Record<string, unknown> = {};
  for (const [targetPath, sourcePath] of Object.entries(mapping)) {
    const normalizedSource = sourcePath.startsWith('$output.')
      ? sourcePath.replace('$output.', '')
      : sourcePath;
    const value = getByPath(output, normalizedSource);
    if (value !== undefined) {
      setByPath(mapped, targetPath, value);
    }
  }
  return mapped;
}

function normalizeSteps(steps: WorkflowStepDefinition[]): WorkflowStepDefinition[] {
  const withNext = steps.map((step, index) => {
    if (step.nextStepIds && step.nextStepIds.length > 0) {
      return step;
    }
    const next = steps[index + 1];
    return {
      ...step,
      nextStepIds: next ? [next.stepId] : [],
    };
  });
  return withNext;
}

function buildPredecessorMap(steps: WorkflowStepDefinition[]): Map<string, Set<string>> {
  const predecessorMap = new Map<string, Set<string>>();

  for (const step of steps) {
    if (!predecessorMap.has(step.stepId)) {
      predecessorMap.set(step.stepId, new Set<string>());
    }
  }

  for (const step of steps) {
    for (const nextStepId of step.nextStepIds ?? []) {
      if (!predecessorMap.has(nextStepId)) {
        predecessorMap.set(nextStepId, new Set<string>());
      }
      predecessorMap.get(nextStepId)?.add(step.stepId);
    }
  }

  return predecessorMap;
}

function getRootSteps(steps: WorkflowStepDefinition[]): WorkflowStepDefinition[] {
  const predecessorMap = buildPredecessorMap(steps);
  return steps.filter((step) => (predecessorMap.get(step.stepId)?.size ?? 0) === 0);
}

export function validateWorkflowForPlan(steps: WorkflowStepDefinition[], plan: PlanTier): void {
  const limits = getWorkflowTierLimits(plan);
  if (!limits.canUseWorkflows) {
    throw new BillingEnforcementError('Workflow automation is not available on Free plan', 403, 'WORKFLOW_PLAN_REQUIRED', {
      currentPlan: plan,
      requiredPlan: 'PRO',
    });
  }

  if (steps.length > limits.maxSteps) {
    throw new BillingEnforcementError('Workflow step limit reached for your plan', 403, 'WORKFLOW_STEP_LIMIT', {
      currentPlan: plan,
      maxSteps: limits.maxSteps,
      attemptedSteps: steps.length,
    });
  }

  if (!limits.allowParallel) {
    const fanOutStep = steps.find((step) => (step.nextStepIds?.length ?? 0) > 1);
    if (fanOutStep) {
      throw new BillingEnforcementError('Parallel branches require Full plan', 403, 'WORKFLOW_PARALLEL_RESTRICTED', {
        currentPlan: plan,
        stepId: fanOutStep.stepId,
      });
    }

    const roots = getRootSteps(steps);
    if (roots.length > 1) {
      throw new BillingEnforcementError('Parallel roots require Full plan', 403, 'WORKFLOW_PARALLEL_RESTRICTED', {
        currentPlan: plan,
        roots: roots.map((root) => root.stepId),
      });
    }
  }
}

async function appendRunLog(runId: string, userId: string, log: WorkflowLogEntry): Promise<void> {
  const supabase = createServerClient();
  const { data: runRow } = await supabase
    .from('workflow_runs')
    .select('logs')
    .eq('id', runId)
    .eq('user_id', userId)
    .single();

  const logs = parseJsonArray(runRow?.logs);
  logs.push(log);

  await supabase
    .from('workflow_runs')
    .update({ logs })
    .eq('id', runId)
    .eq('user_id', userId);
}

export async function getWorkflowDefinition(input: { userId: string; workflowId: string }): Promise<WorkflowDefinitionEntity> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('workflow_definitions')
    .select('*')
    .eq('id', input.workflowId)
    .eq('user_id', input.userId)
    .single();

  if (error || !data) {
    throw new Error('Workflow not found');
  }

  return mapWorkflowDefinitionRow(data as unknown as Record<string, unknown>);
}

async function enqueueStepExecution(input: {
  userId: string;
  workflow: WorkflowDefinitionEntity;
  run: WorkflowRunEntity;
  step: WorkflowStepDefinition;
  context: WorkflowRunContext;
  forceRetry?: boolean;
}): Promise<WorkflowStepRunEntity> {
  const supabase = createServerClient();

  const { data: existingRow } = await supabase
    .from('workflow_step_runs')
    .select('*')
    .eq('workflow_run_id', input.run.id)
    .eq('step_id', input.step.stepId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (existingRow) {
    const existingStatus = String(existingRow.status);
    const canReuse = ['queued', 'processing', 'completed'].includes(existingStatus);
    if (canReuse && !input.forceRetry) {
      return mapStepRunRow(existingRow as unknown as Record<string, unknown>);
    }

    if (existingStatus === 'failed' && !input.forceRetry) {
      return mapStepRunRow(existingRow as unknown as Record<string, unknown>);
    }
  }

  const service = getServiceBySlug(input.step.serviceSlug);
  if (!service) {
    throw new Error(`Unknown service slug: ${input.step.serviceSlug}`);
  }

  const minPlan = input.step.tierRequirements?.minPlan ?? 'FREE';
  const stepAction = `${input.step.serviceSlug}.generate`;
  const cost = getCreditCost(stepAction, service.credits);

  const billing = await enforcePlanAndCredits({
    userId: input.userId,
    requiredPlan: minPlan,
    agentId: input.step.serviceSlug,
    cost,
  });

  if (getPlanRank(billing.plan) < getPlanRank(minPlan)) {
    throw new BillingEnforcementError('Step requires higher plan tier', 403, 'WORKFLOW_STEP_PLAN_REQUIRED', {
      currentPlan: billing.plan,
      requiredPlan: minPlan,
      stepId: input.step.stepId,
    });
  }

  const mappedInput = applyInputMapping(input.step.inputMapping, input.context);
  const jobInputPayload = {
    ...mappedInput,
    queue_priority: billing.plan === 'ENTERPRISE' ? 'critical' : billing.plan === 'PREMIUM' ? 'high' : 'normal',
    workflow: {
      workflow_id: input.workflow.id,
      workflow_run_id: input.run.id,
      step_id: input.step.stepId,
    },
  };

  const maxAttempts = Math.max(1, (input.step.retryPolicy.maxRetries ?? 0) + 1);
  const now = new Date();

  const { data: serviceJob, error: serviceJobError } = await supabase
    .from('service_jobs')
    .insert({
      user_id: input.userId,
      service_slug: input.step.serviceSlug,
      title: `Workflow ${input.workflow.name} • ${input.step.stepId}`,
      status: 'queued',
      progress: 0,
      input_payload: jobInputPayload,
      max_attempts: maxAttempts,
      attempt_count: 0,
      heartbeat_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (serviceJobError || !serviceJob) {
    throw new Error(serviceJobError?.message || 'Failed to enqueue service job for workflow step');
  }

  await deductCreditsTransaction({
    userId: input.userId,
    amount: cost,
    jobId: String(serviceJob.id),
    agentId: input.step.serviceSlug,
    reason: `Workflow step ${input.step.stepId}`,
    idempotencyKey: `workflow-step:${input.run.id}:${input.step.stepId}:attempt:${(serviceJob.attempt_count ?? 0) + 1}`,
  });

  const { data: stepRun, error: stepRunError } = await supabase
    .from('workflow_step_runs')
    .upsert(
      {
        workflow_run_id: input.run.id,
        workflow_id: input.workflow.id,
        user_id: input.userId,
        step_id: input.step.stepId,
        service_slug: input.step.serviceSlug,
        status: 'queued',
        attempt_count: Math.max(1, Number((serviceJob as { attempt_count?: number }).attempt_count ?? 1)),
        max_attempts: maxAttempts,
        input_payload: mappedInput,
        output_payload: null,
        diagnostics: null,
        error_message: null,
        cost_credits: cost,
        execution_ms: null,
        service_job_id: serviceJob.id,
        started_at: now.toISOString(),
        finished_at: null,
      },
      { onConflict: 'workflow_run_id,step_id' }
    )
    .select('*')
    .single();

  if (stepRunError || !stepRun) {
    throw new Error(stepRunError?.message || 'Failed to persist workflow step run');
  }

  await appendRunLog(input.run.id, input.userId, {
    at: new Date().toISOString(),
    level: 'info',
    message: `Step enqueued: ${input.step.stepId}`,
    meta: {
      serviceSlug: input.step.serviceSlug,
      serviceJobId: serviceJob.id,
      cost,
    },
  });

  return mapStepRunRow(stepRun as unknown as Record<string, unknown>);
}

export async function startWorkflowRun(input: {
  userId: string;
  workflowId: string;
  triggerInput?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<WorkflowRunEntity> {
  const supabase = createServerClient();
  const workflow = await getWorkflowDefinition({ userId: input.userId, workflowId: input.workflowId });
  const steps = normalizeSteps(workflow.steps);

  const snapshot = await getBillingSnapshot(input.userId);
  validateWorkflowForPlan(steps, snapshot.plan);

  if (input.idempotencyKey) {
    const { data: existingRun } = await supabase
      .from('workflow_runs')
      .select('*')
      .eq('user_id', input.userId)
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();

    if (existingRun) {
      return mapWorkflowRunRow(existingRun as unknown as Record<string, unknown>);
    }
  }

  const triggerInput = input.triggerInput ?? {};

  const { data: runRow, error: runError } = await supabase
    .from('workflow_runs')
    .insert({
      workflow_id: workflow.id,
      user_id: input.userId,
      status: 'running',
      trigger_input: triggerInput,
      logs: [],
      current_step: null,
      started_at: new Date().toISOString(),
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select('*')
    .single();

  if (runError || !runRow) {
    throw new Error(runError?.message || 'Failed to create workflow run');
  }

  const run = mapWorkflowRunRow(runRow as unknown as Record<string, unknown>);
  const roots = getRootSteps(steps);

  const context: WorkflowRunContext = {
    trigger: triggerInput,
    run: { workflowId: workflow.id, runId: run.id },
    steps: {},
  };

  for (const root of roots) {
    await enqueueStepExecution({
      userId: input.userId,
      workflow,
      run,
      step: root,
      context,
    });
  }

  await supabase
    .from('workflow_runs')
    .update({ current_step: roots[0]?.stepId ?? null })
    .eq('id', run.id)
    .eq('user_id', input.userId);

  await appendRunLog(run.id, input.userId, {
    at: new Date().toISOString(),
    level: 'info',
    message: 'Workflow run started',
    meta: {
      workflowId: workflow.id,
      roots: roots.map((root) => root.stepId),
    },
  });

  const { data: freshRun } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('id', run.id)
    .eq('user_id', input.userId)
    .single();

  return mapWorkflowRunRow((freshRun ?? runRow) as unknown as Record<string, unknown>);
}

function buildRunContext(input: {
  run: WorkflowRunEntity;
  stepRuns: WorkflowStepRunEntity[];
}): WorkflowRunContext {
  const steps: WorkflowRunContext['steps'] = {};
  for (const stepRun of input.stepRuns) {
    steps[stepRun.stepId] = {
      input: stepRun.inputPayload,
      output: stepRun.outputPayload ?? undefined,
    };
  }

  return {
    trigger: input.run.triggerInput,
    run: {
      runId: input.run.id,
      workflowId: input.run.workflowId,
      status: input.run.status,
    },
    steps,
  };
}

export async function reconcileWorkflowRun(input: {
  userId: string;
  runId: string;
}): Promise<{ run: WorkflowRunEntity; stepRuns: WorkflowStepRunEntity[] }> {
  const supabase = createServerClient();

  const { data: runRow, error: runError } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('id', input.runId)
    .eq('user_id', input.userId)
    .single();

  if (runError || !runRow) {
    throw new Error('Workflow run not found');
  }

  const run = mapWorkflowRunRow(runRow as unknown as Record<string, unknown>);
  const workflow = await getWorkflowDefinition({ userId: input.userId, workflowId: run.workflowId });
  const steps = normalizeSteps(workflow.steps);
  const predecessorMap = buildPredecessorMap(steps);

  const { data: stepRows, error: stepsError } = await supabase
    .from('workflow_step_runs')
    .select('*')
    .eq('workflow_run_id', run.id)
    .eq('user_id', input.userId)
    .order('created_at', { ascending: true });

  if (stepsError) {
    throw new Error(stepsError.message);
  }

  const stepRuns = (stepRows ?? []).map((row) => mapStepRunRow(row as unknown as Record<string, unknown>));

  for (const stepRun of stepRuns) {
    if (!stepRun.serviceJobId) {
      continue;
    }

    if (!['queued', 'processing'].includes(stepRun.status)) {
      continue;
    }

    const { data: serviceJob } = await supabase
      .from('service_jobs')
      .select('status, output_payload, error_message')
      .eq('id', stepRun.serviceJobId)
      .eq('user_id', input.userId)
      .single();

    if (!serviceJob) {
      continue;
    }

    if (serviceJob.status === 'failed') {
      if (stepRun.attemptCount < stepRun.maxAttempts) {
        const stepDef = steps.find((step) => step.stepId === stepRun.stepId);
        if (!stepDef) {
          throw new Error(`Missing step definition for ${stepRun.stepId}`);
        }

        const context = buildRunContext({ run, stepRuns });
        await enqueueStepExecution({
          userId: input.userId,
          workflow,
          run,
          step: stepDef,
          context,
            forceRetry: true,
        });

        await appendRunLog(run.id, input.userId, {
          at: new Date().toISOString(),
          level: 'warn',
          message: `Retrying step ${stepRun.stepId}`,
          meta: { attempt: stepRun.attemptCount + 1, maxAttempts: stepRun.maxAttempts },
        });
      } else {
        await supabase
          .from('workflow_step_runs')
          .update({
            status: 'failed',
            diagnostics: {
              serviceJobStatus: serviceJob.status,
              failedAt: new Date().toISOString(),
            },
            error_message: serviceJob.error_message ?? 'Step failed',
            execution_ms: stepRun.startedAt
              ? Math.max(0, Date.now() - new Date(stepRun.startedAt).getTime())
              : null,
            finished_at: new Date().toISOString(),
          })
          .eq('id', stepRun.id)
          .eq('user_id', input.userId);

        await supabase
          .from('workflow_runs')
          .update({
            status: 'failed',
            finished_at: new Date().toISOString(),
            current_step: stepRun.stepId,
          })
          .eq('id', run.id)
          .eq('user_id', input.userId);

        await appendRunLog(run.id, input.userId, {
          at: new Date().toISOString(),
          level: 'error',
          message: `Workflow failed at step ${stepRun.stepId}`,
          meta: { error: serviceJob.error_message ?? null },
        });
      }

      continue;
    }

    if (serviceJob.status !== 'completed') {
      continue;
    }

    const stepDef = steps.find((step) => step.stepId === stepRun.stepId);
    const rawOutput = parseJsonObject(serviceJob.output_payload);
    const mappedOutput = applyOutputMapping(stepDef?.outputMapping ?? {}, rawOutput);

    await supabase
      .from('workflow_step_runs')
      .update({
        status: 'completed',
        output_payload: mappedOutput,
        diagnostics: {
          serviceJobStatus: serviceJob.status,
          completedAt: new Date().toISOString(),
        },
        execution_ms: stepRun.startedAt
          ? Math.max(0, Date.now() - new Date(stepRun.startedAt).getTime())
          : null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', stepRun.id)
      .eq('user_id', input.userId);

    await appendRunLog(run.id, input.userId, {
      at: new Date().toISOString(),
      level: 'info',
      message: `Step completed: ${stepRun.stepId}`,
      meta: { serviceJobId: stepRun.serviceJobId },
    });
  }

  const { data: latestStepRows } = await supabase
    .from('workflow_step_runs')
    .select('*')
    .eq('workflow_run_id', run.id)
    .eq('user_id', input.userId)
    .order('created_at', { ascending: true });

  const latestStepRuns = (latestStepRows ?? []).map((row) => mapStepRunRow(row as unknown as Record<string, unknown>));
  const latestByStep = new Map(latestStepRuns.map((row) => [row.stepId, row]));
  const completedSteps = new Set(
    latestStepRuns.filter((row) => row.status === 'completed').map((row) => row.stepId)
  );

  const runRecord = await supabase
    .from('workflow_runs')
    .select('status')
    .eq('id', run.id)
    .eq('user_id', input.userId)
    .single();

  if (runRecord.data?.status === 'running') {
    const context = buildRunContext({ run, stepRuns: latestStepRuns });

    for (const step of steps) {
      const existing = latestByStep.get(step.stepId);
      if (existing) {
        continue;
      }

      const predecessors = predecessorMap.get(step.stepId) ?? new Set<string>();
      const ready = Array.from(predecessors).every((predecessor) => completedSteps.has(predecessor));
      if (!ready) {
        continue;
      }

      await enqueueStepExecution({
        userId: input.userId,
        workflow,
        run,
        step,
        context,
      });

      await supabase
        .from('workflow_runs')
        .update({ current_step: step.stepId })
        .eq('id', run.id)
        .eq('user_id', input.userId);
    }
  }

  const { data: finalRunRow } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('id', run.id)
    .eq('user_id', input.userId)
    .single();

  const { data: finalStepRows } = await supabase
    .from('workflow_step_runs')
    .select('*')
    .eq('workflow_run_id', run.id)
    .eq('user_id', input.userId)
    .order('created_at', { ascending: true });

  const finalRun = mapWorkflowRunRow((finalRunRow ?? runRow) as unknown as Record<string, unknown>);
  const finalSteps = (finalStepRows ?? []).map((row) => mapStepRunRow(row as unknown as Record<string, unknown>));

  if (finalRun.status === 'running') {
    const allCompleted = steps.every((step) => finalSteps.find((row) => row.stepId === step.stepId)?.status === 'completed');
    if (allCompleted) {
      const result: Record<string, unknown> = {};
      for (const step of finalSteps) {
        result[step.stepId] = step.outputPayload;
      }

      await supabase
        .from('workflow_runs')
        .update({
          status: 'completed',
          result,
          finished_at: new Date().toISOString(),
          current_step: null,
        })
        .eq('id', finalRun.id)
        .eq('user_id', input.userId);

      await appendRunLog(finalRun.id, input.userId, {
        at: new Date().toISOString(),
        level: 'info',
        message: 'Workflow completed successfully',
      });

      await supabase
        .from('workflow_definitions')
        .update({
          current_step: null,
          result,
          logs: finalRun.logs,
        })
        .eq('id', finalRun.workflowId)
        .eq('user_id', input.userId);
    }
  }

  const { data: latestRun } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('id', finalRun.id)
    .eq('user_id', input.userId)
    .single();

  const { data: latestStepsRows } = await supabase
    .from('workflow_step_runs')
    .select('*')
    .eq('workflow_run_id', finalRun.id)
    .eq('user_id', input.userId)
    .order('created_at', { ascending: true });

  return {
    run: mapWorkflowRunRow((latestRun ?? finalRunRow ?? runRow) as unknown as Record<string, unknown>),
    stepRuns: (latestStepsRows ?? []).map((row) => mapStepRunRow(row as unknown as Record<string, unknown>)),
  };
}

export async function retryWorkflowStep(input: {
  userId: string;
  runId: string;
  stepId: string;
}): Promise<{ run: WorkflowRunEntity; stepRuns: WorkflowStepRunEntity[] }> {
  const supabase = createServerClient();

  const { data: runRow, error: runError } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('id', input.runId)
    .eq('user_id', input.userId)
    .single();

  if (runError || !runRow) {
    throw new Error('Workflow run not found');
  }

  const run = mapWorkflowRunRow(runRow as unknown as Record<string, unknown>);
  const workflow = await getWorkflowDefinition({ userId: input.userId, workflowId: run.workflowId });
  const step = normalizeSteps(workflow.steps).find((candidate) => candidate.stepId === input.stepId);

  if (!step) {
    throw new Error('Workflow step not found');
  }

  const { data: stepRows } = await supabase
    .from('workflow_step_runs')
    .select('*')
    .eq('workflow_run_id', input.runId)
    .eq('user_id', input.userId);

  const context = buildRunContext({
    run,
    stepRuns: (stepRows ?? []).map((row) => mapStepRunRow(row as unknown as Record<string, unknown>)),
  });

  await supabase
    .from('workflow_runs')
    .update({ status: 'running', current_step: step.stepId, finished_at: null })
    .eq('id', input.runId)
    .eq('user_id', input.userId);

  await enqueueStepExecution({
    userId: input.userId,
    workflow,
    run,
    step,
    context,
    forceRetry: true,
  });

  return reconcileWorkflowRun({ userId: input.userId, runId: input.runId });
}

export async function cancelWorkflowRun(input: {
  userId: string;
  runId: string;
}): Promise<{ run: WorkflowRunEntity; stepRuns: WorkflowStepRunEntity[] }> {
  const supabase = createServerClient();

  const { data: runRow, error: runError } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('id', input.runId)
    .eq('user_id', input.userId)
    .single();

  if (runError || !runRow) {
    throw new Error('Workflow run not found');
  }

  const { data: stepRows } = await supabase
    .from('workflow_step_runs')
    .select('*')
    .eq('workflow_run_id', input.runId)
    .eq('user_id', input.userId);

  const activeStepRuns = (stepRows ?? []).map((row) => mapStepRunRow(row as unknown as Record<string, unknown>));

  for (const stepRun of activeStepRuns) {
    if (!stepRun.serviceJobId) {
      continue;
    }

    if (!['queued', 'processing'].includes(stepRun.status)) {
      continue;
    }

    await supabase
      .from('service_jobs')
      .update({
        status: 'failed',
        progress: 100,
        error_message: 'Cancelled by workflow operator',
      })
      .eq('id', stepRun.serviceJobId)
      .eq('user_id', input.userId);

    await supabase
      .from('workflow_step_runs')
      .update({
        status: 'failed',
        error_message: 'Cancelled by workflow operator',
        diagnostics: {
          cancelledAt: new Date().toISOString(),
          reason: 'operator_cancel',
        },
        finished_at: new Date().toISOString(),
      })
      .eq('id', stepRun.id)
      .eq('user_id', input.userId);
  }

  await supabase
    .from('workflow_runs')
    .update({
      status: 'cancelled',
      current_step: null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', input.runId)
    .eq('user_id', input.userId);

  return reconcileWorkflowRun({ userId: input.userId, runId: input.runId });
}
