/**
 * OpenRouter Provider for Claude Opus 4.6 Fast
 * Uses OpenRouter's chat completion endpoint and prefers the configured OpenRouter key.
 */

import { shouldUseRealProvider } from '@/lib/server/provider-mode';
import type { ITextGenerationProvider, TextGenerationInput, TextGenerationResult } from './openai';

export class OpenRouterProvider implements ITextGenerationProvider {
  name = 'openrouter';
  private apiKey: string | null = null;
  private baseUrl = process.env.OPENROUTER_API_URL?.replace(/\/+$/, '') || 'https://api.openrouter.ai/v1';
  private defaultModel = process.env.OPENROUTER_MODEL || 'claude-opus-4.6-fast';

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || null;
  }

  isAvailable(): boolean {
    return this.apiKey !== null && shouldUseRealProvider('openrouter');
  }

  private buildMessages(input: TextGenerationInput) {
    return [
      ...(input.system_prompt
        ? [{ role: 'system', content: input.system_prompt }]
        : []),
      { role: 'user', content: input.prompt },
    ];
  }

  private async doRequest(payload: Record<string, unknown>) {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }

    return response;
  }

  async generateText(input: TextGenerationInput): Promise<TextGenerationResult> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const startTime = Date.now();
    const model = input.model || this.defaultModel;
    const payload = {
      model,
      messages: this.buildMessages(input),
      max_tokens: input.max_tokens || 1000,
      temperature: input.temperature ?? 0.7,
      stream: false,
    };

    try {
      const response = await this.doRequest(payload);
      const data = await response.json();
      const message = data.choices?.[0]?.message?.content || '';
      const tokensIn = data.usage?.prompt_tokens || 0;
      const tokensOut = data.usage?.completion_tokens || 0;
      const generationTime = Date.now() - startTime;

      return {
        text: message,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: 0,
        generation_time_ms: generationTime,
        model,
        metadata: {
          finish_reason: data.choices?.[0]?.finish_reason,
        },
      };
    } catch (error) {
      console.error('OpenRouter generation error:', error);
      throw new Error(
        `OpenRouter generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async *streamText(input: TextGenerationInput): AsyncGenerator<string> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const model = input.model || this.defaultModel;
    const payload = {
      model,
      messages: this.buildMessages(input),
      max_tokens: input.max_tokens || 1000,
      temperature: input.temperature ?? 0.7,
      stream: true,
    };

    const response = await this.doRequest(payload);
    if (!response.body) {
      throw new Error('OpenRouter streaming response body not available');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const payloadText = trimmed.replace(/^data:\s*/, '');
          if (payloadText === '[DONE]') continue;

          try {
            const chunk = JSON.parse(payloadText);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (typeof delta === 'string') {
              yield delta;
            }
          } catch {
            // Ignore parse errors for non-JSON event lines.
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
