'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SERVICE_REGISTRY } from '@/lib/service-registry';

type TierRequirement = 'FREE' | 'PRO' | 'PREMIUM' | 'ENTERPRISE';

type WorkflowStep = {
  stepId: string;
  serviceSlug: string;
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
  tierRequirements?: { minPlan?: TierRequirement };
  retryPolicy: {
    maxRetries: number;
    backoffMs?: number;
  };
  nextStepIds?: string[];
};

type WorkflowRecord = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
  steps: WorkflowStep[];
  created_at: string;
};

type WorkflowRunRecord = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  current_step: string | null;
  logs: Array<{ at: string; level: string; message: string }>;
  result: Record<string, unknown> | null;
};

type WorkflowStepRunRecord = {
  id: string;
  step_id: string;
  service_slug: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  attempt_count: number;
  max_attempts: number;
  error_message: string | null;
  execution_ms?: number | null;
  cost_credits?: number;
  diagnostics?: Record<string, unknown> | null;
};

const AVAILABLE_SERVICES = SERVICE_REGISTRY.filter((service) => service.enabled && service.slug !== 'workflow-builder');

const INITIAL_STEP: WorkflowStep = {
  stepId: 'step_1',
  serviceSlug: AVAILABLE_SERVICES[0]?.slug ?? 'text-intelligence',
  inputMapping: {
    prompt: '$trigger.prompt',
  },
  outputMapping: {
    result: '$output.preview_url',
  },
  retryPolicy: {
    maxRetries: 1,
    backoffMs: 1500,
  },
};

const tierHint = [
  'Free: no workflows',
  'Basic (PRO): up to 2 steps',
  'Premium: up to 5 steps',
  'Full (Enterprise): unlimited + parallel branches',
];

