/**
 * Agent feedback — pure schema + row mapping (STEP 3.5). NO server/supabase imports, so it is
 * unit-testable and safe to import from client code (e.g. to type the POST body). The server
 * insert lives in ./feedback (server-only) and reuses this.
 */
import { z } from 'zod';

export const AGENT_TYPES = ['video', 'audio', 'script', 'image'] as const;
export const FEEDBACK_ACTIONS = ['download', 'edit', 'share', 'remix', 'discard'] as const;

export const agentFeedbackSchema = z.object({
  userId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
  agentType: z.enum(AGENT_TYPES),
  action: z.enum(FEEDBACK_ACTIONS),
  model: z.string().max(120).optional(),
  paramsSnapshot: z.record(z.unknown()).optional(),
  promptSnapshot: z.string().max(4000).optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  success: z.boolean().optional(),
});
export type AgentFeedback = z.infer<typeof agentFeedbackSchema>;

/** Parse+normalize a raw payload → row columns, or a flat error. Pure (route- + test-friendly). */
export function toFeedbackRow(raw: unknown): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const p = agentFeedbackSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  const d = p.data;
  return {
    ok: true,
    row: {
      user_id: d.userId,
      asset_id: d.assetId ?? null,
      agent_type: d.agentType,
      action: d.action,
      model: d.model ?? null,
      params_snapshot: d.paramsSnapshot ?? {},
      prompt_snapshot: d.promptSnapshot ?? null,
      latency_ms: d.latencyMs ?? null,
      cost_usd: d.costUsd ?? null,
      success: d.success ?? null,
    },
  };
}
