import 'server-only';

/**
 * Agent execution feedback — server insert (STEP 3.5, safe self-improvement, part 1).
 *
 * Passive telemetry: ONE row per asset interaction (download/edit/share/remix/discard) into
 * `agent_execution_feedback`. Later (STEP 5) an offline judge compares low-signal vs
 * high-signal generations to PROPOSE (never auto-apply) prompt/param tweaks. Inserts fail-soft
 * — telemetry must never break the user action. Pure validation lives in ./feedback-schema.
 *
 * The table (RLS: users insert their own rows only) is created by
 * supabase/migrations/20260702_agent_execution_feedback.sql — apply it before this writes.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';
import { toFeedbackRow, type AgentFeedback } from './feedback-schema';

export { AGENT_TYPES, FEEDBACK_ACTIONS, agentFeedbackSchema, toFeedbackRow } from './feedback-schema';
export type { AgentFeedback } from './feedback-schema';

/**
 * Insert exactly ONE feedback row. Fail-soft: returns false (never throws) on a validation
 * miss, missing table, or storage error — an interaction is never blocked by telemetry.
 */
export async function recordAgentFeedback(input: AgentFeedback): Promise<boolean> {
  const parsed = toFeedbackRow(input);
  if (!parsed.ok) return false;
  try {
    const sb = createServiceRoleClient();
    const { error } = await sb.from('agent_execution_feedback').insert(parsed.row);
    return !error;
  } catch {
    return false;
  }
}
