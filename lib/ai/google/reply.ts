/**
 * lib/ai/google/reply.ts — ONE non-streamed answer from the product Gemini chain, booked with real usage.
 *
 * Lifted out of /api/chat so the channel doors (WhatsApp, Telegram — lib/ai/channelBridge.ts) answer from the same
 * chain, the same Agent G prompt and the same usage booking as the website. Before this, channels went through the
 * OpenAI-backed chatEngine, which production never calls while AI_GOOGLE_ONLY is on (the default): a channel reply
 * could only ever have been the fallback apology.
 */
import 'server-only';
import { AGENT_G_SYSTEM_PROMPT } from '@/lib/agent-g-orchestrator';
import { bookChatUsage } from '@/lib/services/billing/chatBudget';
import { chatModelChain } from '@/lib/ai/google/models';
import { streamGeminiChat, unbookedAttempts } from '@/lib/ai/google/chatStream';
import { resolveAgentProfile, toGeminiChatConfig } from '@/lib/agents/profile';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';

const hasTokens = (u?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }): boolean =>
  !!u && ((u.inputTokens ?? 0) > 0 || (u.outputTokens ?? 0) > 0 || (u.totalTokens ?? 0) > 0);

/**
 * Never throws; null when no model answered. `systemNote` is appended to the Agent G prompt (a channel's own style
 * rules); `userId` must be a real account id or null — it keys the usage booking.
 */
export async function geminiReply(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  userId: string | null,
  signal?: AbortSignal,
  systemNote?: string,
): Promise<{ text: string; model: string } | null> {
  const system = systemNote ? `${AGENT_G_SYSTEM_PROMPT}\n\n${systemNote}` : AGENT_G_SYSTEM_PROMPT;
  const result = await streamGeminiChat({
    apiKey: resolveGeminiKey(),
    models: chatModelChain('standard'),
    messages,
    config: toGeminiChatConfig(resolveAgentProfile({}), system),
    abortSignal: signal,
    onFrame: () => { /* collected into result.text */ },
  });
  const inputChars = system.length + messages.reduce((n, m) => n + m.content.length, 0);
  if (result.model && (hasTokens(result.usage) || result.text.length > 0)) {
    void bookChatUsage({
      model: result.model,
      ...result.usage,
      chars: result.text.length,
      inputChars,
      userId,
      groundingQueries: result.groundingQueries ?? 0,
    });
  }
  for (const a of unbookedAttempts(result)) {
    void bookChatUsage({ model: a.model, ...a.usage, inputChars, userId, groundingQueries: a.groundingQueries ?? 0 });
  }
  if (!result.ok || !result.model || !result.text.trim()) {
    if (result.error) console.warn(`[chat] Gemini failed — ${result.error.code}: ${result.error.message.slice(0, 160)}`);
    return null;
  }
  return { text: result.text, model: result.model };
}
