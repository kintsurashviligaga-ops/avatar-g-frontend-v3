/**
 * Smart AI Router
 * Automatically selects the best AI model for each task type
 * Based on strengths: speed, quality, language support, creativity
 */

import { callGemini } from "./gemini";

export type AIProvider = 
  | "gemini"      // Best for: Georgian, multimodal, analysis
  | "openai"      // Best for: Creative writing, translations, general
  | "claude"      // Best for: Long-form, analysis, strategy, technical
  | "groq"        // Best for: Speed, real-time responses
  | "deepseek"    // Best for: Code, technical content
  | "xai";        // Best for: Conversational, current topics

export type TaskType =
  | "creative-writing"
  | "business-strategy"
  | "technical-content"
  | "georgian-language"
  | "translation"
  | "code-generation"
  | "analysis"
  | "conversation"
  | "prompt-optimization"
  | "real-time";

interface AIRequest {
  prompt: string;
  taskType: TaskType;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  language?: "ka" | "en";
}

interface AIResponse {
  text: string;
  provider: AIProvider;
  error?: string;
}

// Model selection strategy
const MODEL_STRATEGY: Record<TaskType, AIProvider[]> = {
  "creative-writing": ["openai", "claude", "gemini"],
  "business-strategy": ["claude", "gemini", "openai"],
  "technical-content": ["deepseek", "claude", "gemini"],
  "georgian-language": ["gemini", "openai"],
  "translation": ["openai", "gemini", "claude"],
  "code-generation": ["deepseek", "openai", "claude"],
  "analysis": ["claude", "gemini", "openai"],
  "conversation": ["gemini", "xai", "openai"],
  "prompt-optimization": ["claude", "gemini", "openai"],
  "real-time": ["groq", "gemini", "openai"],
};

export async function smartAICall(request: AIRequest): Promise<AIResponse> {
  const preferredModels = MODEL_STRATEGY[request.taskType] || ["gemini"];
  
  // Try each model in order of preference
  for (const provider of preferredModels) {
    try {
      const result = await callAIProvider(provider, request);
      if (result.text && !result.error) {
        return { ...result, provider };
      }
    } catch (error) {
      console.log(`${provider} failed, trying next...`);
      continue;
    }
  }
  
  // Final fallback to Gemini
  const fallback = await callGemini(request);
  return { text: fallback.text, provider: "gemini", error: fallback.error };
}

async function callAIProvider(
  provider: AIProvider,
  request: AIRequest
): Promise<AIResponse> {
  switch (provider) {
    case "gemini":
      return await callGeminiProvider(request);
    case "openai":
      return await callOpenAIProvider(request);
    case "claude":
      return await callClaudeProvider(request);
    case "groq":
      return await callGroqProvider(request);
    case "deepseek":
      return await callDeepSeekProvider(request);
    case "xai":
      return await callXAIProvider(request);
    default:
      return await callGeminiProvider(request);
  }
}

// GEMINI (Google)
async function callGeminiProvider(request: AIRequest): Promise<AIResponse> {
  const result = await callGemini({
    prompt: request.prompt,
    systemPrompt: request.systemPrompt,
    temperature: request.temperature,
    maxTokens: request.maxTokens,
    language: request.language,
  });
  return { text: result.text, provider: "gemini", error: result.error };
}

// OPENAI (GPT-4)
async function callOpenAIProvider(request: AIRequest): Promise<AIResponse> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not found");
  }

  const systemMessage = request.systemPrompt || "You are a helpful AI assistant.";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + OPENAI_API_KEY,
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: request.prompt },
      ],
      temperature: request.temperature || 0.7,
      max_tokens: request.maxTokens || 2048,
    }),
  });

  if (!response.ok) {
    throw new Error("OpenAI API error: " + response.status);
  }

  const data = await response.json();
  return {
    text: data.choices[0].message.content,
    provider: "openai",
  };
}

// CLAUDE (Anthropic)
async function callClaudeProvider(request: AIRequest): Promise<AIResponse> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Anthropic API key not found");
  }

  const systemMessage = request.systemPrompt || "You are Claude, a helpful AI assistant.";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature || 0.7,
      system: systemMessage,
      messages: [
        { role: "user", content: request.prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("Claude API error: " + response.status);
  }

  const data = await response.json();
  return {
    text: data.content[0].text,
    provider: "claude",
  };
}

// GROQ (Fast inference)
async function callGroqProvider(request: AIRequest): Promise<AIResponse> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    throw new Error("Groq API key not found");
  }

  const systemMessage = request.systemPrompt || "You are a helpful AI assistant.";
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + GROQ_API_KEY,
    },
    body: JSON.stringify({
      model: "mixtral-8x7b-32768",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: request.prompt },
      ],
      temperature: request.temperature || 0.7,
      max_tokens: request.maxTokens || 2048,
    }),
  });

  if (!response.ok) {
    throw new Error("Groq API error: " + response.status);
  }

  const data = await response.json();
  return {
    text: data.choices[0].message.content,
    provider: "groq",
  };
}

// DEEPSEEK (Technical)
async function callDeepSeekProvider(request: AIRequest): Promise<AIResponse> {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
  if (!DEEPSEEK_API_KEY) {
    throw new Error("DeepSeek API key not found");
  }

  const systemMessage = request.systemPrompt || "You are a helpful AI assistant.";
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + DEEPSEEK_API_KEY,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: request.prompt },
      ],
      temperature: request.temperature || 0.7,
      max_tokens: request.maxTokens || 2048,
    }),
  });

  if (!response.ok) {
    throw new Error("DeepSeek API error: " + response.status);
  }

  const data = await response.json();
  return {
    text: data.choices[0].message.content,
    provider: "deepseek",
  };
}

// X.AI (Grok)
async function callXAIProvider(request: AIRequest): Promise<AIResponse> {
  const XAI_API_KEY = process.env.XAI_API_KEY;
  if (!XAI_API_KEY) {
    throw new Error("X.AI API key not found");
  }

  const systemMessage = request.systemPrompt || "You are Grok, a helpful AI assistant.";
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + XAI_API_KEY,
    },
    body: JSON.stringify({
      model: "grok-beta",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: request.prompt },
      ],
      temperature: request.temperature || 0.7,
      max_tokens: request.maxTokens || 2048,
    }),
  });

  if (!response.ok) {
    throw new Error("X.AI API error: " + response.status);
  }

  const data = await response.json();
  return {
    text: data.choices[0].message.content,
    provider: "xai",
  };
}
