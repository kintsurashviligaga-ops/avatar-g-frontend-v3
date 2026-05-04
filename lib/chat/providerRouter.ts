/**
 * lib/chat/providerRouter.ts
 * ==========================
 * Routes requests to the correct backend provider:
 *   - text-llm  → chatEngine (OpenAI GPT-4o / GPT-4.1)
 *   - replicate → internal Replicate API routes
 *
 * Returns a normalized ChatResponse in both cases.
 */

import { execute, type ChatEngineRequest } from '@/lib/ai/chatEngine';
import { detectIntent, intentToReplicateService, type DetectedIntent, type IntentCategory } from './intentDetector';
import { validateInput, buildModelInput, type GenerateInput } from '@/lib/replicate/schemas';
import { resolveModel } from '@/lib/replicate/models';
import { createPrediction } from '@/lib/replicate/client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  message: string;
  serviceContext: string;
  agentId: string;
  userId: string;
  sessionId: string;
  locale: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  selectedOptions?: Record<string, string>;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatResponse {
  success: boolean;
  intent: IntentCategory;
  responseType: 'text' | 'image' | 'video' | 'audio' | 'analysis' | 'action_suggestions';
  message: string;
  assetUrl?: string | null;
  assetType?: string;
  predictionId?: string;
  predictionStatus?: string;
  metadata: {
    provider: string;
    model?: string;
    agentId?: string;
    tokensIn?: number;
    tokensOut?: number;
    durationMs?: number;
    confidence?: number;
    [key: string]: unknown;
  };
}

// ─── Agent selection ─────────────────────────────────────────────────────────

const CONTEXT_TO_AGENT: Record<string, string> = {
  global: 'main-assistant',
  music: 'audio-agent',
  video: 'video-agent',
  avatar: 'image-agent',
  image: 'image-agent',
  photo: 'image-agent',
  voice: 'audio-agent',
  business: 'business-agent',
  'visual-ai': 'research-agent',
  'visual-intel': 'research-agent',
  workflow: 'automation-agent',
  shop: 'marketplace-agent',
  text: 'content-agent',
  media: 'social-agent',
  prompt: 'main-assistant',
};

// ─── Main orchestrate function ───────────────────────────────────────────────

export async function orchestrate(
  input: OrchestratorInput,
  _baseUrl?: string,
): Promise<ChatResponse> {
  // 1. Detect intent
  const detected = detectIntent(input.message, input.serviceContext);

  // 2. Route to the right provider
  if (detected.provider === 'replicate') {
    return handleReplicateIntent(input, detected);
  }

  return handleTextIntent(input, detected);
}

// ─── Text LLM path ──────────────────────────────────────────────────────────

async function handleTextIntent(
  input: OrchestratorInput,
  detected: DetectedIntent,
): Promise<ChatResponse> {
  const agentId = input.agentId || CONTEXT_TO_AGENT[input.serviceContext] || 'main-assistant';

  const engineReq: ChatEngineRequest = {
    agentId,
    userId: input.userId,
    sessionId: input.sessionId,
    channel: 'web',
    messages: [
      ...input.history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user' as const, content: input.message },
    ],
  };

  const result = await execute(engineReq);

  return {
    success: true,
    intent: detected.intent,
    responseType: 'text',
    message: result.text,
    metadata: {
      provider: 'openai',
      model: result.model,
      agentId: result.agentId,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      durationMs: result.durationMs,
      confidence: detected.confidence,
    },
  };
}

// ─── Replicate generation path (direct, no HTTP self-fetch) ──────────────────

