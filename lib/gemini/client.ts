/**
 * lib/gemini/client.ts
 * ====================
 * Gemini REST client supporting Pro and Flash model tiers.
 * Implements multimodal inputs (image base64, PDF, video URL).
 * Uses native fetch — no SDK package required at compile time.
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export const GEMINI_MODELS = {
  pro: process.env.GEMINI_MODEL_PRO ?? 'gemini-2.0-flash',
  flash: process.env.GEMINI_MODEL_FLASH ?? 'gemini-2.0-flash',
} as const;

export type GeminiModelTier = 'pro' | 'flash';

export interface GeminiAttachment {
  type: 'image' | 'pdf' | 'video';
  mimeType: string;
  data: string; // base64
  url?: string;
}

export interface GeminiRequest {
  prompt: string;
  systemPrompt?: string;
  tier?: GeminiModelTier;
  attachments?: GeminiAttachment[];
  history?: { role: 'user' | 'model'; parts: { text: string }[] }[];
  maxTokens?: number;
  temperature?: number;
}

export interface GeminiResponse {
  text: string;
  model: string;
  tier: GeminiModelTier;
  tokensIn?: number;
  tokensOut?: number;
  finishReason?: string;
}

// ─── Safety thresholds ────────────────────────────────────────────────────────

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

// ─── Part builders ────────────────────────────────────────────────────────────

interface TextPart { text: string }
interface InlineDataPart { inlineData: { mimeType: string; data: string } }
type Part = TextPart | InlineDataPart;

function buildParts(prompt: string, attachments?: GeminiAttachment[]): Part[] {
  const parts: Part[] = [];
  if (attachments?.length) {
    for (const att of attachments) {
      parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
    }
  }
  parts.push({ text: prompt });
  return parts;
}

// ─── Core generate function ───────────────────────────────────────────────────

export async function generateWithGemini(req: GeminiRequest): Promise<GeminiResponse> {
  const tier: GeminiModelTier = req.tier ?? 'pro';
  const modelName = GEMINI_MODELS[tier];
  const apiKey = process.env.GEMINI_API_KEY ?? '';

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const url = `${GEMINI_BASE_URL}/models/${modelName}:generateContent?key=${apiKey}`;

  // Build contents array from history + current message
  const contents: { role: string; parts: Part[] }[] = [];

  if (req.history?.length) {
    for (const turn of req.history) {
      contents.push({ role: turn.role, parts: turn.parts });
    }
  }

  contents.push({ role: 'user', parts: buildParts(req.prompt, req.attachments) });

  const body: Record<string, unknown> = {
    contents,
    safetySettings: SAFETY_SETTINGS,
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
    },
  };

  if (req.systemPrompt) {
    body.systemInstruction = { parts: [{ text: req.systemPrompt }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as GeminiAPIResponse;

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => ('text' in p ? p.text : '')).join('') ?? '';

  return {
    text,
    model: modelName,
    tier,
    tokensIn: data.usageMetadata?.promptTokenCount,
    tokensOut: data.usageMetadata?.candidatesTokenCount,
    finishReason: candidate?.finishReason,
  };
}

// ─── Streaming variant ────────────────────────────────────────────────────────

export async function* streamWithGemini(
  req: GeminiRequest,
): AsyncGenerator<string, GeminiResponse, unknown> {
  const tier: GeminiModelTier = req.tier ?? 'flash';
  const modelName = GEMINI_MODELS[tier];
  const apiKey = process.env.GEMINI_API_KEY ?? '';

  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const url = `${GEMINI_BASE_URL}/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const contents: { role: string; parts: Part[] }[] = [];

  if (req.history?.length) {
    for (const turn of req.history) {
      contents.push({ role: turn.role, parts: turn.parts });
    }
  }
  contents.push({ role: 'user', parts: buildParts(req.prompt, req.attachments) });

  const body: Record<string, unknown> = {
    contents,
    safetySettings: SAFETY_SETTINGS,
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
    },
  };

  if (req.systemPrompt) {
    body.systemInstruction = { parts: [{ text: req.systemPrompt }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Gemini stream error ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(jsonStr) as GeminiAPIResponse;
        const text = parsed.candidates?.[0]?.content?.parts
          ?.map((p) => ('text' in p ? p.text : ''))
          .join('') ?? '';
        if (text) {
          fullText += text;
          yield text;
        }
        if (parsed.usageMetadata) {
          tokensIn = parsed.usageMetadata.promptTokenCount;
          tokensOut = parsed.usageMetadata.candidatesTokenCount;
        }
      } catch {
        // Ignore parse errors on partial chunks
      }
    }
  }

  return { text: fullText, model: modelName, tier, tokensIn, tokensOut };
}

// ─── Convenience wrapper for image analysis ───────────────────────────────────

export async function analyzeImageWithGemini(options: {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
}): Promise<GeminiResponse> {
  return generateWithGemini({
    prompt: options.prompt,
    systemPrompt: options.systemPrompt,
    tier: 'pro',
    attachments: [{ type: 'image', mimeType: options.mimeType, data: options.imageBase64 }],
    temperature: options.temperature ?? 0.3,
  });
}

// ─── Internal API response types ─────────────────────────────────────────────

interface GeminiAPIResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
      role?: string;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}
