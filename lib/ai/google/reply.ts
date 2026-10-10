/**
 * lib/ai/google/reply.ts — ONE non-streamed answer from the product Gemini chain, booked with real usage.
 *
 * The same chain, the same platform prompt and the same Google Search grounding as the product chat
 * (/api/chat/gemini), for every door that wants a whole answer at once: /api/chat (the service widgets) and the
 * channels — WhatsApp, Telegram, phone (lib/ai/channelBridge.ts). Before this, channels went through the OpenAI-backed
 * chatEngine (which production never calls while AI_GOOGLE_ONLY is on), and /api/chat sent the legacy 13.7 KB
 * AGENT_G_SYSTEM_PROMPT instead of lib/chat/platformPrompt — two different Agent Gs depending on the door.
 */
import 'server-only';
import { bookChatUsage } from '@/lib/services/billing/chatBudget';
import { chatModelChain } from '@/lib/ai/google/models';
import { streamGeminiChat, unbookedAttempts } from '@/lib/ai/google/chatStream';
import { resolveAgentProfile, toGeminiChatConfig } from '@/lib/agents/profile';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { buildPlatformPrompt } from '@/lib/chat/platformPrompt';
import { detectReplyLocale, type ReplyLocale } from '@/lib/chat/replyLocale';

const hasTokens = (u?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }): boolean =>
  !!u && ((u.inputTokens ?? 0) > 0 || (u.outputTokens ?? 0) > 0 || (u.totalTokens ?? 0) > 0);

export interface GeminiReplyOptions {
  /** A door's own style rules, appended to the platform prompt (e.g. WhatsApp formatting). */
  systemNote?: string;
  /** The reply language; default: the latest message's script (lib/chat/replyLocale), as the product chat does. */
  locale?: ReplyLocale;
  /** false = no Google Search grounding for this door (WhatsApp: a service channel, not a general assistant). */
  googleSearch?: boolean;
}

/**
 * Never throws; null when no model answered. `userId` must be a real account id or null — it keys the usage booking.
 */
export async function geminiReply(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  userId: string | null,
  signal?: AbortSignal,
  opts: GeminiReplyOptions = {},
): Promise<{ text: string; model: string } | null> {
  const resolved = resolveAgentProfile({});
  const profile = opts.googleSearch === false ? { ...resolved, googleSearch: false } : resolved;
  const locale = opts.locale ?? detectReplyLocale(messages);
  const platform = buildPlatformPrompt({ locale, googleSearch: profile.googleSearch });
  const system = opts.systemNote ? `${platform}\n\n${opts.systemNote}` : platform;
  const result = await streamGeminiChat({
    apiKey: resolveGeminiKey(),
    models: chatModelChain('standard'),
    messages,
    config: toGeminiChatConfig(profile, system),
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
