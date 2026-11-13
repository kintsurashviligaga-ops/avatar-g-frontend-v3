/**
 * The engine's front door: UNDERSTAND has picked the tools, this does PLAN → VALIDATE and hands back either a plan the
 * user can be quoted for, or the honest reason there is none. QUOTE, APPROVE and RESERVE stay where they are today
 * (lib/agent/run, the ledger); EXECUTE is ./scheduler `tick`. Pure apart from the injected planner model.
 */
import { decompose, planShape, type DecomposeInput, type PlannerModel } from './plan';
import { validatePlan, type StepVerdict, type ValidateCode, type ValidateContext } from './validate';
import type { Plan } from './types';

export * from './types';
export { decompose, parsePlan, topoLevels, topoOrder } from './plan';
export { validatePlan, validateStep } from './validate';
export { checkpointsOf, createRun, replan, runSummary, tick } from './scheduler';

export type PreparedRun =
  | { ok: true; plan: Plan; levels: string[][]; estimateCredits: number; widest: number; source: 'model' | 'repair' | 'fallback' }
  | { ok: false; stage: 'plan'; error: string }
  | { ok: false; stage: 'validate'; refused: Array<{ stepId?: string; code: ValidateCode; reason: string }>; plan: Plan };

export async function prepareRun(input: DecomposeInput, model: PlannerModel, ctx: ValidateContext): Promise<PreparedRun> {
  const planned = await decompose(input, model);
  if (!planned.ok) return { ok: false, stage: 'plan', error: planned.error };
  const v = validatePlan(planned.plan, ctx);
  if (!v.ok) {
    const refused = [
      ...v.steps.filter((s): s is StepVerdict & { code: ValidateCode; reason: string } => !s.ok).map((s) => ({ stepId: s.stepId, code: s.code, reason: s.reason })),
      ...(v.plan ? [v.plan] : []),
    ];
    return { ok: false, stage: 'validate', refused, plan: planned.plan };
  }
  const shape = planShape(planned.plan, planned.levels);
  return { ok: true, plan: planned.plan, levels: planned.levels, estimateCredits: shape.estimateCredits, widest: shape.widest, source: planned.source };
}
