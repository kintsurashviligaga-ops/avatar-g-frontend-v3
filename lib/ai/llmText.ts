/**
 * lib/ai/llmText.ts
 * =================
 * ONE text-LLM entry point for the film pipeline, trying the providers in quality order:
 *   1. DeepSeek-V3 (DIRECT api.deepseek.com, DEEPSEEK_API_KEY) — the preferred brain.
 *   2. DeepSeek-V3 (Atlas Cloud, ATLAS_API_KEY)                — same model, independent route (resilience).
 *   3. Gemini 2.5-flash                                        — fast, always-live fallback (also powers chat).
 *   4. Anthropic (haiku)                                       — last resort (env-overridable ANTHROPIC_MODEL).
 * (geminiFirst reorders to Gemini → DeepSeek-direct → Atlas → Anthropic for latency-critical paths.)
 *
 * WHY: the film agents (storyboard decomposition, Master Prompt Agent, narration) used to
 * call Anthropic directly, which is DEAD in prod → the script never became scenes and the
 * board fell back to generic beats. Routing every text-LLM call through here guarantees a
 * LIVE provider does the work. Each provider fail-opens to the next; returns null only if
 * all miss (callers then keep their deterministic fallback).
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { atlasChat, atlasConfigured } from '@/lib/ai/atlasClient';
import { deepseekChat, deepseekConfigured } from '@/lib/ai/deepseekClient';
import { generateWithGemini } from '@/lib/gemini/client';
import { reportReliability } from '@/lib/observability/reliability';

export interface LlmTextOpts {
  user: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Skip DeepSeek and lead with Gemini (e.g. a latency-critical path). Default false. */
  geminiFirst?: boolean;
}

async function viaDeepSeek(o: LlmTextOpts): Promise<string | null> {
  if (!deepseekConfigured()) return null;
  const t = await deepseekChat({ system: o.system, user: o.user, maxTokens: o.maxTokens ?? 2000, temperature: o.temperature ?? 0.6, timeoutMs: o.timeoutMs ?? 40_000, signal: o.signal });
  return t && t.trim() ? t : null;
}

async function viaAtlas(o: LlmTextOpts): Promise<string | null> {
  if (!atlasConfigured()) return null;
  const t = await atlasChat({ system: o.system, user: o.user, maxTokens: o.maxTokens ?? 2000, temperature: o.temperature ?? 0.6, timeoutMs: o.timeoutMs ?? 40_000, signal: o.signal });
  return t && t.trim() ? t : null;
}

async function viaGemini(o: LlmTextOpts): Promise<string | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const r = await generateWithGemini({ prompt: o.user, systemPrompt: o.system, tier: 'flash', maxTokens: o.maxTokens ?? 2000, temperature: o.temperature ?? 0.6, thinkingBudget: 0 });
    return r.text && r.text.trim() ? r.text : null;
  } catch { return null; }
}

async function viaAnthropic(o: LlmTextOpts): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey, maxRetries: 0, timeout: o.timeoutMs ?? 40_000 });
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
      max_tokens: o.maxTokens ?? 2000,
      ...(o.system ? { system: o.system } : {}),
      messages: [{ role: 'user', content: o.user }],
    });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    return text.trim() ? text : null;
  } catch { return null; }
}

/** Run the provider chain in quality order; first non-empty wins. null = all missed. */
export async function llmText(o: LlmTextOpts): Promise<string | null> {
  // DeepSeek-V3 is reachable two ways — the DIRECT api.deepseek.com key (DEEPSEEK_API_KEY) and the
  // Atlas-hosted route (ATLAS_API_KEY). Try DIRECT first, then Atlas as the same-model backup, so one
  // provider's rate-limit/outage fails over to the other instead of dropping to the deterministic plan.
  const chain: Array<[string, (opts: LlmTextOpts) => Promise<string | null>]> = o.geminiFirst
    ? [['gemini', viaGemini], ['deepseek', viaDeepSeek], ['atlas', viaAtlas], ['anthropic', viaAnthropic]]
    : [['deepseek', viaDeepSeek], ['atlas', viaAtlas], ['gemini', viaGemini], ['anthropic', viaAnthropic]];
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    if (!entry) continue;
    const [label, provider] = entry;
    const t = await provider(o);
    if (t) {
      // WS4 reliability: which brain served + how deep the failover went (0 = primary). degraded when a
      // non-primary provider had to cover for an outage/rate-limit on the leads.
      reportReliability({ surface: 'llm.text', providerServed: label, fallbackDepth: i, degraded: i > 0 });
      return t;
    }
  }
  // WS4 reliability: every premium provider missed → the caller drops to deterministic beats.
  reportReliability({ surface: 'llm.text', providerServed: null, fallbackDepth: chain.length, degraded: true });
  // ALL premium providers missed. This is the SOLE trigger for degraded, deterministic
  // camera-beat planning (a WWII script keeps its setting but loses the LLM's rich per-scene
  // action) — and it is almost always an operational env-key gap on the deployment
  // (ATLAS_API_KEY / GEMINI_API_KEY absent or dead), NOT a routing bug: the chain already
  // LEADS with the premium brains. Log loudly with which keys are present so the real cause is
  // visible in prod logs instead of silently falling through to generic beats.
  console.error('[llmText] ALL text-LLM providers missed — scene planning will fall back to deterministic camera beats. Check deployment keys.', {
    deepseek: deepseekConfigured(),
    atlas: atlasConfigured(),
    gemini: !!process.env.GEMINI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  });
  return null;
}
