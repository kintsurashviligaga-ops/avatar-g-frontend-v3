import 'server-only';

/**
 * Approve/reject a prompt_optimization_proposal (STEP 5 admin gate).
 *
 * approveProposal PROMOTES the proposal's concrete change into a NEW active agent_configs version
 * (deactivating the prior, which stays for rollback) and marks the proposal approved. It CLAIMS
 * the proposal atomically first (update … WHERE status='pending') so two concurrent approvals
 * can't double-promote; on promotion failure it reverts the claim. Nothing is promoted without
 * this explicit admin call — the optimizer only ever writes 'pending' proposals.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';

export interface ApproveResult {
  ok: boolean;
  target?: string;
  version?: number;
  error?: string;
}

const PROPOSALS = 'prompt_optimization_proposals';

/** Claim (pending→approved) → promote via RPC → on failure revert. Fail-soft; never throws. */
export async function approveProposal(proposalId: string, reviewerId: string, opts?: { target?: string }): Promise<ApproveResult> {
  try {
    const sb = createServiceRoleClient();
    const now = new Date().toISOString();

    // Atomic claim: only the first approver of an OPEN ('proposed') proposal gets rows back.
    const { data: claimed, error: claimErr } = await sb
      .from(PROPOSALS)
      .update({ status: 'approved', reviewed_by: reviewerId, reviewed_at: now })
      .eq('id', proposalId)
      .eq('status', 'proposed')
      .select('id, agent_type, model, proposed_params, proposed_prompt');
    if (claimErr) return { ok: false, error: claimErr.message };
    if (!claimed || claimed.length === 0) return { ok: false, error: 'proposal not open (not found or already reviewed)' };

    const p = claimed[0] as { agent_type?: string; model?: string; proposed_params?: Record<string, unknown> | null; proposed_prompt?: string | null };
    const target = (opts?.target || p.model || p.agent_type || '').trim();
    const revert = async () => { await sb.from(PROPOSALS).update({ status: 'proposed', reviewed_by: null, reviewed_at: null }).eq('id', proposalId); };
    if (!target) { await revert(); return { ok: false, error: 'no target to promote (proposal lacks model/agent_type)' }; }

    // Atomic promotion (deactivate prior + insert next active version) in one transaction.
    const { data: version, error: promoteErr } = await sb.rpc('promote_agent_config', {
      p_target: target,
      p_params: p.proposed_params ?? {},
      p_prompt: p.proposed_prompt ?? null,
    });
    if (promoteErr) { await revert(); return { ok: false, error: promoteErr.message }; }

    return { ok: true, target, version: typeof version === 'number' ? version : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Mark a pending proposal rejected (no config change). Fail-soft. */
export async function rejectProposal(proposalId: string, reviewerId: string): Promise<ApproveResult> {
  try {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from(PROPOSALS)
      .update({ status: 'rejected', reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
      .eq('id', proposalId)
      .eq('status', 'pending')
      .select('id');
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) return { ok: false, error: 'proposal not pending' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
