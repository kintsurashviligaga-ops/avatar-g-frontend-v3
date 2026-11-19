/**
 * VALIDATE (v5.1 M-4; 06 §1): every step of a plan is checked against the capability registry and the policy BEFORE any
 * quote or reserve, so a step on a retired model, a closed tool or a blocked site is refused with nothing spent.
 *
 *   capability_unavailable  the tool's model is retired, inside the CI block window, or unknown to the lifecycle
 *                           registry (config/google-lifecycle.json via lib/capabilities/lifecycle), or the service switch
 *                           is off
 *   policy_denied           the user is not entitled (plan / admin-only tool, D-08), not in the tool's audience, a
 *                           research step names a domain outside the allow-list, or the plan's estimate is over the
 *                           user's run ceiling
 *
 * Pure: the registry lookups and the user's facts come in as functions and values; the caller builds them from
 * lib/capabilities/lifecycle, lib/server/serviceSwitches and the user's profile.
 */
import type { LifecycleLevel } from '@/lib/capabilities/lifecycle';
import type { EngineTool, Plan, PlanStep } from './types';

export type ValidateCode = 'capability_unavailable' | 'policy_denied';

export interface StepVerdict {
  stepId: string;
  ok: boolean;
  code?: ValidateCode;
  reason?: string;
}

export interface ValidateContext {
  /** The model a tool runs on by default (null for a tool with no Google model, e.g. export or pdf). */
  modelOf: (tool: EngineTool) => string | null;
  /**
   * The model's row in the lifecycle registry today: `known` false when config/google-lifecycle.json has no entry for it
   * (lib/capabilities/lifecycle lifecycleEntry → null), else its lifecycleLevel.
   */
  lifecycleOf: (model: string) => { known: boolean; level: LifecycleLevel };
  /** The admin service switch (lib/server/serviceSwitches): false = switched off. */
  serviceOn: (tool: EngineTool) => boolean;
  /** Plan / role entitlement: may this user use the tool at all (e.g. code and research are admin-only, D-08). */
  entitled: (tool: EngineTool) => boolean;
  /** Audience gate (everyone / admins / owner) for tools still rolling out. */
  inAudience: (tool: EngineTool) => boolean;
  /** Domains a research step may open; a step with no `urls` param passes. */
  domainAllowed: (host: string) => boolean;
  /** The most one run may be estimated at for this user, in credits. */
  runCeilingCredits: number;
  /**
   * The price book's price for a step (lib/agent/run pricing), or null when the book has no row for it. When given,
   * the ceiling is checked against it, not the planner's own estimateCredits: a model's guess at a price is not a price.
   */
  priceOf?: (step: PlanStep) => number | null;
}

/** Levels that stop a step: the same three that turn CI red (lib/capabilities/lifecycle lifecycleBlockers). */
const BLOCKING: ReadonlySet<LifecycleLevel> = new Set(['retired', 'urgent', 'block']);

/** Every string anywhere in a value (params can nest), so a link cannot hide under a key VALIDATE does not know. */
function stringsIn(v: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out;
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) stringsIn(x, out, depth + 1);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) stringsIn(x, out, depth + 1);
  return out;
}

const SCHEME = /^\s*[a-z][a-z0-9+.-]*:\/\//i;

/**
 * The hosts a research step would open: every link in its params (not only `urls`, since a planner may write `url` or
 * nest it), each one https. 'invalid' when any link is not a well-formed https URL.
 */
function hostsOf(step: PlanStep): string[] | 'invalid' {
  const urls = step.params.urls;
  if (urls !== undefined && (!Array.isArray(urls) || urls.some((u) => typeof u !== 'string' || !SCHEME.test(u)))) return 'invalid';
  const hosts: string[] = [];
  for (const u of stringsIn(step.params).filter((x) => SCHEME.test(x))) {
    try {
      const url = new URL(u.trim());
      if (url.protocol !== 'https:' || url.username || url.password) return 'invalid';
      hosts.push(url.hostname.toLowerCase().replace(/\.$/, ''));
    } catch {
      return 'invalid';
    }
  }
  return hosts;
}

export function validateStep(step: PlanStep, ctx: ValidateContext): StepVerdict {
  const deny = (code: ValidateCode, reason: string): StepVerdict => ({ stepId: step.id, ok: false, code, reason });
  if (!ctx.serviceOn(step.tool)) return deny('capability_unavailable', `${step.tool} is switched off`);
  const model = ctx.modelOf(step.tool);
  if (model) {
    const { known, level } = ctx.lifecycleOf(model);
    // A model the registry does not know is never assumed safe (04 §5): it is added to the file, with its source, first.
    // A known model with no published date ('unknown' / 'none') runs: its entry records that nobody has published one.
    if (!known) return deny('capability_unavailable', `${model} is not in the lifecycle registry`);
    if (BLOCKING.has(level)) return deny('capability_unavailable', `${model} is ${level} (lifecycle registry)`);
  }
  if (!ctx.entitled(step.tool)) return deny('policy_denied', `${step.tool} is not open to this account`);
  if (!ctx.inAudience(step.tool)) return deny('policy_denied', `${step.tool} is not open to this account yet`);
  if (step.tool === 'research') {
    const hosts = hostsOf(step);
    if (hosts === 'invalid') return deny('policy_denied', 'research links must be plain https links');
    const blocked = hosts.find((h) => !ctx.domainAllowed(h));
    if (blocked) return deny('policy_denied', `${blocked} is not on the allow-list`);
  }
  return { stepId: step.id, ok: true };
}

/**
 * The whole plan: one verdict per step, plus a plan-level verdict for the run ceiling. `ok` only when every step passes.
 * A refused plan is explained to the user (which step, why) and nothing is quoted.
 */
export function validatePlan(plan: Plan, ctx: ValidateContext): { ok: boolean; steps: StepVerdict[]; plan?: { code: ValidateCode; reason: string } } {
  const steps = plan.steps.map((s) => validateStep(s, ctx));
  const priced = plan.steps.map((s) => ({ s, p: ctx.priceOf ? ctx.priceOf(s) : s.estimateCredits }));
  const unpriced = priced.find((x) => x.p === null || !Number.isFinite(x.p) || (x.p as number) < 0);
  if (unpriced) {
    return { ok: false, steps, plan: { code: 'policy_denied', reason: `step "${unpriced.s.id}" has no price in the price book` } };
  }
  const estimate = priced.reduce((a, x) => a + (x.p as number), 0);
  const over = estimate > ctx.runCeilingCredits ? { code: 'policy_denied' as const, reason: `estimate ✦${estimate} is over this account's ✦${ctx.runCeilingCredits} per run` } : undefined;
  return { ok: steps.every((v) => v.ok) && !over, steps, ...(over ? { plan: over } : {}) };
}
