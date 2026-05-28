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
import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import { getNanoBananaCreditCost, resolveNanoBananaEndpoint } from '@/lib/nanobanana/endpoints';
import { ServiceManager, type ServiceManagerResponse } from './ServiceManager';
import { getUdioGenerationStatus, startUdioGeneration } from '@/lib/udio/client';
import { buildInteriorDesignBrief } from '@/lib/interior/smart-intake';
import { generateWorldLabsInterior } from '@/lib/worldlabs/client';
import { buildIterativePrompt } from './iteration-store';
import { generateWithGemini } from '@/lib/gemini/client';
import { getGeminiSystemPrompt, type GeminiServiceContext } from '@/lib/gemini/prompts';
import { extractMediaArtifact, type MediaKind } from '@/lib/media/extractArtifact';
import { isMusicVideoComposite, handleMusicVideoComposite } from './musicVideoComposite';

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
  music: 'music-agent',
  video: 'video-agent',
  avatar: 'avatar-agent',
  image: 'image-agent',
  photo: 'thumbnail-agent',
  voice: 'music-agent',
  business: 'business-agent',
  'visual-ai': 'qa-agent',
  'visual-intel': 'qa-agent',
  workflow: 'workflow-agent',
  shop: 'store-agent',
  text: 'content-agent',
  media: 'social-agent',
  prompt: 'main-assistant',
  'content-writer': 'main-assistant',
  podcast: 'main-assistant',
  character: 'main-assistant',
  event: 'main-assistant',
  tourism: 'main-assistant',
  'voice-studio': 'audio-agent',
};

const DETERMINISTIC_INTENTS = new Set<IntentCategory>([
  'avatar_generation',
  'image_generation',
  'photo_edit',
  'video_generation',
]);

const serviceManager = new ServiceManager();
const UDIO_PREDICTION_PREFIX = 'udio:';

// ─── Gemini multimodal handler ────────────────────────────────────────────────

const GEMINI_MULTIMODAL_SERVICES = new Set(['image', 'avatar', 'video', 'photo']);

function toGeminiServiceContext(serviceContext: string): GeminiServiceContext {
  const normalized = String(serviceContext || '').toLowerCase();
  switch (normalized) {
    case 'interior':
    case 'interior-design':
      return 'interior';
    case 'image':
    case 'photo':
      return 'image';
    case 'video':
      return 'video';
    case 'music':
      return 'music';
    case 'voice':
      return 'voice';
    case 'avatar':
      return 'avatar';
    case 'business':
      return 'business';
    case 'game':
      return 'game';
    case 'text':
    case 'prompt':
    case 'content':
      return 'text';
    default:
      return 'general';
  }
}

async function handleGeminiMultimodal(input: OrchestratorInput): Promise<ChatResponse | null> {
  const hasImage = !!input.imageUrl || !!input.metadata?.imageBase64;
  const metadataAttachments = Array.isArray(input.metadata?.attachments)
    ? input.metadata.attachments as Array<{ type?: string; mimeType?: string; data?: string }>
    : [];
  const supportedMetadataAttachments = metadataAttachments.filter((item) => {
    const type = String(item.type || '').toLowerCase();
    return type === 'image' || type === 'pdf' || type === 'video';
  });
  const hasExtraAttachments = supportedMetadataAttachments.length > 0;
  if ((!hasImage && !hasExtraAttachments) || !process.env.GEMINI_API_KEY) return null;

  const imageBase64 = input.metadata?.imageBase64 as string | undefined;
  const mimeType = (input.metadata?.mimeType as string) ?? 'image/jpeg';
  const ctx = toGeminiServiceContext(input.serviceContext);
  const systemPrompt = getGeminiSystemPrompt(ctx, input.locale ?? 'ka');

  const startMs = Date.now();
  const response = await generateWithGemini({
    prompt: input.message,
    systemPrompt,
    tier: 'pro',
    attachments: [
      ...(imageBase64 ? [{ type: 'image' as const, mimeType, data: imageBase64 }] : []),
      ...supportedMetadataAttachments.map((item) => ({
        type: String(item.type).toLowerCase() as 'image' | 'pdf' | 'video',
        mimeType: String(item.mimeType || 'application/octet-stream'),
        data: String(item.data || ''),
      })),
    ],
    history: input.history?.map((h) => ({
      role: h.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: h.content }],
    })),
  });

  return {
    success: true,
    intent: 'analysis' as IntentCategory,
    responseType: 'analysis',
    message: response.text,
    metadata: {
      provider: 'gemini',
      model: response.model,
      durationMs: Date.now() - startMs,
      attachment_count: (imageBase64 ? 1 : 0) + (hasExtraAttachments ? supportedMetadataAttachments.length : 0),
    },
  };
}