export default function WorkflowBuilderPage() {
  const [name, setName] = useState('My Workflow');
  const [steps, setSteps] = useState<WorkflowStep[]>([{ ...INITIAL_STEP }]);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [runState, setRunState] = useState<WorkflowRunRecord | null>(null);
  const [stepRuns, setStepRuns] = useState<WorkflowStepRunRecord[]>([]);
  const [triggerInput, setTriggerInput] = useState('{\n  "prompt": "Generate campaign assets for spring launch"\n}');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null,
    [workflows, selectedWorkflowId]
  );

  const loadWorkflows = useCallback(async () => {
    const response = await fetch('/api/app/workflows', { cache: 'no-store' });
    if (!response.ok) return;
    const data = (await response.json()) as { workflows?: WorkflowRecord[] };
    setWorkflows(data.workflows ?? []);

    if (!selectedWorkflowId && data.workflows && data.workflows.length > 0) {
      const firstWorkflow = data.workflows[0];
      if (firstWorkflow) {
        setSelectedWorkflowId(firstWorkflow.id);
      }
    }
  }, [selectedWorkflowId]);

  const loadRun = useCallback(async (runId: string) => {
    const response = await fetch(`/api/app/workflow-runs/${runId}?tick=1`, { cache: 'no-store' });
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as {
      run?: WorkflowRunRecord;
      stepRuns?: WorkflowStepRunRecord[];
    };

    if (data.run) {
      setRunState(data.run);
    }
    if (data.stepRuns) {
      setStepRuns(data.stepRuns);
    }
  }, []);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  useEffect(() => {
    if (!selectedRunId) return;
    const interval = window.setInterval(() => {
      void loadRun(selectedRunId);
    }, 2500);

    return () => window.clearInterval(interval);
  }, [loadRun, selectedRunId]);

  const addStep = () => {
    const nextIndex = steps.length + 1;
    const stepId = `step_${nextIndex}`;
    setSteps((prev) => {
      const updated = [
        ...prev,
        {
          stepId,
          serviceSlug: AVAILABLE_SERVICES[0]?.slug ?? 'text-intelligence',
          inputMapping: { prompt: '$trigger.prompt' },
          outputMapping: { result: '$output.preview_url' },
          retryPolicy: { maxRetries: 1, backoffMs: 1500 },
        },
      ];

      return updated.map((step, index) => {
        const nextStep = updated[index + 1];
        return {
          ...step,
          nextStepIds: nextStep?.stepId ? [nextStep.stepId] : [],
        };
      });
    });
  };

  const removeStep = (stepId: string) => {
    setSteps((prev) => {
      const filtered = prev.filter((step) => step.stepId !== stepId);
      return filtered.map((step, index) => {
        const nextStep = filtered[index + 1];
        return {
          ...step,
          nextStepIds: nextStep?.stepId ? [nextStep.stepId] : [],
        };
      });
    });
  };

  const updateStep = (stepId: string, patch: Partial<WorkflowStep>) => {
    setSteps((prev) => prev.map((step) => (step.stepId === stepId ? { ...step, ...patch } : step)));
  };

  const saveWorkflow = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/app/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          status: 'active',
          steps,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.error || 'Failed to save workflow');
      }

      const workflow = data.workflow as WorkflowRecord;
      setSelectedWorkflowId(workflow.id);
      await loadWorkflows();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const runWorkflow = async () => {
    if (!selectedWorkflowId) {
      setError('Select or save a workflow first');
      return;
    }

    setRunning(true);
    setError(null);

    try {
      let parsedTriggerInput: Record<string, unknown> = {};
      if (triggerInput.trim()) {
        parsedTriggerInput = JSON.parse(triggerInput) as Record<string, unknown>;
      }

      const response = await fetch(`/api/app/workflows/${selectedWorkflowId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triggerInput: parsedTriggerInput,
          idempotencyKey: `wf-${selectedWorkflowId}-${Date.now()}`,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.error || 'Failed to start workflow');
      }

      const run = data.run as WorkflowRunRecord;
      setSelectedRunId(run.id);
      setRunState(run);
      await loadRun(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  };

  const retryStep = async (stepId: string) => {
    if (!selectedRunId) return;
    setError(null);

    try {
      const response = await fetch(`/api/app/workflow-runs/${selectedRunId}/steps/${stepId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry-step' }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Retry failed');
      }

      setRunState(data.run as WorkflowRunRecord);
      setStepRuns((data.stepRuns ?? []) as WorkflowStepRunRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    }
  };

  const cancelRun = async () => {
    if (!selectedRunId) return;
    setError(null);

    try {
      const response = await fetch(`/api/app/workflow-runs/${selectedRunId}/steps/manual/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel-run' }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Cancel failed');
      }

      setRunState(data.run as WorkflowRunRecord);
      setStepRuns((data.stepRuns ?? []) as WorkflowStepRunRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
    }
  };

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-24">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Workflow Builder</h1>
        <p className="text-sm text-muted-foreground">Create multi-step, queue-based automation pipelines across Avatar G services.</p>
        <div className="flex flex-wrap gap-2">
          {tierHint.map((hint) => (
            <Badge key={hint} variant="outline">
              {hint}
            </Badge>
          ))}
        </div>
      </header>

      {error ? (
        <Card className="border-red-500/40">
          <CardContent className="pt-6 text-sm text-red-500">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Build Workflow</CardTitle>
            <CardDescription>Step selector-based pipeline editor with mapping and retry policies.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Workflow name" />
              <Button onClick={addStep} variant="secondary">
                Add Step
              </Button>
            </div>

            <div className="space-y-4">
              {steps.map((step, index) => (
                <Card key={step.stepId}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Step {index + 1}: {step.stepId}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        value={step.stepId}
                        onChange={(event) => updateStep(step.stepId, { stepId: event.target.value })}
                        placeholder="step_id"
                      />
                      <select
                        className="h-10 rounded-md border bg-background px-3 text-sm"
                        value={step.serviceSlug}
                        onChange={(event) => updateStep(step.stepId, { serviceSlug: event.target.value })}
                      >
                        {AVAILABLE_SERVICES.map((service) => (
                          <option key={service.slug} value={service.slug}>
                            {service.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <Textarea
                        rows={4}
                        value={JSON.stringify(step.inputMapping, null, 2)}
                        onChange={(event) => {
                          try {
                            updateStep(step.stepId, { inputMapping: JSON.parse(event.target.value) as Record<string, string> });
                          } catch {
                            // keep text-only editing resilient
                          }
                        }}
                      />
                      <Textarea
                        rows={4}
                        value={JSON.stringify(step.outputMapping, null, 2)}
                        onChange={(event) => {
                          try {
                            updateStep(step.stepId, { outputMapping: JSON.parse(event.target.value) as Record<string, string> });
                          } catch {
                            // keep text-only editing resilient
                          }
                        }}
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <Input
                        type="number"
                        min={0}
                        max={5}
                        value={step.retryPolicy.maxRetries}
                        onChange={(event) =>
                          updateStep(step.stepId, {
                            retryPolicy: {
                              ...step.retryPolicy,
                              maxRetries: Number(event.target.value || 0),
                            },
                          })
                        }
                        placeholder="Max retries"
                      />
                      <Input
                        type="number"
                        min={0}
                        value={step.retryPolicy.backoffMs ?? 1500}
                        onChange={(event) =>
                          updateStep(step.stepId, {
                            retryPolicy: {
                              ...step.retryPolicy,
                              backoffMs: Number(event.target.value || 0),
                            },
                          })
                        }
                        placeholder="Backoff ms"
                      />
                      <Button variant="destructive" onClick={() => removeStep(step.stepId)} disabled={steps.length <= 1}>
                        Remove
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={saveWorkflow} disabled={saving}>
                {saving ? 'Saving...' : 'Save Workflow'}
              </Button>
              <Button variant="secondary" onClick={runWorkflow} disabled={running || !selectedWorkflowId}>
                {running ? 'Starting...' : 'Run Workflow'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Saved Workflows</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {workflows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workflows yet.</p>
              ) : (
                workflows.map((workflow) => (
                  <button
                    key={workflow.id}
                    type="button"
                    className={`w-full rounded-md border p-3 text-left text-sm ${
                      selectedWorkflowId === workflow.id ? 'border-primary' : 'border-border'
                    }`}
                    onClick={() => setSelectedWorkflowId(workflow.id)}
                  >
                    <div className="font-medium">{workflow.name}</div>
                    <div className="text-xs text-muted-foreground">{workflow.steps.length} steps • {workflow.status}</div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run Input</CardTitle>
              <CardDescription>JSON payload available as $trigger.*</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea rows={6} value={triggerInput} onChange={(event) => setTriggerInput(event.target.value)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monitor Progress</CardTitle>
              <CardDescription>Polling queue/run state every 2.5 seconds</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {runState ? (
                <>
                  <div className="text-sm">Run: <span className="font-mono">{runState.id}</span></div>
                  <Badge variant={runState.status === 'failed' ? 'danger' : 'outline'}>{runState.status}</Badge>
                  <Button variant="secondary" onClick={cancelRun} disabled={runState.status !== 'running' && runState.status !== 'queued'}>
                    Cancel Run
                  </Button>
                  <div className="space-y-2">
                    {stepRuns.map((stepRun) => (
                      <div key={stepRun.id} className="rounded border p-2 text-xs">
                        <div className="font-medium">{stepRun.step_id} → {stepRun.service_slug}</div>
                        <div>Status: {stepRun.status}</div>
                        <div>Attempts: {stepRun.attempt_count}/{stepRun.max_attempts}</div>
                        <div>Execution: {stepRun.execution_ms ?? 0} ms</div>
                        <div>Cost: {stepRun.cost_credits ?? 0} credits</div>
                        {stepRun.diagnostics ? (
                          <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-[10px]">
                            {JSON.stringify(stepRun.diagnostics, null, 2)}
                          </pre>
                        ) : null}
                        {stepRun.error_message ? <div className="text-red-500">{stepRun.error_message}</div> : null}
                        <Button
                          className="mt-2"
                          variant="secondary"
                          onClick={() => void retryStep(stepRun.step_id)}
                          disabled={stepRun.status !== 'failed'}
                        >
                          Retry Step
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No active run selected yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {selectedWorkflow ? (
        <Card>
          <CardHeader>
            <CardTitle>Selected Workflow JSON</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">
              {JSON.stringify(selectedWorkflow, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
