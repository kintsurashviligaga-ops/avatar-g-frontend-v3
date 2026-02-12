/**
 * OpenAI Provider for Text Generation
 * Supports GPT-4 and other OpenAI models
 */

import OpenAI from 'openai';

export interface TextGenerationInput {
  prompt: string;
  system_prompt?: string;
  max_tokens?: number;
  temperature?: number;
  model?: string;
  stream?: boolean;
}

export interface TextGenerationResult {
  text: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  generation_time_ms: number;
  model: string;
  metadata?: Record<string, unknown>;
}

export interface ITextGenerationProvider {
  name: string;
  generateText(input: TextGenerationInput): Promise<TextGenerationResult>;
  streamText?(input: TextGenerationInput): AsyncGenerator<string>;
  isAvailable(): boolean;
}

export class OpenAIProvider implements ITextGenerationProvider {
  name = 'openai';
  private client: OpenAI | null = null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async generateText(input: TextGenerationInput): Promise<TextGenerationResult> {
    if (!this.client) {
      throw new Error('OpenAI API key not configured');
    }

    const startTime = Date.now();
    const model = input.model || 'gpt-4o-mini';

    try {
      const completion = await this.client.chat.completions.create({
        model,
        messages: [
          ...(input.system_prompt 
            ? [{ role: 'system' as const, content: input.system_prompt }] 
            : []
          ),
          { role: 'user' as const, content: input.prompt },
        ],
        max_tokens: input.max_tokens || 1000,
        temperature: input.temperature ?? 0.7,
        stream: false,
      });

      const generationTime = Date.now() - startTime;
      const message = completion.choices[0]?.message?.content || '';
      const tokensIn = completion.usage?.prompt_tokens || 0;
      const tokensOut = completion.usage?.completion_tokens || 0;

      // Rough cost estimation (update these rates as needed)
      // GPT-4o-mini: $0.150 / 1M input, $0.600 / 1M output
      const costPer1MIn = model.includes('gpt-4o-mini') ? 0.15 : 0.30;
      const costPer1MOut = model.includes('gpt-4o-mini') ? 0.60 : 1.20;
      const costUsd = 
        (tokensIn / 1_000_000) * costPer1MIn +
        (tokensOut / 1_000_000) * costPer1MOut;

      return {
        text: message,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: parseFloat(costUsd.toFixed(6)),
        generation_time_ms: generationTime,
        model,
        metadata: {
          finish_reason: completion.choices[0]?.finish_reason,
        },
      };
    } catch (error) {
      console.error('OpenAI generation error:', error);
      throw new Error(
        `OpenAI generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async *streamText(input: TextGenerationInput): AsyncGenerator<string> {
    if (!this.client) {
      throw new Error('OpenAI API key not configured');
    }

    const model = input.model || 'gpt-4o-mini';

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages: [
          ...(input.system_prompt 
            ? [{ role: 'system' as const, content: input.system_prompt }] 
            : []
          ),
          { role: 'user' as const, content: input.prompt },
        ],
        max_tokens: input.max_tokens || 1000,
        temperature: input.temperature ?? 0.7,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('OpenAI streaming error:', error);
      throw new Error(
        `OpenAI streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
