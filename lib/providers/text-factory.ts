/**
 * Text Generation Provider Factory
 * Selects best available provider based on configuration
 */

import { OpenAIProvider } from './openai';
import { DeepSeekProvider } from './deepseek';
import { MockTextProvider } from './text-mock';
import type { ITextGenerationProvider } from './openai';

export type TextProviderId = 'openai' | 'deepseek' | 'mock';

class TextProviderFactory {
  private providers: Map<TextProviderId, ITextGenerationProvider>;

  constructor() {
    const entries: Array<[TextProviderId, ITextGenerationProvider]> = [
      ['openai', new OpenAIProvider()],
      ['deepseek', new DeepSeekProvider()],
      ['mock', new MockTextProvider()],
    ];

    this.providers = new Map(entries);
  }

  /**
   * Get a specific provider
   */
  getProvider(providerId: TextProviderId): ITextGenerationProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }
    return provider;
  }

  /**
   * Get the best available provider
   * Priority: OpenAI > DeepSeek > Mock
   */
  getBestProvider(): ITextGenerationProvider {
    // Try OpenAI first
    const openai = this.providers.get('openai');
    if (openai?.isAvailable()) {
      return openai;
    }

    // Try DeepSeek
    const deepseek = this.providers.get('deepseek');
    if (deepseek?.isAvailable()) {
      return deepseek;
    }

    // Fallback to mock
    return this.providers.get('mock')!;
  }

  /**
   * Select provider based on preference with fallback
   */
  selectProvider(preference?: TextProviderId): ITextGenerationProvider {
    if (preference) {
      const preferred = this.providers.get(preference);
      if (preferred?.isAvailable()) {
        return preferred;
      }
      console.warn(`Preferred provider ${preference} not available, using best available`);
    }

    return this.getBestProvider();
  }

  /**
   * List all available providers
   */
  getAvailableProviders(): Array<{ id: TextProviderId; name: string }> {
    const available: Array<{ id: TextProviderId; name: string }> = [];
    
    for (const [id, provider] of this.providers.entries()) {
      if (provider.isAvailable()) {
        available.push({ id, name: provider.name });
      }
    }

    return available;
  }
}

// Singleton instance
export const textProviderFactory = new TextProviderFactory();
