/**
 * lib/gemini/client.ts
 * ====================
 * Gemini REST client supporting Pro and Flash model tiers.
 * Implements multimodal inputs (image base64, PDF, video URL).
 * Uses native fetch — no SDK package required at compile time.
 * The endpoint and credential come from the selected Google transport (lib/ai/google/transport: the Gemini API key, or
 * Vertex AI with Workload Identity when GEMINI_TRANSPORT=vertex). An unconfigured transport throws NotConfiguredError.
 */

import { geminiTierModel, isRetiredModel, normalizeModelId } from '@/lib/ai/google/models';
import { googleModelFetch } from '@/lib/ai/google/transport';

// Defaults and env overrides (GEMINI_MODEL_PRO / GEMINI_MODEL_FLASH) live in lib/ai/google/models.ts, which drops
// retired ids (gemini-1.x / 2.0-* answer 404) and empty values instead of sending them to Google.
export const GEMINI_MODELS = {
  pro: geminiTierModel('pro'),
  flash: geminiTierModel('flash'),
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
  /** A specific model id, overriding the tier's (e.g. the video director's VEO_DIRECTOR_MODEL). */
  model?: string;
  /** One-shot request timeout. Default 30 s — a 6-scene director brief can need longer. */
  timeoutMs?: number;
  /** 'application/json' makes the model return a JSON document (no prose, no code fences). */
  responseMimeType?: 'application/json';
  /** Ground the answer in Google Search (`tools: [{ googleSearch: {} }]`); the model decides when to look. Ignored with JSON. */
  googleSearch?: boolean;
}

export interface GeminiResponse {
  text: string;
  model: string;
  tier: GeminiModelTier;
  tokensIn?: number;
  tokensOut?: number;
  /** Prompt tokens served from Gemini's context cache (implicit or explicit) — a subset of tokensIn, billed lower. */
  tokensCached?: number;
  /** Thinking tokens — NOT in tokensOut (the REST candidatesTokenCount excludes them), billed as output. */
  tokensThinking?: number;
  /** The provider's total, when it reports one. */
  tokensTotal?: number;
  /** Wall-clock time of the call (request sent → reply parsed), for the latency baseline. */
  latencyMs?: number;
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
  // A per-call override (llmText's geminiModel ← VEO_DIRECTOR_MODEL) gets the tier env's guard: a retired, empty or
  // malformed id falls back to the tier model instead of 404ing, and a `models/` prefix no longer doubles in the URL.
  const override = normalizeModelId(req.model);
  const modelName = override && !isRetiredModel(override) ? override : GEMINI_MODELS[tier];

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
      ...(req.responseMimeType ? { responseMimeType: req.responseMimeType } : {}),
    },
  };

  if (req.systemPrompt) {
    body.systemInstruction = { parts: [{ text: req.systemPrompt }] };
  }
  // Grounding and a forced JSON response cannot be combined in one request.
  if (req.googleSearch && !req.responseMimeType) body.tools = [{ googleSearch: {} }];

  const startedAt = Date.now();
  const res = await googleModelFetch(modelName, 'generateContent', {
    method: 'POST',
    body: JSON.stringify(body),
    // Bound the one-shot call so a hung socket can't pin the request up to maxDuration; every caller
    // (viaGemini / handleGeminiMultimodal) wraps this and falls through on throw. (streamWithGemini untouched.)
    signal: AbortSignal.timeout(req.timeoutMs ?? 30_000),
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
    ...usageExtras(data.usageMetadata),
    latencyMs: Date.now() - startedAt,
    finishReason: candidate?.finishReason,
  };
}

// ─── Streaming variant ────────────────────────────────────────────────────────

export async function* streamWithGemini(
  req: GeminiRequest,
): AsyncGenerator<string, GeminiResponse, unknown> {
  const tier: GeminiModelTier = req.tier ?? 'flash';
  const modelName = GEMINI_MODELS[tier];
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

  const res = await googleModelFetch(modelName, 'streamGenerateContent', {
    method: 'POST',
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
  let extras: ReturnType<typeof usageExtras> = {};
  const startedAt = Date.now();

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
          extras = usageExtras(parsed.usageMetadata);
        }
      } catch {
        // Ignore parse errors on partial chunks
      }
    }
  }

  return { text: fullText, model: modelName, tier, tokensIn, tokensOut, ...extras, latencyMs: Date.now() - startedAt };
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
  usageMetadata?: GeminiUsageMetadata;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

/** The cache / thinking / total counts, each only when Gemini reported it as a non-negative number. */
function usageExtras(u: GeminiUsageMetadata | undefined): Pick<GeminiResponse, 'tokensCached' | 'tokensThinking' | 'tokensTotal'> {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const cached = n(u?.cachedContentTokenCount);
  const thinking = n(u?.thoughtsTokenCount);
  const total = n(u?.totalTokenCount);
  return {
    ...(cached !== undefined ? { tokensCached: cached } : {}),
    ...(thinking !== undefined ? { tokensThinking: thinking } : {}),
    ...(total !== undefined ? { tokensTotal: total } : {}),
  };
}
