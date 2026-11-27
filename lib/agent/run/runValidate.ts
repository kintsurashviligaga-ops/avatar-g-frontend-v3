/**
 * lib/agent/run/runValidate.ts — VALIDATE for today's media runs (Phase 3.5a, M-4). Pure.
 *
 * A RunSpec is turned into the engine's Plan (planOfSpec: one step per spec step, `dependsOn` = the earlier steps it
 * reads, priced from the adapters' list prices) and checked with lib/agent/engine validatePlan before the run's quote is
 * signed and again before it starts. A refusal names the step and the reason, and nothing is quoted or reserved.
 * The same planOfSpec is what 3.5b's engine bridge runs.
 */
import { buildValidateContext, type ValidateFacts } from '@/lib/agent/engine/context';
import { validatePlan } from '@/lib/agent/engine/validate';
import type { Plan, PlanStep } from '@/lib/agent/engine/types';
import { refsOf, type RunSpec, type RunTool } from './runSpec';

export type RunValidateError = 'capability_unavailable' | 'policy_denied';
export type RunValidateOutcome = { ok: true } | { ok: false; error: RunValidateError; message: string; step?: string };

/** The engine's plan for a run spec. `price` is the list price of a step's tool (the price book, not an estimate). */
export function planOfSpec(spec: RunSpec, price: (tool: RunTool) => number): Plan {
  return {
    title: spec.title ?? 'run',
    steps: spec.steps.map((s): PlanStep => {
      const { id, tool, ...params } = s;
      return { id, tool, title: spec.title ?? tool, dependsOn: [...new Set(refsOf(s))], params: params as Record<string, unknown>, estimateCredits: price(tool) };
    }),
  };
}

/** Check a run spec against the registry and policy facts. The first refused step (or the plan's ceiling) is the answer. */
export function checkRunSpec(spec: RunSpec, facts: ValidateFacts, price: (tool: RunTool) => number): RunValidateOutcome {
  const v = validatePlan(planOfSpec(spec, price), buildValidateContext(facts));
  if (v.ok) return { ok: true };
  const bad = v.steps.find((s) => !s.ok);
  // A refusal with no code is still a refusal (fail closed), never an unmapped error.
  if (bad) return { ok: false, error: bad.code ?? 'policy_denied', message: bad.reason ?? 'This step cannot run.', step: bad.stepId };
  return { ok: false, error: v.plan?.code ?? 'policy_denied', message: v.plan?.reason ?? 'This plan cannot run.' };
}

/** The default per-run ceiling: every step at the dearest list price. A real run never reaches it; a bug does. */
export function defaultRunCeiling(maxSteps: number, prices: readonly number[]): number {
  return maxSteps * Math.max(0, ...prices.filter((p) => Number.isFinite(p)));
}
