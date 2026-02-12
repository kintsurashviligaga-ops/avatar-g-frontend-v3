/**
 * Mock Text Provider for Testing
 * Returns placeholder responses when real APIs unavailable
 */

import type { ITextGenerationProvider, TextGenerationInput, TextGenerationResult } from './openai';

export class MockTextProvider implements ITextGenerationProvider {
  name = 'mock';

  isAvailable(): boolean {
    return true; // Always available
  }

  async generateText(input: TextGenerationInput): Promise<TextGenerationResult> {
    // Simulate generation delay
    await this.delay(1000 + Math.random() * 1000);

    const wordCount = Math.floor(Math.random() * 50) + 50;
    const mockText = this.generateMockResponse(input.prompt, wordCount);

    return {
      text: mockText,
      tokens_in: Math.floor(input.prompt.length / 4),
      tokens_out: Math.floor(mockText.length / 4),
      cost_usd: 0,
      generation_time_ms: 1500,
      model: 'mock-text-model',
      metadata: {
        mock: true,
        prompt_preview: input.prompt.substring(0, 50),
      },
    };
  }

  async *streamText(input: TextGenerationInput): AsyncGenerator<string> {
    const wordCount = Math.floor(Math.random() * 50) + 50;
    const mockText = this.generateMockResponse(input.prompt, wordCount);
    const words = mockText.split(' ');

    for (const word of words) {
      await this.delay(50);
      yield word + ' ';
    }
  }

  private generateMockResponse(prompt: string, wordCount: number): string {
    const templates = [
      `Based on your prompt "${prompt.substring(0, 30)}...", here's a mock response: `,
      `Thank you for your question about "${prompt.substring(0, 30)}...". `,
      `Regarding "${prompt.substring(0, 30)}...", I can provide the following insight: `,
    ];

    const template = templates[Math.floor(Math.random() * templates.length)];
    const filler = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(
      Math.ceil(wordCount / 8)
    );

    return template + filler.split(' ').slice(0, wordCount).join(' ');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
