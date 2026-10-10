/**
 * lib/agent/media/analyzeLive.ts — the real effects behind ./analyzeExec: the caller's file through
 * lib/security/callerMedia, ffprobe for its length, one Gemini call on the selected transport, the platform's budget
 * gate and booking, the shared Agent G audit row.
 */
import 'server-only';
import { resolveCallerMedia } from '@/lib/security/callerMedia';
import { probeMedia } from '@/lib/services/montage/beatAnalysis';
import { googleModelFetch, googleTransportKind } from '@/lib/ai/google/transport';
import { catalogEntry } from '@/lib/models/catalog';
import { bookChatUsage } from '@/lib/services/billing/chatBudget';
import type { AnalyzeDeps } from './analyzeExec';
import { audit } from './montageLive';

/** The link Gemini reads lives long enough for one analysis (the call's timeout is under two minutes). */
const SOURCE_TTL_SEC = 900;
/** The catalog's runtime-verified Flash (lib/models/catalog: verifiedAt on both transports). */
export const DEFAULT_ANALYZE_MODEL = 'gemini-3.8-flash';
/** The output a pre-check assumes (the answer's JSON; the booking afterwards uses the real count). */
const OUTPUT_ESTIMATE_TOKENS = 8_000;

/**
 * The model id to call: AGENT_G_ANALYZE_MODEL or the default, and only when the catalog has it enabled, verified at
 * runtime, and served by the transport GEMINI_TRANSPORT selects. Anything else is „not configured", never a substitute.
 */
export function analyzeModel(env: NodeJS.ProcessEnv = process.env): string | null {
  const id = (env.AGENT_G_ANALYZE_MODEL ?? '').trim() || DEFAULT_ANALYZE_MODEL;
  const entry = catalogEntry(id);
  if (!entry || !entry.enabled || !entry.verifiedAt) return null;
  let kind: string;
  try {
    kind = googleTransportKind(env);
  } catch {
    return null;
  }
  return entry.transport === 'either' || entry.transport === kind ? id : null;
}

export function liveAnalyzeDeps(): AnalyzeDeps {
  return {
    async resolveFile(ref, userId) {
      const r = await resolveCallerMedia(ref, userId, SOURCE_TTL_SEC);
      if (r.ok) return r.own ? { ok: true, url: r.url } : { ok: false, reason: 'not_yours' };
      return { ok: false, reason: r.reason === 'not_owner' ? 'not_yours' : 'unreadable' };
    },
    probe: (url) => probeMedia(url),
    model: () => analyzeModel(),
    generate: (model, body, signal) => googleModelFetch(model, 'generateContent', { method: 'POST', body: JSON.stringify(body), signal }),
    async budgetAllows(inputTokens, model) {
      // FAILS OPEN like the chat's gate (lib/services/billing/chatBudget): a guard fault must not take the feature down.
      try {
        const { canProceed } = await import('@/lib/services/billing/BillingGuard');
        const { estimateCost } = await import('@/lib/services/billing/costModel');
        const decision = await canProceed(estimateCost({ service: 'chat', model, inputTokens, outputTokens: OUTPUT_ESTIMATE_TOKENS }));
        return decision.allowed;
      } catch {
        return true;
      }
    },
    book: (u) => bookChatUsage({ model: u.model, userId: u.userId, ...(u.inputTokens !== undefined ? { inputTokens: u.inputTokens } : {}), ...(u.outputTokens !== undefined ? { outputTokens: u.outputTokens } : {}) }),
    audit,
  };
}
