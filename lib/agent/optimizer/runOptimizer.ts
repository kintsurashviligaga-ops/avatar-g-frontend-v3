import 'server-only';

/**
 * Agent optimizer runner (STEP 5, part 3). Reads recent agent_execution_feedback, computes
 * signals, and writes review PROPOSALS — it applies NOTHING. Fail-soft throughout: a missing
 * table or storage error yields a clean result, never a throw. Meant to be called from a daily
 * cron (app/api/cron/optimize-agents) or an admin trigger.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';
import { aggregateSignals, proposeOptimizations, type FeedbackRow } from './analyze';

export interface OptimizerRunResult {
  ok: boolean;
  feedbackRows: number;
  signals: number;
  proposals: number;
  written: number; // new proposals inserted (duplicates of still-open ones are skipped by the DB)
  error?: string;
}

export async function runAgentOptimizer(opts?: { sinceDays?: number; minSamples?: number }): Promise<OptimizerRunResult> {
  const sinceDays = opts?.sinceDays ?? 30;
  const empty: OptimizerRunResult = { ok: false, feedbackRows: 0, signals: 0, proposals: 0, written: 0 };
  try {
    const sb = createServiceRoleClient();
    const sinceIso = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
    const { data, error } = await sb
      .from('agent_execution_feedback')
      .select('agent_type, action, model, success')
      .gte('created_at', sinceIso)
      .limit(5000);
    if (error) return { ...empty, error: error.message };

    const rows = (data ?? []) as FeedbackRow[];
    const signals = aggregateSignals(rows);
    const proposals = proposeOptimizations(signals, opts?.minSamples ? { minSamples: opts.minSamples } : undefined);

    // Insert each proposal. The partial unique index (one open proposal per agent/model/kind)
    // rejects duplicates → we just count the ones that land. Never applies a change.
    let written = 0;
    for (const p of proposals) {
      const { error: insErr } = await sb.from('prompt_optimization_proposals').insert({
        agent_type: p.agentType,
        model: p.model,
        kind: p.kind,
        priority: p.priority,
        rationale: p.rationale,
        evidence: p.evidence,
        status: 'proposed',
        // CONCRETE change to promote on approval (STEP 5 self-improving). Diagnostic-only
        // proposals carry nulls → approving is acknowledged but never promotes an empty config.
        proposed_params: p.proposedParams,
        proposed_prompt: p.proposedPrompt,
      });
      if (!insErr) written++;
    }
    return { ok: true, feedbackRows: rows.length, signals: signals.length, proposals: proposals.length, written };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  }
}