// ─── Main orchestrate function ───────────────────────────────────────────────

export async function orchestrate(
  input: OrchestratorInput,
  _baseUrl?: string,
): Promise<ChatResponse> {
  if (shouldRouteInteriorToWorldLabs(input)) {
    return handleInteriorIntent(input);
  }

  // Gemini multimodal path for image-bearing requests on supported services
  if (GEMINI_MULTIMODAL_SERVICES.has(input.serviceContext)) {
    const geminiResponse = await handleGeminiMultimodal(input);
    if (geminiResponse) return geminiResponse;
  }

  // Composite check runs BEFORE single-intent detection. Music-video prompts
  // would otherwise be matched by music_generation OR video_generation
  // (whichever pattern hits the higher confidence weight) and only ONE
  // worker would fire — see lib/chat/musicVideoComposite.ts for the trace.
  if (isMusicVideoComposite(input.message)) {
    return handleMusicVideoComposite(input);
  }

  // 1. Detect intent
  const detected = detectIntent(input.message, input.serviceContext);

  if (detected.intent === 'music_generation') {
    return handleMusicIntent(input, detected);
  }

  if (DETERMINISTIC_INTENTS.has(detected.intent)) {
    return handleDeterministicIntent(input, detected);
  }

  // 2. Route to the right provider
  if (detected.provider === 'replicate') {
    return handleReplicateIntent(input, detected);
  }

  return handleTextIntent(input, detected);
}

export async function pollOrchestrationTask(predictionId: string, sessionId?: string): Promise<ChatResponse> {
  const udioWorkId = extractUdioWorkId(predictionId);
  if (udioWorkId) {
    return pollUdioTask(udioWorkId, predictionId);
  }

  const response = await serviceManager.poll(predictionId, sessionId);
  return toChatResponse(response, 'text_chat');
}

function shouldRouteInteriorToWorldLabs(input: OrchestratorInput): boolean {
  const context = String(input.serviceContext || '').toLowerCase();
  if (context === 'interior' || context === 'interior-design') {
    return true;
  }

  const provider = String(
    input.selectedOptions?.provider
      || input.selectedOptions?.model_provider
      || input.selectedOptions?.interior_provider
      || '',
  ).toLowerCase();
  if (provider === 'worldlabs' || provider === 'marble') {
    return true;
  }

  return /\b(interior|room|space|marble|world\s*labs|3d\s*interior)\b/i.test(input.message);
}

function ensureImageDataUrl(raw: string, mimeType: string): string {
  const prefix = `data:${mimeType};base64,`;
  return raw.startsWith('data:') ? raw : `${prefix}${raw}`;
}

