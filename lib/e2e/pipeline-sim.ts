/**
 * Automated Input → Output (E2E) pipeline simulator.
 *
 * Deterministically replays a user operation cycle through the REAL production
 * primitives — the GEL cost matrix + pre-flight `canAfford` guard, the founder
 * admin gate, and the external-engine routing contract — so CI can assert system
 * integrity and emit real status indicators without spending money or hitting the
 * network. This is the same decision logic the live composer / guardCost path
 * uses; here it is isolated and traced.
 */

import {
  costOf, canAfford, insufficientBalanceMessage, formatGEL, type MeteredAction,
} from '@/lib/billing/gel';

/** Live founder verification amount — mirrors /api/billing/founder-verify. */
export const FOUNDER_VERIFICATION_GEL = 275;

/**
 * Founder / admin allow-list — mirrors lib/auth/adminGuard.ts DEFAULT_ADMIN_EMAILS,
 * kept dependency-free here so the simulator stays pure (no server/env import chain).
 */
const FOUNDER_EMAILS = ['kintsurashviligaga@gmail.com'];
export function isFounderEmail(email: string): boolean {
  const fromEnv = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const allow = new Set([...FOUNDER_EMAILS.map((e) => e.toLowerCase()), ...fromEnv]);
  return allow.has(email.trim().toLowerCase());
}

export type EngineId = 'hardware_gpu_render' | 'synthesis_voice_ka' | 'agent_n_3d';

/** Which external agent grid each metered action routes to. */
const ENGINE_FOR: Record<MeteredAction, EngineId | null> = {
  chat: null,                    // local LLM — no external grid
  voice_tts: 'synthesis_voice_ka',
  geometry_3d: 'agent_n_3d',     // Agent N — 3D spatial estimator
  video_film: 'hardware_gpu_render',
  avatar: 'hardware_gpu_render',
};

export interface SimInput {
  prompt: string;
  action: MeteredAction;
  balanceGel: number;
  userEmail: string;
  locale?: string;
}

export interface SimStep { phase: string; ok: boolean; detail: string }

export type SimDecision = 'halt_insufficient_balance' | 'proceed' | 'founder_gate';

export interface RoutingPlan { engine: EngineId; params: Record<string, unknown> }

export interface SimResult {
  steps: SimStep[];
  halted: boolean;
  decision: SimDecision;
  costGel: number;
  isFounder: boolean;
  paymentPrompt?: string;
  founderGateGel?: number;
  routing: RoutingPlan | null;
}

/** Build the parameter envelope destined for the target external engine. */
export function buildRouting(action: MeteredAction, prompt: string): RoutingPlan | null {
  const engine = ENGINE_FOR[action];
  if (!engine) return null;
  if (engine === 'hardware_gpu_render') return { engine, params: { prompt, totalDurationSec: 30 } };
  if (engine === 'synthesis_voice_ka') return { engine, params: { text: prompt.slice(0, 800), locale: 'ka' } };
  return { engine, params: { prompt, mode: '3d_spatial_estimate' } }; // agent_n_3d
}

export function simulatePipeline(input: SimInput): SimResult {
  const locale = input.locale ?? 'ka';
  const steps: SimStep[] = [];
  const cost = costOf(input.action);
  const isFounder = isFounderEmail(input.userEmail);

  // 1) INPUT
  steps.push({ phase: 'INPUT', ok: true, detail: `prompt="${input.prompt.slice(0, 60)}" action=${input.action} cost=${formatGEL(cost)}` });

  // 2) SECURITY & FINANCIAL INTERCEPTION (guardCost)
  const affordable = canAfford(input.balanceGel, input.action);
  steps.push({
    phase: 'GUARD_COST',
    ok: true,
    detail: `balance=${formatGEL(input.balanceGel)} required=${formatGEL(cost)} affordable=${affordable} founder=${isFounder}`,
  });

  // Founder account: the live 275 ₾ verification gate is exposed (and proceeds).
  if (isFounder) {
    steps.push({ phase: 'FOUNDER_GATE', ok: true, detail: `founder account → ${formatGEL(FOUNDER_VERIFICATION_GEL)} live verification gate exposed` });
    const routing = buildRouting(input.action, input.prompt);
    steps.push({ phase: 'ROUTE', ok: true, detail: routing ? `→ ${routing.engine} ${JSON.stringify(routing.params)}` : 'no external engine (local chat)' });
    return { steps, halted: false, decision: 'founder_gate', costGel: cost, isFounder, founderGateGel: FOUNDER_VERIFICATION_GEL, routing };
  }

  // Authenticated 0.00 ₾ user: cleanly halted with a payment prompt.
  if (!affordable) {
    const paymentPrompt = insufficientBalanceMessage(cost, locale);
    steps.push({ phase: 'HALT', ok: true, detail: `payment prompt → ${paymentPrompt}` });
    return { steps, halted: true, decision: 'halt_insufficient_balance', costGel: cost, isFounder, paymentPrompt, routing: null };
  }

  // 3) OUTPUT ROUTING
  const routing = buildRouting(input.action, input.prompt);
  steps.push({ phase: 'ROUTE', ok: true, detail: routing ? `→ ${routing.engine} ${JSON.stringify(routing.params)}` : 'no external engine (local chat)' });
  steps.push({ phase: 'OUTPUT', ok: true, detail: 'pipeline parameters structured for the external agent grid' });
  return { steps, halted: false, decision: 'proceed', costGel: cost, isFounder, routing };
}

/** Pretty multi-line trace for logs / the operational report. */
export function renderTrace(result: SimResult): string {
  return result.steps.map((s, i) => `  ${i + 1}. [${s.phase}] ${s.detail}`).join('\n');
}
