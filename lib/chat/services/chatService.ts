/**
 * lib/chat/services/chatService.ts
 * Main chat API service — SSE streaming + fallback.
 * Decoupled from UI components.
 */

import type { ChatMessage } from '../types';

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (model: string) => void;
  onError: (error: Error) => void;
}

export interface ChatRequest {
  agentId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  channel?: string;
}

/**
 * Stream a chat response via SSE.
 * Returns an AbortController to stop the stream.
 */
export function streamChat(
  request: ChatRequest,
  callbacks: StreamCallbacks
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: request.agentId,
          messages: request.messages,
          channel: request.channel ?? 'web',
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Stream unavailable (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true })
          .split('\n')
          .filter(l => l.startsWith('data: '));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) {
              callbacks.onToken(data.token);
            }
            if (data.done) {
              callbacks.onDone(data.model || '');
            }
            if (data.error) {
              const errorText = String(data.error);
              callbacks.onError(new Error(errorText));
              return;
            }
          } catch {
            // Skip individual parse errors
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        callbacks.onError(err as Error);
      }
    }
  })();

  return controller;
}

/**
 * Non-streaming fallback via /api/chat.
 */
export async function sendChatFallback(
  text: string,
  agentId: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<{ response: string; model: string }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: text,
      agentId,
      history,
      channel: 'web',
    }),
  });

  const data = await res.json();
  return {
    response: data?.data?.response || data?.response || 'Sorry, an error occurred.',
    model: data?.data?.model || data?.model || '',
  };
}

/**
 * Build message history from recent messages (last 20).
 */
export function buildHistory(
  messages: ChatMessage[],
  limit: number = 20
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .slice(-limit)
    .filter((m): m is ChatMessage & { type: 'user' | 'assistant' } =>
      m.type === 'user' || m.type === 'assistant'
    )
    .map(m => ({
      role: m.type as 'user' | 'assistant',
      content: m.type === 'user' ? m.text : m.text,
    }));
}
