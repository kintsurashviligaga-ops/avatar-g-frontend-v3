/**
 * Tool Registry for AI Agent Capabilities
 * Defines internal tools that agents can use
 */

export type ToolId = 'summarize' | 'translate' | 'format-prompt' | 'analyze-sentiment';

export interface Tool {
  id: ToolId;
  name: string;
  description: string;
  execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

/**
 * Summarize text tool
 */
const summarizeTool: Tool = {
  id: 'summarize',
  name: 'Summarize Text',
  description: 'Condense long text into a concise summary',
  execute: async (input: Record<string, unknown>) => {
    const text = String(input.text || '');
    const maxLength = Number(input.maxLength || 200);

    if (!text) {
      throw new Error('Text input required');
    }

    // Simple extractive summarization (first sentences up to maxLength)
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    let summary = '';
    
    for (const sentence of sentences) {
      if ((summary + sentence).length > maxLength) break;
      summary += sentence;
    }

    return {
      summary: summary.trim() || text.substring(0, maxLength),
      original_length: text.length,
      summary_length: summary.length,
    };
  },
};

/**
 * Translate text tool (placeholder - would use real API in production)
 */
const translateTool: Tool = {
  id: 'translate',
  name: 'Translate Text',
  description: 'Translate text between languages',
  execute: async (input: Record<string, unknown>) => {
    const text = String(input.text || '');
    const targetLang = String(input.targetLang || 'en');

    if (!text) {
      throw new Error('Text input required');
    }

    // TODO: Integrate with real translation API (Google Translate, DeepL, etc.)
    return {
      translated: `[${targetLang.toUpperCase()}] ${text}`,
      source_lang: 'auto',
      target_lang: targetLang,
      note: 'Mock translation - integrate real API in production',
    };
  },
};

/**
 * Format prompt tool
 */
const formatPromptTool: Tool = {
  id: 'format-prompt',
  name: 'Format Prompt',
  description: 'Format and optimize prompts for better AI responses',
  execute: async (input: Record<string, unknown>) => {
    const rawPrompt = String(input.prompt || '');
    const style = String(input.style || 'default');

    if (!rawPrompt) {
      throw new Error('Prompt input required');
    }

    let formatted = rawPrompt.trim();

    // Apply formatting based on style
    switch (style) {
      case 'detailed':
        formatted = `Please provide a detailed, comprehensive response to the following:\n\n${formatted}\n\nInclude specific examples and explanations.`;
        break;
      case 'concise':
        formatted = `Provide a brief, concise answer:\n\n${formatted}`;
        break;
      case 'creative':
        formatted = `Think creatively and provide an imaginative response:\n\n${formatted}`;
        break;
      default:
        formatted = `${formatted}`;
    }

    return {
      formatted_prompt: formatted,
      original_length: rawPrompt.length,
      formatted_length: formatted.length,
      style,
    };
  },
};

/**
 * Analyze sentiment tool
 */
const analyzeSentimentTool: Tool = {
  id: 'analyze-sentiment',
  name: 'Analyze Sentiment',
  description: 'Analyze the sentiment of text (positive/negative/neutral)',
  execute: async (input: Record<string, unknown>) => {
    const text = String(input.text || '');

    if (!text) {
      throw new Error('Text input required');
    }

    // Simple keyword-based sentiment analysis (for demo)
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'happy', 'love'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'sad', 'angry'];

    const lowerText = text.toLowerCase();
    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of positiveWords) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lowerText.match(regex);
      positiveCount += matches ? matches.length : 0;
    }

    for (const word of negativeWords) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lowerText.match(regex);
      negativeCount += matches ? matches.length : 0;
    }

    let sentiment: 'positive' | 'negative' | 'neutral';
    let confidence: number;

    if (positiveCount > negativeCount) {
      sentiment = 'positive';
      confidence = Math.min((positiveCount / (positiveCount + negativeCount + 1)) * 100, 95);
    } else if (negativeCount > positiveCount) {
      sentiment = 'negative';
      confidence = Math.min((negativeCount / (positiveCount + negativeCount + 1)) * 100, 95);
    } else {
      sentiment = 'neutral';
      confidence = 50;
    }

    return {
      sentiment,
      confidence: Math.round(confidence),
      positive_words: positiveCount,
      negative_words: negativeCount,
      text_length: text.length,
    };
  },
};

/**
 * Tool Registry
 */
class ToolRegistry {
  private tools: Map<ToolId, Tool>;

  constructor() {
    this.tools = new Map([
      ['summarize', summarizeTool],
      ['translate', translateTool],
      ['format-prompt', formatPromptTool],
      ['analyze-sentiment', analyzeSentimentTool],
    ]);
  }

  /**
   * Get a tool by ID
   */
  getTool(toolId: ToolId): Tool | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Execute a tool
   */
  async executeTool(toolId: ToolId, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const tool = this.getTool(toolId);
    
    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }

    try {
      return await tool.execute(input);
    } catch (error) {
      throw new Error(
        `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * List all available tools
   */
  listTools(): Array<{ id: ToolId; name: string; description: string }> {
    return Array.from(this.tools.values()).map(tool => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
    }));
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
