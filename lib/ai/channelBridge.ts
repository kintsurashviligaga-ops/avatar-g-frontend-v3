/**
 * Channel Bridge — the one door through which omni-channel messages (WhatsApp, Telegram, Phone) get an AI answer.
 * All channel AI responses MUST pass through this bridge to ensure:
 * 1. The same engine as the website: the product Gemini chain while AI_GOOGLE_ONLY is on (the default), the
 *    multi-vendor chatEngine only when it is switched off
 * 2. The shared chat budget gate (a refusal is a polite reply, never an error)
 * 3. Usage booking per account
 * 4. Memory isolation per user+channel (the caller passes this channel's own history)
 *
 * ⚠️ BEFORE 2026-10-03 THIS CALLED chatEngine ONLY — an OpenAI client production does not use. With AI_GOOGLE_ONLY on,
 * every WhatsApp/Telegram/phone answer could only ever be the fallback apology.
 */

import { execute, type ChatEngineRequest, type ChatEngineResponse } from '@/lib/ai/chatEngine';
import { isAiGoogleOnly } from '@/lib/ai/google/policy';
import { chatBudgetAllows } from '@/lib/services/billing/chatBudget';

export type ChannelType = 'whatsapp' | 'telegram' | 'phone' | 'web';

export interface ChannelAIRequest {
  channel: ChannelType;
  userId: string;
  externalId: string;          // phone number, telegram chat id, etc.
  text: string;
  locale?: 'en' | 'ka' | 'ru';
  agentId?: string;            // defaults to 'executive-agent-g' for channels
  sessionId?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** This channel's style rules, appended to the Agent G prompt (e.g. WhatsApp formatting). */
  systemNote?: string;
}

export interface ChannelAIResponse {
  reply: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costEstimate: number;
  dualStage: boolean;
  durationMs: number;
  agentId: string;
  /** False when `reply` is the fallback text (no model answered, or the budget refused). */
  answered: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GEMINI_TIMEOUT_MS = 25_000;

/**
 * Route a channel message to the model and return a structured response. Never throws.
 */
export async function generateChannelReply(req: ChannelAIRequest): Promise<ChannelAIResponse> {
  const agentId = req.agentId || 'executive-agent-g';
  const started = Date.now();

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...(req.history || []),
    { role: 'user' as const, content: req.text },
  ];

  const fallback = (model: string): ChannelAIResponse => ({
    reply: getChannelFallback(req.locale || 'en'),
    model,
    tokensIn: 0,
    tokensOut: 0,
    costEstimate: 0,
    dualStage: false,
    durationMs: Date.now() - started,
    agentId,
    answered: false,
  });

  if (!(await chatBudgetAllows(messages.map((m) => m.content).join(' ')))) return fallback('budget');

  if (isAiGoogleOnly()) {
    try {
      // Lazy: the reply module is server-only, and the routes that import this bridge are loaded in plain jest too.
      const { geminiReply } = await import('@/lib/ai/google/reply');
      const g = await geminiReply(
        messages,
        UUID_RE.test(req.userId) ? req.userId : null, // a Telegram/phone id is not an account — book it unattributed
        AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        { systemNote: req.systemNote, locale: req.locale },
      );
      if (!g) return fallback('fallback');
      return {
        reply: g.text,
        model: g.model,
        tokensIn: 0,
        tokensOut: 0,
        costEstimate: 0,
        dualStage: false,
        durationMs: Date.now() - started,
        agentId,
        answered: true,
      };
    } catch (error) {
      console.error(`[ChannelBridge] ${req.channel} Gemini error:`, error instanceof Error ? error.message : 'unknown');
      return fallback('fallback');
    }
  }

  const engineInput: ChatEngineRequest = {
    agentId,
    messages: req.systemNote ? [{ role: 'system', content: req.systemNote }, ...messages] : messages,
    userId: req.userId,
    sessionId: req.sessionId || `${req.channel}:${req.externalId}`,
    channel: req.channel,
  };

  try {
    const result: ChatEngineResponse = await execute(engineInput);

    return {
      reply: result.text,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costEstimate: result.costEstimate,
      dualStage: result.dualStage,
      durationMs: result.durationMs,
      agentId,
      answered: Boolean(result.text?.trim()),
    };
  } catch (error) {
    console.error(`[ChannelBridge] ${req.channel} error:`, error instanceof Error ? error.message : 'unknown');
    return fallback('fallback');
  }
}

function getChannelFallback(locale: string): string {
  if (locale === 'ka') return 'ბოდიშს ვიხდი, ამჟამად ვერ ვამუშავებ თქვენს მოთხოვნას. გთხოვთ სცადოთ მოგვიანებით.';
  if (locale === 'ru') return 'Приношу извинения, но в данный момент я не могу обработать ваш запрос. Пожалуйста, попробуйте позже.';
  return 'I apologize, but I am temporarily unable to process your request. Please try again in a moment.';
}