async function loadImageAsDataUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  if (!/^https?:\/\//i.test(imageUrl)) {
    throw new Error('Interior generation requires a valid image URL or data URL.');
  }

  const response = await fetch(imageUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to load reference image (${response.status})`);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const bytes = Buffer.from(await response.arrayBuffer());
  return ensureImageDataUrl(bytes.toString('base64'), contentType);
}

function runOutputValidation(input: {
  requestedPrompt: string;
  selectedOptions?: Record<string, string>;
  spatialLink?: string | null;
  glbUrl?: string | null;
}): { status: 'pass' | 'review' | 'fail'; note: string } {
  if (!input.spatialLink && !input.glbUrl) {
    return { status: 'fail', note: 'Generated output missing both viewer and model links.' };
  }

  const values = Object.values(input.selectedOptions || {})
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 2)
    .slice(0, 8);
  const prompt = input.requestedPrompt.toLowerCase();
  const missing = values.filter((value) => !prompt.includes(value));

  if (missing.length > 0) {
    return {
      status: 'review',
      note: `Output generated, but prompt alignment needs review (${missing.join(', ')}).`,
    };
  }

  return { status: 'pass', note: 'Output passed alignment checks.' };
}

async function handleInteriorIntent(input: OrchestratorInput): Promise<ChatResponse> {
  const iterative = buildIterativePrompt({
    sessionId: input.sessionId,
    serviceContext: 'interior',
    message: input.message,
    selectedOptions: input.selectedOptions,
    imageUrl: input.imageUrl,
  });

  const selectedOptions = input.selectedOptions || {};
  const designBrief = buildInteriorDesignBrief({
    userPrompt: iterative.prompt,
    answers: {
      primaryGoal: String(selectedOptions.primary_goal || 'full_renovation'),
      colorPalette: String(selectedOptions.color_palette || 'neutral_scandi'),
      materials: String(selectedOptions.materials || 'natural_wood'),
      lightingVibe: String(selectedOptions.lighting_vibe || 'natural_sunlight'),
    },
  });

  const imageUrl = input.imageUrl || selectedOptions.image_url || selectedOptions.reference_image;
  if (!imageUrl) {
    return {
      success: false,
      intent: 'image_generation',
      responseType: 'action_suggestions',
      message: 'Upload a clear room photo first, then I will generate the 3D interior world.',
      metadata: {
        provider: 'worldlabs',
        model: 'marble',
        validation: 'blocked_missing_image',
        iteration: iterative.iteration,
      },
    };
  }

  try {
    const imageDataUrl = await loadImageAsDataUrl(imageUrl);
    const world = await generateWorldLabsInterior({
      imageDataUrl,
      prompt: designBrief,
      filename: 'interior-reference.jpg',
    });

    const validation = runOutputValidation({
      requestedPrompt: designBrief,
      selectedOptions,
      spatialLink: world.spatialLink,
      glbUrl: world.glbUrl,
    });

    if (validation.status === 'fail') {
      return {
        success: false,
        intent: 'image_generation',
        responseType: 'text',
        message: `Output validation failed: ${validation.note} Please retry with a clearer photo or refined brief.`,
        metadata: {
          provider: 'worldlabs',
          model: 'marble',
          validation: validation.status,
          iteration: iterative.iteration,
        },
      };
    }

    const completionNote = validation.status === 'review'
      ? `${validation.note} You can send follow-up refinements and I will iterate.`
      : 'Interior world ready. You can send follow-up refinements and I will regenerate.';

    return {
      success: true,
      intent: 'image_generation',
      responseType: 'image',
      message: completionNote,
      assetUrl: world.previewImageUrl || world.spatialLink,
      assetType: '3d-world',
      metadata: {
        provider: 'worldlabs',
        model: 'marble',
        spatial_link: world.spatialLink,
        model_url: world.glbUrl,
        credits_remaining: world.creditsRemaining,
        output_validation: validation.status,
        output_validation_note: validation.note,
        iteration: iterative.iteration,
      },
    };
  } catch (error) {
    return {
      success: false,
      intent: 'image_generation',
      responseType: 'text',
      message: error instanceof Error ? error.message : 'World Labs interior generation failed.',
      metadata: {
        provider: 'worldlabs',
        model: 'marble',
        iteration: iterative.iteration,
      },
    };
  }
}

async function handleMusicIntent(
  input: OrchestratorInput,
  detected: DetectedIntent,
): Promise<ChatResponse> {
  const iterative = buildIterativePrompt({
    sessionId: input.sessionId,
    serviceContext: input.serviceContext || 'music',
    message: input.message,
    selectedOptions: input.selectedOptions,
    imageUrl: input.imageUrl,
  });
  const opts = input.selectedOptions || {};
  const provider = String(
    opts.provider
      || opts.music_provider
      || opts.musicProvider
      || (process.env.UDIO_API_KEY?.trim() ? 'udio' : 'replicate'),
  ).toLowerCase();

  if (provider === 'replicate') {
    return handleReplicateIntent(input, detected);
  }

  const lyricsMode = String(opts.lyrics_mode || opts.lyricsMode || '').toLowerCase();
  const styleTags = parseOptionList(opts.style_tags || opts.styleTags || opts.tags);

  try {
    const started = await startUdioGeneration({
      prompt: iterative.prompt,
      lyrics: opts.lyrics,
      style: opts.style,
      title: opts.title,
      genre: opts.genre,
      mood: opts.mood,
      styleTags,
      model: opts.model || opts.variant,
      makeInstrumental: parseBooleanOption(opts.make_instrumental || opts.instrumental) || lyricsMode === 'instrumental',
      callbackUrl: typeof input.metadata?.callback_url === 'string'
        ? input.metadata.callback_url
        : typeof input.metadata?.callbackUrl === 'string'
          ? input.metadata.callbackUrl
          : undefined,
    });

    const predictionId = toUdioPredictionId(started.workId);

    return {
      success: true,
      intent: detected.intent,
      responseType: 'audio',
      message: startedMessage(detected.intent),
      predictionId,
      predictionStatus: 'processing',
      assetType: 'audio',
      metadata: {
        provider: 'udio',
        model: started.model,
        workId: started.workId,
        confidence: detected.confidence,
        iteration: iterative.iteration,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Udio generation failed';

    return {
      success: false,
      intent: detected.intent,
      responseType: 'text',
      message: errorMsg,
      metadata: {
        provider: 'udio',
        confidence: detected.confidence,
        iteration: iterative.iteration,
      },
    };
  }
}

async function pollUdioTask(workId: string, predictionId: string): Promise<ChatResponse> {
  const status = await getUdioGenerationStatus(workId);

  if (status.status === 'failed') {
    return {
      success: false,
      intent: 'music_generation',
      responseType: 'text',
      message: status.message || 'Music generation failed.',
      predictionId,
      predictionStatus: 'failed',
      metadata: {
        provider: 'udio',
        workId,
      },
    };
  }

  if (status.status === 'succeeded') {
    return {
      success: true,
      intent: 'music_generation',
      responseType: 'audio',
      message: readyMessage('music_generation'),
      assetUrl: status.audioUrl,
      assetType: 'audio',
      predictionId,
      predictionStatus: 'succeeded',
      metadata: {
        provider: 'udio',
        workId,
        imageUrl: status.imageUrl,
        rawStatus: status.rawStatus,
      },
    };
  }

  return {
    success: true,
    intent: 'music_generation',
    responseType: 'audio',
    message: status.message || startedMessage('music_generation'),
    predictionId,
    predictionStatus: 'processing',
    metadata: {
      provider: 'udio',
      workId,
      rawStatus: status.rawStatus,
    },
  };
}

async function handleDeterministicIntent(
  input: OrchestratorInput,
  detected: DetectedIntent,
): Promise<ChatResponse> {
  const iterative = buildIterativePrompt({
    sessionId: input.sessionId,
    serviceContext: input.serviceContext || detected.intent,
    message: input.message,
    selectedOptions: input.selectedOptions,
    imageUrl: input.imageUrl,
  });

  const response = await serviceManager.execute({
    sessionId: input.sessionId,
    serviceContext: input.serviceContext,
    intent: detected.intent,
    userPrompt: iterative.prompt,
    selectedOptions: input.selectedOptions,
    imageUrl: input.imageUrl,
    locale: input.locale,
    confidence: detected.confidence,
  });

  const mapped = toChatResponse(response, detected.intent);
  mapped.metadata.iteration = iterative.iteration;
  return mapped;
}

function toChatResponse(
  response: ServiceManagerResponse,
  intent: IntentCategory,
): ChatResponse {
  return {
    success: response.success,
    intent,
    responseType: response.responseType,
    message: response.message,
    assetUrl: response.assetUrl,
    assetType: response.assetType,
    predictionId: response.predictionId,
    predictionStatus: response.predictionStatus,
    metadata: {
      ...response.metadata,
      provider: response.provider,
    },
  };
}

// ─── Text LLM path ──────────────────────────────────────────────────────────

async function handleTextIntent(
  input: OrchestratorInput,
  detected: DetectedIntent,
): Promise<ChatResponse> {
  if (process.env.GEMINI_API_KEY) {
    try {
      const ctx = toGeminiServiceContext(input.serviceContext);
      const systemPrompt = getGeminiSystemPrompt(ctx, input.locale || 'ka');
      const prefersPro = input.message.length > 1200 || input.history.length > 12 || ctx === 'interior' || ctx === 'business';
      const gemini = await generateWithGemini({
        prompt: input.message,
        systemPrompt,
        tier: prefersPro ? 'pro' : 'flash',
        history: input.history?.map((h) => ({
          role: h.role === 'assistant' ? ('model' as const) : ('user' as const),
          parts: [{ text: h.content }],
        })),
        temperature: 0.6,
      });

      return {
        success: true,
        intent: detected.intent,
        responseType: 'text',
        message: gemini.text,
        metadata: {
          provider: 'gemini',
          model: gemini.model,
          tokensIn: gemini.tokensIn,
          tokensOut: gemini.tokensOut,
          confidence: detected.confidence,
        },
      };
    } catch (error) {
      // Fall back to existing chat engine path.
      console.warn('[providerRouter] Gemini text path failed, falling back to chatEngine:', error);
    }
  }

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
  const selectedProvider = String(
    opts.provider || opts.image_provider || opts.imageProvider || '',
  ).toLowerCase();

  const canUseNanoBanana = selectedProvider === 'nanobanana'
    && (replicateService === 'image' || input.serviceContext === 'interior');

  if (canUseNanoBanana) {
    return handleNanoBananaIntent(input, detected, opts);
  }

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
      const artifact = extractMediaArtifact(prediction.output, intentToMediaKind(detected.intent));

      return {
        success: true,
        intent: detected.intent,
        responseType,
        message: artifact.text || readyMessage(detected.intent),
        assetUrl: artifact.url,
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

async function handleNanoBananaIntent(
  input: OrchestratorInput,
  detected: DetectedIntent,
  opts: Record<string, string>,
): Promise<ChatResponse> {
  const endpoint = resolveNanoBananaEndpoint(
    opts.nanobanana_endpoint || opts.nanobananaEndpoint || opts.endpoint,
  );

  try {
    const result = await generateNanoBananaImage({
      prompt: input.message,
      endpoint,
      aspectRatio: opts.ratio || opts.aspectRatio || opts.aspectratio,
      style: opts.style || opts.imgStyle || opts.imgstyle,
      referenceImageDataUrl: input.imageUrl,
      service: input.serviceContext || 'image',
    });

    if (result.url) {
      return {
        success: true,
        intent: detected.intent,
        responseType: 'image',
        message: readyMessage(detected.intent),
        assetUrl: result.url,
        assetType: 'image',
        metadata: {
          provider: 'nanobanana',
          model: endpoint,
          creditCost: getNanoBananaCreditCost(endpoint),
          confidence: detected.confidence,
        },
      };
    }

    return {
      success: true,
      intent: detected.intent,
      responseType: 'text',
      message: result.text || 'Task details ready.',
      metadata: {
        provider: 'nanobanana',
        model: endpoint,
        creditCost: getNanoBananaCreditCost(endpoint),
        confidence: detected.confidence,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'NanoBanana generation failed';
    return {
      success: false,
      intent: detected.intent,
      responseType: 'text',
      message: errorMsg,
      metadata: {
        provider: 'nanobanana',
        model: endpoint,
        confidence: detected.confidence,
      },
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

function toUdioPredictionId(workId: string): string {
  return `${UDIO_PREDICTION_PREFIX}${workId}`;
}

function extractUdioWorkId(predictionId: string): string | null {
  if (!predictionId.startsWith(UDIO_PREDICTION_PREFIX)) {
    return null;
  }

  const workId = predictionId.slice(UDIO_PREDICTION_PREFIX.length).trim();
  return workId || null;
}

function parseOptionList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length > 0 ? items : undefined;
}

function parseBooleanOption(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function intentToMediaKind(intent: IntentCategory): MediaKind {
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
