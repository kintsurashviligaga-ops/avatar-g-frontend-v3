/**
 * lib/gemini/client.ts
 * ====================
 * Gemini REST client supporting Pro and Flash model tiers.
 * Implements multimodal inputs (image base64, PDF, video URL).
 * Uses native fetch — no SDK package required at compile time.
 */

import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// gemini-2.0-flash is deprecated ("no longer available to new users", 404).
// Default to current GA models; override via env if Google rotates names again.
export const GEMINI_MODELS = {
  pro: process.env.GEMINI_MODEL_PRO ?? 'gemini-2.5-pro',
  flash: process.env.GEMINI_MODEL_FLASH ?? 'gemini-2.5-flash',
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
  /** Nucleus sampling. Omit → DEFAULT_TOP_P (0.95). */
  topP?: number;
  /** Top-k sampling. Omit → DEFAULT_TOP_K (40). */
  topK?: number;
  /** gemini-2.5-* "thinking" budget in tokens. Omit = model default (can add many seconds
   *  of latency). Set 0 to DISABLE thinking for fast, latency-sensitive calls. */
  thinkingBudget?: number;
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

// BLOCK_ONLY_HIGH (not MEDIUM): organic business/creative Georgian conversation — ad copy,
// competitor talk, edgy film briefs — routinely trips the MEDIUM filter into an empty
// "bail" (finishReason=SAFETY → text=''). Only HIGH-confidence genuinely harmful content is
// blocked. Central chokepoint → every Gemini caller inherits the looser, natural-conversation
// posture. Override the whole set via env if a deployment needs a stricter stance.
const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

// ─── Sampling defaults (anti-repetition) ──────────────────────────────────────
// Explicit topP/topK so vocabulary doesn't collapse into cyclic phrasing; overridable per-call.
const DEFAULT_TOP_P = 0.95;
const DEFAULT_TOP_K = 40;

// ─── History sanitization ─────────────────────────────────────────────────────

/**
 * Clean a caller-supplied history into a Gemini-valid `contents` prefix:
 *  - keep only 'user' | 'model' turns,
 *  - drop parts whose text is empty/whitespace-only (an empty part 400s the API),
 *  - drop turns left with no text,
 *  - drop any LEADING 'model' turn(s) — multi-turn contents must open on a 'user' turn.
 * Content order is otherwise preserved (we never reorder or fabricate turns). Pure + fail-open:
 * malformed shapes are filtered out, never thrown.
 */
export function sanitizeGeminiHistory(
  history?: { role: 'user' | 'model'; parts: { text: string }[] }[],
): { role: 'user' | 'model'; parts: { text: string }[] }[] {
  if (!Array.isArray(history)) return [];
  const cleaned = history
    .filter((t): t is { role: 'user' | 'model'; parts: { text: string }[] } => !!t && (t.role === 'user' || t.role === 'model'))
    .map((t) => ({
      role: t.role,
      parts: (Array.isArray(t.parts) ? t.parts : [])
        .filter((p) => !!p && typeof p.text === 'string' && p.text.trim().length > 0)
        .map((p) => ({ text: p.text })),
    }))
    .filter((t) => t.parts.length > 0);
  while (cleaned.length > 0 && cleaned[0]!.role === 'model') cleaned.shift();
  return cleaned;
}

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
  const apiKey = resolveGeminiKey();

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const url = `${GEMINI_BASE_URL}/models/${modelName}:generateContent?key=${apiKey}`;

  // Build contents array from (sanitized) history + current message
  const contents: { role: string; parts: Part[] }[] = [];

  for (const turn of sanitizeGeminiHistory(req.history)) {
    contents.push({ role: turn.role, parts: turn.parts });
  }

  contents.push({ role: 'user', parts: buildParts(req.prompt, req.attachments) });

  const body: Record<string, unknown> = {
    contents,
    safetySettings: SAFETY_SETTINGS,
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
      topP: req.topP ?? DEFAULT_TOP_P,
      topK: req.topK ?? DEFAULT_TOP_K,
      // Disable/limit gemini-2.5 "thinking" when a budget is given — thinking can add tens
      // of seconds, which breaks latency-bounded callers (e.g. the storyboard decomposer).
      ...(req.thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget: req.thinkingBudget } } : {}),
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
  const apiKey = resolveGeminiKey();

  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const url = `${GEMINI_BASE_URL}/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const contents: { role: string; parts: Part[] }[] = [];

  for (const turn of sanitizeGeminiHistory(req.history)) {
    contents.push({ role: turn.role, parts: turn.parts });
  }
  contents.push({ role: 'user', parts: buildParts(req.prompt, req.attachments) });

  const body: Record<string, unknown> = {
    contents,
    safetySettings: SAFETY_SETTINGS,
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
      topP: req.topP ?? DEFAULT_TOP_P,
      topK: req.topK ?? DEFAULT_TOP_K,
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
