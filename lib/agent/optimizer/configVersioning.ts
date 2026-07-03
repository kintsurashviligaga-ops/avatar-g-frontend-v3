/**
 * agent_configs versioning — pure core (STEP 5, apply-with-approval side).
 *
 * Live prompts/params for a target (e.g. 'kling', 'elevenlabs') live in a VERSIONED
 * `agent_configs` table: exactly one row per target has is_active=true. Approving a proposal
 * PROMOTES a NEW version (is_active=true) and deactivates the prior one — which stays for instant
 * rollback. Nothing here mutates anything: it computes the next version + the row to insert, and
 * validates status transitions. The server (./approveProposal) applies it via an atomic RPC.
 *
 * INVARIANT: the optimizer never calls promotion; only an admin action does (log-then-propose).
 */

// 'proposed' is the OPEN state the optimizer writes (matches prompt_optimization_proposals'
// default + its partial unique index); admins move it to a terminal state.
export type ProposalStatus = 'proposed' | 'approved' | 'rejected';

// Single source of truth for the open/reviewable status. Both approve AND reject filter on this
// — a hardcoded literal here once caused reject to silently no-op ('pending' ≠ 'proposed').
export const OPEN_PROPOSAL_STATUS: ProposalStatus = 'proposed';

export interface AgentConfigRow {
  target: string;
  version: number;
  is_active: boolean;
  params: Record<string, unknown>;
  prompt: string | null;
}

/** Next version = max existing + 1, or 1 if none. Pure. */
export function computeNextVersion(existing: Array<{ version: number }>): number {
  let max = 0;
  for (const r of existing) if (typeof r?.version === 'number' && r.version > max) max = r.version;
  return max + 1;
}

/** Build the new active config row to promote for a target. Pure. */
export function buildPromotedConfig(
  target: string,
  existing: Array<{ version: number }>,
  change: { params?: Record<string, unknown> | null; prompt?: string | null },
): AgentConfigRow {
  return {
    target,
    version: computeNextVersion(existing),
    is_active: true,
    params: change.params ?? {},
    prompt: change.prompt ?? null,
  };
}

/** Only open ('proposed') proposals can move; approved/rejected are terminal. Pure. */
export function canTransition(from: ProposalStatus, to: 'approved' | 'rejected'): boolean {
  return from === 'proposed' && (to === 'approved' || to === 'rejected');
}

/** Identify which prior version becomes the rollback target after promoting `newVersion`. Pure. */
export function rollbackTargetVersion(existing: Array<{ version: number; is_active: boolean }>): number | null {
  const active = existing.find((r) => r.is_active);
  return active ? active.version : null;
}

/**
 * True when a proposal carries a CONCRETE change worth promoting — a non-empty params object OR a
 * non-blank prompt. The optimizer's default proposals are DIAGNOSTIC ("users discard 50% — review
 * the prompt"): they flag a problem but attach no concrete change. Approving one must NOT promote,
 * because promote_agent_config('{}', null) would overwrite the live config with an empty params +
 * null prompt and silently degrade the agent on the first admin approval (audit HIGH). Pure.
 */
export function hasConcreteChange(
  params: Record<string, unknown> | null | undefined,
  prompt: string | null | undefined,
): boolean {
  const hasParams = !!params && typeof params === 'object' && Object.keys(params).length > 0;
  const hasPrompt = typeof prompt === 'string' && prompt.trim().length > 0;
  return hasParams || hasPrompt;
}