async function handleReplicateIntent(
  input: OrchestratorInput,
  detected: DetectedIntent,
): Promise<ChatResponse> {
  const replicateService = intentToReplicateService(detected.intent);
  if (!replicateService) {
    // Fallback to text if intent mapping fails
    return handleTextIntent(input, { ...detected, provider: 'text-llm' });
  }

  const opts = input.selectedOptions || {};

  // Build and validate the generation input
  const raw: Record<string, unknown> = {
    service: replicateService,
    prompt: input.message,
    quality: opts.quality?.toLowerCase() || 'high',
    variant: opts.variant?.toLowerCase() || opts.model?.toLowerCase(),
    style: opts.style?.toLowerCase(),
    aspectRatio: opts.ratio || opts.aspectRatio || opts.aspectratio,
    ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
  };

  const validation = validateInput(raw);
  if (!validation.valid || !validation.sanitized) {
    return {
      success: false,
      intent: detected.intent,
      responseType: 'text',
      message: validation.error || 'Invalid input for generation.',
      metadata: { provider: 'replicate', confidence: detected.confidence },
    };
  }

  const sanitized: GenerateInput = validation.sanitized;

  // Resolve the model and build its specific input
  const model = resolveModel(sanitized.service, sanitized.variant);
  const modelInput = buildModelInput(sanitized);

  try {
    const prediction = await createPrediction(model.id, modelInput);

    const responseType = mapResponseType(detected.intent);

    // If output is immediately available (sync models like blip)
    if (prediction.output) {
      const outputUrl = extractOutputUrl(prediction.output);
      const outputText =
        typeof prediction.output === 'string'
          ? prediction.output
          : Array.isArray(prediction.output) &&
            typeof prediction.output[0] === 'string' &&
            !String(prediction.output[0]).startsWith('http')
          ? String(prediction.output[0])
          : undefined;

      return {
        success: true,
        intent: detected.intent,
        responseType,
        message: outputText || readyMessage(detected.intent),
        assetUrl: outputUrl,
        assetType: replicateService,
        predictionId: prediction.id,
        predictionStatus: 'succeeded',
        metadata: {
          provider: 'replicate',
          model: model.label,
          confidence: detected.confidence,
        },
      };
    }

    // Async prediction — return predictionId for polling
    return {
      success: true,
      intent: detected.intent,
      responseType,
      message: startedMessage(detected.intent),
      predictionId: prediction.id,
      predictionStatus: prediction.status || 'starting',
      assetType: replicateService,
      metadata: {
        provider: 'replicate',
        model: model.label,
        outputType: model.outputType,
        confidence: detected.confidence,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Replicate generation failed';
    return {
      success: false,
      intent: detected.intent,
      responseType: 'text',
      message: errorMsg,
      metadata: { provider: 'replicate', confidence: detected.confidence },
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapResponseType(intent: IntentCategory): ChatResponse['responseType'] {
  switch (intent) {
    case 'avatar_generation':
    case 'image_generation':
    case 'photo_edit':
      return 'image';
    case 'video_generation':
      return 'video';
    case 'music_generation':
      return 'audio';
    case 'visual_analysis':
      return 'analysis';
    default:
      return 'text';
  }
}

function extractOutputUrl(output: unknown): string | null {
  if (typeof output === 'string' && output.startsWith('http')) return output;
  if (Array.isArray(output)) {
    const first = output[0];
    if (typeof first === 'string' && first.startsWith('http')) return first;
  }
  return null;
}

function startedMessage(intent: IntentCategory): string {
  switch (intent) {
    case 'avatar_generation': return 'Generating your avatar…';
    case 'image_generation': return 'Creating your image…';
    case 'photo_edit': return 'Enhancing your photo…';
    case 'video_generation': return 'Rendering your video…';
    case 'music_generation': return 'Composing your music…';
    case 'visual_analysis': return 'Analyzing the image…';
    default: return 'Processing…';
  }
}

function readyMessage(intent: IntentCategory): string {
  switch (intent) {
    case 'avatar_generation': return 'Your avatar is ready.';
    case 'image_generation': return 'Your image is ready.';
    case 'photo_edit': return 'Your enhanced photo is ready.';
    case 'video_generation': return 'Your video is ready.';
    case 'music_generation': return 'Your soundtrack is ready.';
    case 'visual_analysis': return 'Analysis complete.';
    default: return 'Done.';
  }
}
