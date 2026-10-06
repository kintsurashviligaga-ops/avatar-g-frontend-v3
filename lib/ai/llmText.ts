/** Shared Gemini text entry point. MyAvatar v32 never falls back to another AI provider. */
import { googleAiConfigured } from '@/lib/ai/google/transport';
import 'server-only';
import { generateWithGemini } from '@/lib/gemini/client';
import { reportReliability } from '@/lib/observability/reliability';
import { chatBudgetAllows, bookChatUsage } from '@/lib/services/billing/chatBudget';

export interface LlmTextOpts {
  user: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** @deprecated Gemini is always the sole text provider. Retained for caller compatibility. */
  geminiFirst?: boolean;
  /** @deprecated The provider allowlist is mandatory, regardless of this option. */
  googleOnly?: boolean;
  /** Gemini model id for this call (default: the flash tier, GEMINI_MODEL_FLASH). */
  geminiModel?: string;
  /** Ask Gemini for a JSON document (responseMimeType application/json) — no prose, no code fences. */
  json?: boolean;
  /** Gemini leg only: ground the answer in Google Search (news, prices, scores, weather). Ignored with `json`. */
  googleSearch?: boolean;
}

async function viaGemini(o: LlmTextOpts): Promise<string | null> {
  if (!googleAiConfigured()) return null;
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

/** null means unavailable; callers may retain their deterministic, non-provider fallback. */
export async function llmText(o: LlmTextOpts): Promise<string | null> {
  const inputForEstimate = `${o.system ?? ''} ${o.user ?? ''}`;
  if (!(await chatBudgetAllows(inputForEstimate))) return null;

  const text = await viaGemini(o);
  if (text) {
    void bookChatUsage(inputForEstimate, text.length, 'gemini');
    reportReliability({ surface: 'llm.text', providerServed: 'gemini', fallbackDepth: 0, degraded: false });
    return text;
  }
  reportReliability({ surface: 'llm.text', providerServed: null, fallbackDepth: 1, degraded: true });
  return null;
}
