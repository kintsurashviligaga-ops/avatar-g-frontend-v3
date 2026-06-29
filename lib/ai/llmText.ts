/**
 * lib/ai/llmText.ts
 * =================
 * ONE text-LLM entry point for the film pipeline, trying the providers in quality order:
 *   1. DeepSeek-V3 (Atlas)  — strong creative writer; the preferred brain.
 *   2. Gemini 2.5-flash      — fast, always-live fallback (also powers chat).
 *   3. Anthropic (haiku)     — last resort (currently dead in prod, kept for completeness).
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
import { generateWithGemini } from '@/lib/gemini/client';

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
  const chain = o.geminiFirst ? [viaGemini, viaAtlas, viaAnthropic] : [viaAtlas, viaGemini, viaAnthropic];
  for (const provider of chain) {
    const t = await provider(o);
    if (t) return t;
  }
  return null;
}
