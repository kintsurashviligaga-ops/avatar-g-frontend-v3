/**
 * Channel Bridge — Routes omni-channel (WhatsApp, Telegram, Phone) messages through chatEngine.
 * All channel AI responses MUST pass through this bridge to ensure:
 * 1. Model routing (GPT-4.1 for complex, GPT-4o for general)
 * 2. Token tracking / cost estimation
 * 3. Memory isolation per user+channel
 * 4. Audit logging in ai_usage_log
 */

import { execute, type ChatEngineRequest, type ChatEngineResponse } from '@/lib/ai/chatEngine';

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
}

/**
 * Route a channel message through chatEngine and return a structured response.
 */
export async function generateChannelReply(req: ChannelAIRequest): Promise<ChannelAIResponse> {
  const agentId = req.agentId || 'executive-agent-g';

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...(req.history || []),
    { role: 'user' as const, content: req.text },
  ];

  const engineInput: ChatEngineRequest = {
    agentId,
    messages,
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
    };
  } catch (error) {
    console.error(`[ChannelBridge] ${req.channel} error for ${req.externalId}:`, error);
    return {
      reply: getChannelFallback(req.locale || 'en'),
      model: 'fallback',
      tokensIn: 0,
      tokensOut: 0,
      costEstimate: 0,
      dualStage: false,
      durationMs: 0,
      agentId,
    };
  }
}

function getChannelFallback(locale: string): string {
  if (locale === 'ka') return 'ბოდიშს ვიხდი, ამჟამად ვერ ვამუშავებ თქვენს მოთხოვნას. გთხოვთ სცადოთ მოგვიანებით.';
  if (locale === 'ru') return 'Приношу извинения, но в данный момент я не могу обработать ваш запрос. Пожалуйста, попробуйте позже.';
  return 'I apologize, but I am temporarily unable to process your request. Please try again in a moment.';
}
