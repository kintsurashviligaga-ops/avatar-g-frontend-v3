/**
 * DeepSeek Provider for Text Generation
 * Uses OpenAI-compatible API
 */

import type { ITextGenerationProvider, TextGenerationInput, TextGenerationResult } from './openai';

export class DeepSeekProvider implements ITextGenerationProvider {
  name = 'deepseek';
  private apiKey: string | null = null;
  private baseUrl = 'https://api.deepseek.com/v1';

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || null;
  }

  isAvailable(): boolean {
    return this.apiKey !== null;
  }

  async generateText(input: TextGenerationInput): Promise<TextGenerationResult> {
    if (!this.apiKey) {
      throw new Error('DeepSeek API key not configured');
    }

    const startTime = Date.now();
    const model = input.model || 'deepseek-chat';

    try {
      const messages = [
        ...(input.system_prompt 
          ? [{ role: 'system', content: input.system_prompt }] 
          : []
        ),
        { role: 'user', content: input.prompt },
      ];

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: input.max_tokens || 1000,
          temperature: input.temperature ?? 0.7,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const generationTime = Date.now() - startTime;

      const message = data.choices?.[0]?.message?.content || '';
      const tokensIn = data.usage?.prompt_tokens || 0;
      const tokensOut = data.usage?.completion_tokens || 0;

      // DeepSeek pricing (as of Feb 2026): ~$0.14 / 1M input, $0.28 / 1M output
      const costUsd = 
        (tokensIn / 1_000_000) * 0.14 +
        (tokensOut / 1_000_000) * 0.28;

      return {
        text: message,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: parseFloat(costUsd.toFixed(6)),
        generation_time_ms: generationTime,
        model,
        metadata: {
          finish_reason: data.choices?.[0]?.finish_reason,
        },
      };
    } catch (error) {
      console.error('DeepSeek generation error:', error);
      throw new Error(
        `DeepSeek generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async *streamText(input: TextGenerationInput): AsyncGenerator<string> {
    if (!this.apiKey) {
      throw new Error('DeepSeek API key not configured');
    }

    const model = input.model || 'deepseek-chat';

    try {
      const messages = [
        ...(input.system_prompt 
          ? [{ role: 'system', content: input.system_prompt }] 
          : []
        ),
        { role: 'user', content: input.prompt },
      ];

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: input.max_tokens || 1000,
          temperature: input.temperature ?? 0.7,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  yield content;
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('DeepSeek streaming error:', error);
      throw new Error(
        `DeepSeek streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
