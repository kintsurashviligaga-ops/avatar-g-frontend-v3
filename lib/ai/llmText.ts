/**
 * lib/ai/llmText.ts
 * =================
 * ONE text-LLM entry point for the film pipeline and the other internal text callers: Gemini (flash tier by default,
 * `geminiModel` to pick another) and NOTHING behind it.
 *
 * ⚠️ GEMINI ONLY — NO FALLBACK PROVIDER (PROJECT_MASTER R7, "NO SILENT FALLBACK", and the provider policy: Google + ElevenLabs).
 * This used to be a chain — DeepSeek-V3 direct → DeepSeek-V3 via Atlas → Gemini → Anthropic (haiku), reordered to Gemini
 * first by `geminiFirst` — so a Gemini miss was silently answered by a forbidden vendor. One request, one provider now:
 * when Gemini misses (no key, an error, an empty reply) this returns null, the SAME "no result" every caller already
 * handles with its deterministic fallback (storyboard beats, the skeleton deck outline, the untranslated source line …).
 *
 * WHY THIS HELPER EXISTS: the film agents (storyboard decomposition, Master Prompt Agent, narration) used to call
 * Anthropic directly, which was DEAD in prod → the script never became scenes. Routing every text-LLM call through here
 * keeps one place for the provider, the budget gate and the reliability signal.
 */
import 'server-only';
import { generateWithGemini } from '@/lib/gemini/client';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { reportReliability } from '@/lib/observability/reliability';
import { chatBudgetAllows, bookChatUsage } from '@/lib/services/billing/chatBudget';

export interface LlmTextOpts {
  user: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * No effect any more — Gemini is the only provider for every call (R7). Kept so existing callers compile; it used to
   * move Gemini ahead of DeepSeek in the old chain.
   */
  geminiFirst?: boolean;
  /**
   * No effect any more — every call is Gemini only (R7), whatever this says, including `false` (the AI_GOOGLE_ONLY=0
   * kill switch no longer brings back a DeepSeek / Atlas / Anthropic leg here). Kept so existing callers compile.
   */
  googleOnly?: boolean;
  /** Gemini model id for this call (default: the flash tier, GEMINI_MODEL_FLASH). */
  geminiModel?: string;
  /** Ask Gemini for a JSON document (responseMimeType application/json) — no prose, no code fences. */
  json?: boolean;
  /** Gemini leg only: ground the answer in Google Search (news, prices, scores, weather). Ignored with `json`. */
  googleSearch?: boolean;
}

async function viaGemini(o: LlmTextOpts): Promise<string | null> {
  // resolveGeminiKey() also honours GOOGLE_GENERATIVE_AI_API_KEY and the GEMINI_API_KEYS pool — the bare
  // GEMINI_API_KEY check here used to skip Gemini on a deployment that only set the pool.
  if (!resolveGeminiKey()) return null;
  try {
    const r = await generateWithGemini({
      prompt: o.user, systemPrompt: o.system, tier: 'flash', maxTokens: o.maxTokens ?? 2000, temperature: o.temperature ?? 0.6,
      thinkingBudget: 0,
      ...(o.geminiModel ? { model: o.geminiModel } : {}),
      ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}),
      ...(o.json ? { responseMimeType: 'application/json' as const } : {}),
      ...(o.googleSearch && !o.json ? { googleSearch: true } : {}),
    });
    return r.text && r.text.trim() ? r.text : null;
  } catch { return null; }
}

/** Gemini, and only Gemini. null = Gemini missed (or the budget guard refused) — never another provider's text. */
export async function llmText(o: LlmTextOpts): Promise<string | null> {
  // BUDGET GATE (Master Task §2.1.1). This helper is the shared brain behind 14 internal call sites
  // (storyboard, prompt agent, scene writer, …), so guarding it here covers all of them at once instead
  // of each remembering. Refusal returns null — the SAME shape a Gemini miss returns — so every caller's
  // existing deterministic fallback handles it with no new error path.
  const inputForEstimate = `${o.system ?? ''} ${o.user ?? ''}`;
  if (!(await chatBudgetAllows(inputForEstimate))) {
    // eslint-disable-next-line no-console
    console.warn('[llmText] refused by the platform budget guard → caller falls back');
    return null;
  }

  const t = await viaGemini(o);
  if (t) {
    void bookChatUsage(inputForEstimate, t.length, 'gemini');
    reportReliability({ surface: 'llm.text', providerServed: 'gemini', fallbackDepth: 0, degraded: false });
    return t;
  }
  // WS4 reliability: Gemini missed → the caller drops to its deterministic fallback.
  reportReliability({ surface: 'llm.text', providerServed: null, fallbackDepth: 1, degraded: true });
  // ⚠️ NO SECOND PROVIDER IS TRIED (R7) — this null IS the explicit failure. It is almost always an operational gap
  // (the Gemini key absent or dead, or a Gemini outage), so log loudly with the key's presence instead of letting the
  // caller's generic fallback (deterministic camera beats, the skeleton deck, untranslated lines) hide the cause.
  console.error('[llmText] Gemini missed — no fallback provider (PROJECT_MASTER R7); the caller keeps its deterministic fallback. Check the Gemini key.', {
    gemini: !!resolveGeminiKey(),
  });
  return null;
}
