/**
 * lib/agent/media/cutawayLive.ts — the real effects behind ./cutawaySpot for the montage route: one Gemini call on the
 * selected Google transport, the platform's budget gate and booking.
 *
 * Deliberately NOT ./analyzeLive: that one checks the model against lib/models/catalog, which also names non-Vertex
 * vendors, and importing it would let the montage routes reach them (__tests__/provider-boundary). The model here is
 * the analysis Flash that the catalog verified on both transports (./analyzeLive DEFAULT_ANALYZE_MODEL), or
 * AGENT_G_ANALYZE_MODEL when an operator sets it; no transport configured = no model = no cutaways, never a substitute.
 */
import 'server-only';
import { googleModelFetch, googleTransportKind } from '@/lib/ai/google/transport';
import { bookChatUsage } from '@/lib/services/billing/chatBudget';
import type { AnalyzeDeps } from './analyzeExec';

const CUTAWAY_MODEL = 'gemini-3.8-flash';
/** The output a pre-check assumes (the lines' JSON; the booking afterwards uses the real count). */
const OUTPUT_ESTIMATE_TOKENS = 8_000;

export function cutawayModel(env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    googleTransportKind(env);
  } catch {
    return null;
  }
  return (env.AGENT_G_ANALYZE_MODEL ?? '').trim() || CUTAWAY_MODEL;
}

export function liveCutawayDeps(): Pick<AnalyzeDeps, 'model' | 'generate' | 'budgetAllows' | 'book'> {
  return {
    model: () => cutawayModel(),
    generate: (model, body, signal) => googleModelFetch(model, 'generateContent', { method: 'POST', body: JSON.stringify(body), signal }),
    async budgetAllows(inputTokens, model) {
      // Fails closed like the chat's gate: a guard fault refuses.
      try {
        const { canProceed } = await import('@/lib/services/billing/BillingGuard');
        const { estimateCost } = await import('@/lib/services/billing/costModel');
        const decision = await canProceed(estimateCost({ service: 'chat', model, inputTokens, outputTokens: OUTPUT_ESTIMATE_TOKENS }));
        return decision.allowed;
      } catch {
        return false;
      }
    },
    book: (u) => bookChatUsage({ model: u.model, userId: u.userId, ...(u.inputTokens !== undefined ? { inputTokens: u.inputTokens } : {}), ...(u.outputTokens !== undefined ? { outputTokens: u.outputTokens } : {}) }),
  };
}
