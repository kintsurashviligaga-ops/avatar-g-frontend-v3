import { createHash } from 'crypto';
import { z } from 'zod';

import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import { getNanoBananaCreditCost, resolveNanoBananaEndpoint } from '@/lib/nanobanana/endpoints';
import { createPrediction, pollPrediction } from '@/lib/replicate/client';
import { resolveModel } from '@/lib/replicate/models';
import { buildModelInput, validateInput } from '@/lib/replicate/schemas';
import { normalizeOutput } from '@/lib/replicate/normalizer';
import type { IntentCategory } from '@/lib/chat/intentDetector';

export type DeterministicProvider = 'nanobanana' | 'replicate' | 'ltx' | 'heygen';
export type DeterministicOperation = 'text-to-image' | 'video-avatar';

type AsyncProvider = 'replicate' | 'ltx' | 'heygen';
type ResponseType = 'text' | 'image' | 'video' | 'audio' | 'analysis' | 'action_suggestions';

const LTX_BASE_URL = 'https://api.ltx.video';
const HEYGEN_BASE_URL = 'https://api.heygen.com';
const TASK_REF_VERSION = 1;

const LTX_SUPPORTED_RESOLUTIONS: Record<'ltx-2-3-fast' | 'ltx-2-3-pro', readonly string[]> = {
  'ltx-2-3-fast': ['1920x1080', '1080x1920', '2560x1440', '3840x2160'],
  'ltx-2-3-pro': ['1920x1080', '1080x1920', '2560x1440', '3840x2160'],
};
const LTX_ALLOWED_FPS = [24, 25, 30] as const;

const ltxRequestSchema = z.object({
  prompt: z.string().min(1).max(1500),
  model: z.enum(['ltx-2-3-fast', 'ltx-2-3-pro']).default('ltx-2-3-fast'),
  resolution: z
    .enum(['1920x1080', '1080x1920', '2560x1440', '3840x2160'])
    .default('1920x1080'),
  duration: z.number().int().min(2).max(60).default(6),
  fps: z
    .number()
    .int()
    .refine((v) => (LTX_ALLOWED_FPS as readonly number[]).includes(v), {
      message: 'fps must be one of 24, 25, 30',
    })
    .default(24),
});

const heygenRequestSchema = z.object({
  script: z.string().min(1).max(1500),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
  voiceGender: z.enum(['female', 'male']).default('female'),
  voiceLanguage: z.string().min(2).max(8).default('en'),
});

type EncodedTaskRef = {
  v: number;
  provider: AsyncProvider;
  providerTaskId: string;
  sessionId: string;
  serviceContext: string;
  intent: IntentCategory;
  operation: DeterministicOperation;
  responseType: Exclude<ResponseType, 'action_suggestions'>;
  promptHash: string;
  createdAt: number;
};

export interface ServiceManagerRequest {
  sessionId: string;
  serviceContext: string;
  intent: IntentCategory;
  userPrompt: string;
  selectedOptions?: Record<string, string>;
  imageUrl?: string;
  locale?: string;
  confidence?: number;
}

export interface ServiceManagerResponse {
  success: boolean;
  provider: DeterministicProvider;
  operation: DeterministicOperation;
  responseType: ResponseType;
  message: string;
  assetUrl?: string | null;
  assetType?: string;
  predictionId?: string;
  predictionStatus?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'error';
  metadata: {
    provider: DeterministicProvider;
    model?: string;
    operation: DeterministicOperation;
    outputType?: string;
    endpoint?: string;
    creditCost?: number;
    sessionId: string;
    taskRef?: string;
    providerTaskId?: string;
    promptHash: string;
    confidence?: number;
    [key: string]: unknown;
  };
}

const HEYGEN_VOICE_MAP: Record<'female' | 'male', Record<string, string>> = {
  female: {
    en: '1bd001e7e50f421d891986aad5158bc8',
    ru: 'a50d990a4bd14da4a49d0f4d10310a6b',
    ka: '1bd001e7e50f421d891986aad5158bc8',
  },
  male: {
    en: '2d5b0e6cf36f460aa7fc47e3eee4ba54',
    ru: 'a50d990a4bd14da4a49d0f4d10310a6b',
    ka: '2d5b0e6cf36f460aa7fc47e3eee4ba54',
  },
};

const TERMINAL_LTX_STATUS = new Set(['completed', 'succeeded', 'success', 'failed', 'error', 'canceled']);
const FAILED_LTX_STATUS = new Set(['failed', 'error', 'canceled']);

export class ServiceManager {
  async execute(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const operation = this.resolveOperation(request);
    if (operation === 'text-to-image') {
      return this.runTextToImage(request);
    }

    return this.runVideoAvatar(request);
  }

  async poll(taskRefOrPredictionId: string, sessionId?: string): Promise<ServiceManagerResponse> {
    const decoded = this.decodeTaskRef(taskRefOrPredictionId);

    if (!decoded) {
      return this.pollLegacyReplicate(taskRefOrPredictionId, sessionId || 'legacy');
    }

    if (!sessionId || decoded.sessionId !== sessionId) {
      return {
        success: false,
        provider: decoded.provider,
        operation: decoded.operation,
        responseType: decoded.responseType,
        message: 'Session mismatch. Refusing to mix output with a different session.',
        predictionId: taskRefOrPredictionId,
        predictionStatus: 'error',
        metadata: {
          provider: decoded.provider,
          operation: decoded.operation,
          sessionId: decoded.sessionId,
          taskRef: taskRefOrPredictionId,
          providerTaskId: decoded.providerTaskId,
          promptHash: decoded.promptHash,
        },
      };
    }

    if (decoded.provider === 'replicate') {
      return this.pollReplicateTask(decoded, taskRefOrPredictionId);
    }

    if (decoded.provider === 'heygen') {
      return this.pollHeygenTask(decoded, taskRefOrPredictionId);
    }

    return this.pollLtxTask(decoded, taskRefOrPredictionId);
  }

  private async runTextToImage(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const provider = this.resolveImageProvider(request.selectedOptions);
    if (provider === 'replicate') {
      return this.runReplicateImage(request);
    }

    return this.runNanoBananaImage(request);
  }

  private async runVideoAvatar(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const provider = this.resolveVideoProvider(request);
    if (provider === 'heygen') {
      return this.runHeygenAvatarVideo(request);
    }

    return this.runLtxVideo(request);
  }

  private async runNanoBananaImage(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const options = request.selectedOptions || {};
    const promptHash = this.hashPrompt(request.userPrompt);

    const requestedEndpoint = resolveNanoBananaEndpoint(
      this.getOption(options, ['nanobanana_endpoint', 'nanobananaEndpoint', 'endpoint']),
    );
    const highQualityRequested = this.isHighQualityRequest(options);
    const endpoint = highQualityRequested ? 'pro-4k' : requestedEndpoint;

    const aspectRatio = this.normalizeAspectRatio(this.getOption(options, ['aspect', 'aspectRatio', 'ratio', 'img-size']));
    const style = this.getOption(options, ['style', 'img-style', 'imgStyle']) || undefined;

    const result = await generateNanoBananaImage({
      // Strict pass-through: do not rewrite user prompt for image generation.
      prompt: request.userPrompt,
      endpoint,
      aspectRatio,
      style,
      referenceImageDataUrl: request.imageUrl,
      service: request.serviceContext,
    });

    if (result.url) {
      return {
        success: true,
        provider: 'nanobanana',
        operation: 'text-to-image',
        responseType: 'image',
        message: 'Image generation completed successfully.',
        assetUrl: result.url,
        assetType: 'image',
        predictionStatus: 'succeeded',
        metadata: {
          provider: 'nanobanana',
          operation: 'text-to-image',
          sessionId: request.sessionId,
          endpoint,
          creditCost: getNanoBananaCreditCost(endpoint),
          outputType: 'image',
          promptHash,
          confidence: request.confidence,
          raw: result.raw,
        },
      };
    }

    return {
      success: true,
      provider: 'nanobanana',
      operation: 'text-to-image',
      responseType: 'text',
      message: result.text || 'NanoBanana task completed without media URL.',
      predictionStatus: 'succeeded',
      metadata: {
        provider: 'nanobanana',
        operation: 'text-to-image',
        sessionId: request.sessionId,
        endpoint,
        creditCost: getNanoBananaCreditCost(endpoint),
        outputType: 'text',
        promptHash,
        confidence: request.confidence,
        raw: result.raw,
      },
    };
  }

  private async runReplicateImage(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const options = request.selectedOptions || {};
    const promptHash = this.hashPrompt(request.userPrompt);
    const aspectRatio = this.normalizeAspectRatio(this.getOption(options, ['aspect', 'aspectRatio', 'ratio', 'img-size']));
    const style = this.getOption(options, ['style', 'img-style', 'imgStyle']) || undefined;
    const quality = this.mapReplicateQuality(this.getOption(options, ['quality', 'img-quality', 'imgQuality']));

    const validation = validateInput({
      service: 'image',
      prompt: request.userPrompt,
      variant: 'fast',
      quality,
      aspectRatio,
      style,
      imageUrl: request.imageUrl,
    });

    if (!validation.valid || !validation.sanitized) {
      throw new Error(validation.error || 'Invalid text-to-image payload for Replicate');
    }

    validation.sanitized.prompt = request.userPrompt;

    const model = resolveModel('image', validation.sanitized.variant || 'fast');
    const modelInput = buildModelInput(validation.sanitized);
    const prediction = await createPrediction(model.id, modelInput);

    if (prediction.status === 'succeeded') {
      const normalized = normalizeOutput(
        'image',
        model.label,
        model.outputType,
        prediction.id,
        prediction.status,
        prediction.output,
        prediction.error,
        prediction.metrics as unknown as Record<string, unknown> | undefined,
      );

      if (normalized.url || normalized.text) {
        return {
          success: normalized.success,
          provider: 'replicate',
          operation: 'text-to-image',
          responseType: normalized.url ? 'image' : 'text',
          message: normalized.text || 'Image generation completed successfully.',
          assetUrl: normalized.url,
          assetType: normalized.url ? 'image' : undefined,
          predictionStatus: 'succeeded',
          metadata: {
            provider: 'replicate',
            model: model.label,
            operation: 'text-to-image',
            outputType: model.outputType,
            sessionId: request.sessionId,
            providerTaskId: prediction.id,
            promptHash,
            confidence: request.confidence,
            metrics: prediction.metrics,
          },
        };
      }
    }

    const taskRef = this.encodeTaskRef({
      provider: 'replicate',
      providerTaskId: prediction.id,
      sessionId: request.sessionId,
      serviceContext: request.serviceContext,
      intent: request.intent,
      operation: 'text-to-image',
      responseType: 'image',
      promptHash,
      createdAt: Date.now(),
    });

    return {
      success: true,
      provider: 'replicate',
      operation: 'text-to-image',
      responseType: 'image',
      message: 'Image generation started. Waiting for provider status.',
      predictionId: taskRef,
      predictionStatus: prediction.status === 'failed' ? 'failed' : 'processing',
      metadata: {
        provider: 'replicate',
        model: model.label,
        operation: 'text-to-image',
        outputType: model.outputType,
        sessionId: request.sessionId,
        taskRef,
        providerTaskId: prediction.id,
        promptHash,
        confidence: request.confidence,
      },
    };
  }

  private async runLtxVideo(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const apiKey = process.env.LTX_VIDEO_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('LTX_VIDEO_API_KEY is not configured');
    }

    const options = request.selectedOptions || {};
    const promptHash = this.hashPrompt(request.userPrompt);

    const aspectRatio = this.normalizeAspectRatio(this.getOption(options, ['aspect', 'aspectRatio', 'ratio'])) || '16:9';
    const requestedModel = this.getOption(options, ['model', 'videoModel']) === 'ltx-2-3-pro' ? 'ltx-2-3-pro' : 'ltx-2-3-fast';
    const parsed = ltxRequestSchema.parse({
      prompt: request.userPrompt,
      model: requestedModel,
      resolution: this.mapLtxResolution(this.getOption(options, ['resolution', 'size']), aspectRatio, requestedModel),
      duration: this.toNumber(this.getOption(options, ['duration', 'durationSec', 'seconds']), 6),
      fps: this.clampLtxFps(this.toNumber(this.getOption(options, ['fps']), 24)),
    });

    const response = await fetch(`${LTX_BASE_URL}/v1/text-to-video`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: parsed.prompt,
        model: parsed.model,
        resolution: parsed.resolution,
        duration: parsed.duration,
        fps: parsed.fps,
        generate_audio: false,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`LTX request failed (${response.status}): ${err || 'unknown error'}`);
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => ({}));
      const outputUrl = this.extractUrl(payload);
      const providerTaskId = this.extractTaskId(payload);

      if (outputUrl) {
        return {
          success: true,
          provider: 'ltx',
          operation: 'video-avatar',
          responseType: 'video',
          message: 'Video generation completed successfully.',
          assetUrl: outputUrl,
          assetType: 'video',
          predictionStatus: 'succeeded',
          metadata: {
            provider: 'ltx',
            model: parsed.model,
            operation: 'video-avatar',
            outputType: 'video',
            sessionId: request.sessionId,
            promptHash,
            confidence: request.confidence,
            raw: payload,
          },
        };
      }

      if (providerTaskId) {
        const taskRef = this.encodeTaskRef({
          provider: 'ltx',
          providerTaskId,
          sessionId: request.sessionId,
          serviceContext: request.serviceContext,
          intent: request.intent,
          operation: 'video-avatar',
          responseType: 'video',
          promptHash,
          createdAt: Date.now(),
        });

        return {
          success: true,
          provider: 'ltx',
          operation: 'video-avatar',
          responseType: 'video',
          message: this.extractText(payload) || 'LTX accepted request. Polling for completion.',
          predictionId: taskRef,
          predictionStatus: 'processing',
          metadata: {
            provider: 'ltx',
            model: parsed.model,
            operation: 'video-avatar',
            outputType: 'video',
            sessionId: request.sessionId,
            taskRef,
            providerTaskId,
            promptHash,
            confidence: request.confidence,
            raw: payload,
          },
        };
      }

      throw new Error(this.extractText(payload) || 'LTX returned no output URL or task ID');
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > 20 * 1024 * 1024) {
      throw new Error('LTX returned oversized video payload for inline transport');
    }

    const dataUrl = `data:${contentType || 'video/mp4'};base64,${bytes.toString('base64')}`;

    return {
      success: true,
      provider: 'ltx',
      operation: 'video-avatar',
      responseType: 'video',
      message: 'Video generation completed successfully.',
      assetUrl: dataUrl,
      assetType: 'video',
      predictionStatus: 'succeeded',
      metadata: {
        provider: 'ltx',
        model: parsed.model,
        operation: 'video-avatar',
        outputType: 'video',
        sessionId: request.sessionId,
        promptHash,
        confidence: request.confidence,
      },
    };
  }

  private async runHeygenAvatarVideo(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const apiKey = process.env.HEYGEN_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('HEYGEN_API_KEY is not configured');
    }

    const options = request.selectedOptions || {};
    const promptHash = this.hashPrompt(request.userPrompt);

    const parsed = heygenRequestSchema.parse({
      script: request.userPrompt,
      aspectRatio: this.normalizeHeygenAspect(this.getOption(options, ['aspect', 'aspectRatio', 'ratio'])),
      voiceGender: this.normalizeVoiceGender(this.getOption(options, ['voice_gender', 'voiceGender'])),
      voiceLanguage: this.getOption(options, ['voice_language', 'voiceLanguage']) || (request.locale || 'en'),
    });

    const voiceId = this.getOption(options, ['voice_id', 'voiceId'])
      || await this.getHeygenVoiceId(apiKey, parsed.voiceGender, parsed.voiceLanguage);

    const avatarId = this.getOption(options, ['avatar_id', 'avatarId']) || await this.getHeygenFirstAvatar(apiKey);
    const avatarStyle = this.normalizeHeygenAvatarStyle(this.getOption(options, ['avatar_style', 'avatarStyle', 'style']));
    const dimension = this.mapHeygenDimension(parsed.aspectRatio);

    const response = await fetch(`${HEYGEN_BASE_URL}/v2/video/generate`, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_inputs: [{
          character: {
            type: 'avatar',
            avatar_id: avatarId,
            avatar_style: avatarStyle,
          },
          voice: {
            type: 'text',
            input_text: parsed.script,
            voice_id: voiceId,
          },
        }],
        dimension,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`HeyGen video generation failed (${response.status}): ${err || 'unknown error'}`);
    }

    const payload = await response.json().catch(() => ({}));
    const providerTaskId = this.extractTaskId(payload);
    if (!providerTaskId) {
      throw new Error('HeyGen returned no video task ID');
    }

    const taskRef = this.encodeTaskRef({
      provider: 'heygen',
      providerTaskId,
      sessionId: request.sessionId,
      serviceContext: request.serviceContext,
      intent: request.intent,
      operation: 'video-avatar',
      responseType: 'video',
      promptHash,
      createdAt: Date.now(),
    });

    return {
      success: true,
      provider: 'heygen',
      operation: 'video-avatar',
      responseType: 'video',
      message: 'Avatar generation started. Waiting for HeyGen completion.',
      predictionId: taskRef,
      predictionStatus: 'processing',
      metadata: {
        provider: 'heygen',
        model: 'heygen-v2-video',
        operation: 'video-avatar',
        outputType: 'video',
        sessionId: request.sessionId,
        taskRef,
        providerTaskId,
        promptHash,
        confidence: request.confidence,
        raw: payload,
      },
    };
  }

  private async pollReplicateTask(decoded: EncodedTaskRef, taskRef: string): Promise<ServiceManagerResponse> {
    const prediction = await pollPrediction(decoded.providerTaskId);

    if (prediction.status === 'succeeded') {
      const normalized = normalizeOutput(
        decoded.responseType === 'video' ? 'video' : 'image',
        decoded.responseType === 'video' ? 'Replicate Video' : 'Replicate SDXL',
        decoded.responseType === 'video' ? 'video' : 'image',
        prediction.id,
        prediction.status,
        prediction.output,
        prediction.error,
        prediction.metrics as unknown as Record<string, unknown> | undefined,
      );

      if (!normalized.url && !normalized.text) {
        return {
          success: false,
          provider: 'replicate',
          operation: decoded.operation,
          responseType: decoded.responseType,
          message: 'Replicate completed without output URL.',
          predictionId: taskRef,
          predictionStatus: 'failed',
          metadata: {
            provider: 'replicate',
            operation: decoded.operation,
            sessionId: decoded.sessionId,
            taskRef,
            providerTaskId: decoded.providerTaskId,
            promptHash: decoded.promptHash,
          },
        };
      }

      return {
        success: true,
        provider: 'replicate',
        operation: decoded.operation,
        responseType: decoded.responseType,
        message: normalized.text || 'Generation completed successfully.',
        assetUrl: normalized.url,
        assetType: decoded.responseType,
        predictionId: taskRef,
        predictionStatus: 'succeeded',
        metadata: {
          provider: 'replicate',
          operation: decoded.operation,
          outputType: decoded.responseType,
          sessionId: decoded.sessionId,
          taskRef,
          providerTaskId: decoded.providerTaskId,
          promptHash: decoded.promptHash,
          metrics: prediction.metrics,
        },
      };
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      return {
        success: false,
        provider: 'replicate',
        operation: decoded.operation,
        responseType: decoded.responseType,
        message: prediction.error || 'Replicate generation failed.',
        predictionId: taskRef,
        predictionStatus: prediction.status,
        metadata: {
          provider: 'replicate',
          operation: decoded.operation,
          sessionId: decoded.sessionId,
          taskRef,
          providerTaskId: decoded.providerTaskId,
          promptHash: decoded.promptHash,
        },
      };
    }

    return {
      success: true,
      provider: 'replicate',
      operation: decoded.operation,
      responseType: decoded.responseType,
      message: 'Still processing…',
      predictionId: taskRef,
      predictionStatus: prediction.status,
      metadata: {
        provider: 'replicate',
        operation: decoded.operation,
        sessionId: decoded.sessionId,
        taskRef,
        providerTaskId: decoded.providerTaskId,
        promptHash: decoded.promptHash,
      },
    };
  }

  private async pollHeygenTask(decoded: EncodedTaskRef, taskRef: string): Promise<ServiceManagerResponse> {
    const apiKey = process.env.HEYGEN_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('HEYGEN_API_KEY is not configured');
    }

    const res = await fetch(`${HEYGEN_BASE_URL}/v1/video_status.get?video_id=${encodeURIComponent(decoded.providerTaskId)}`, {
      headers: { 'X-Api-Key': apiKey },
      cache: 'no-store',
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HeyGen status check failed (${res.status}): ${err || 'unknown error'}`);
    }

    const payload = await res.json().catch(() => ({}));
    const data = payload && typeof payload === 'object' && 'data' in payload
      ? (payload.data as Record<string, unknown>)
      : (payload as Record<string, unknown>);

    const status = String(data.status || '').toLowerCase();
    const outputUrl = typeof data.video_url === 'string' ? data.video_url : this.extractUrl(payload);

    if (status === 'completed' && outputUrl) {
      return {
        success: true,
        provider: 'heygen',
        operation: decoded.operation,
        responseType: 'video',
        message: 'Avatar generation completed successfully.',
        assetUrl: outputUrl,
        assetType: 'video',
        predictionId: taskRef,
        predictionStatus: 'succeeded',
        metadata: {
          provider: 'heygen',
          operation: decoded.operation,
          outputType: 'video',
          sessionId: decoded.sessionId,
          taskRef,
          providerTaskId: decoded.providerTaskId,
          promptHash: decoded.promptHash,
        },
      };
    }

    if (status === 'failed') {
      const errorMessage = typeof data.error === 'string' ? data.error : 'HeyGen generation failed.';
      return {
        success: false,
        provider: 'heygen',
        operation: decoded.operation,
        responseType: 'video',
        message: errorMessage,
        predictionId: taskRef,
        predictionStatus: 'failed',
        metadata: {
          provider: 'heygen',
          operation: decoded.operation,
          sessionId: decoded.sessionId,
          taskRef,
          providerTaskId: decoded.providerTaskId,
          promptHash: decoded.promptHash,
        },
      };
    }

    return {
      success: true,
      provider: 'heygen',
      operation: decoded.operation,
      responseType: 'video',
      message: 'Still processing…',
      predictionId: taskRef,
      predictionStatus: 'processing',
      metadata: {
        provider: 'heygen',
        operation: decoded.operation,
        sessionId: decoded.sessionId,
        taskRef,
        providerTaskId: decoded.providerTaskId,
        promptHash: decoded.promptHash,
      },
    };
  }

  private async pollLtxTask(decoded: EncodedTaskRef, taskRef: string): Promise<ServiceManagerResponse> {
    const apiKey = process.env.LTX_VIDEO_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('LTX_VIDEO_API_KEY is not configured');
    }

    const candidateUrls = [
      `${LTX_BASE_URL}/v1/text-to-video/${encodeURIComponent(decoded.providerTaskId)}`,
      `${LTX_BASE_URL}/v1/generations/${encodeURIComponent(decoded.providerTaskId)}`,
      `${LTX_BASE_URL}/v1/videos/${encodeURIComponent(decoded.providerTaskId)}`,
      `${LTX_BASE_URL}/v1/tasks/${encodeURIComponent(decoded.providerTaskId)}`,
    ];

    for (const url of candidateUrls) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      });

      if (!res.ok) {
        continue;
      }

      const contentType = res.headers.get('content-type') || '';

      if (!contentType.includes('application/json')) {
        const bytes = Buffer.from(await res.arrayBuffer());
        const dataUrl = `data:${contentType || 'video/mp4'};base64,${bytes.toString('base64')}`;
        return {
          success: true,
          provider: 'ltx',
          operation: decoded.operation,
          responseType: 'video',
          message: 'Video generation completed successfully.',
          assetUrl: dataUrl,
          assetType: 'video',
          predictionId: taskRef,
          predictionStatus: 'succeeded',
          metadata: {
            provider: 'ltx',
            operation: decoded.operation,
            outputType: 'video',
            sessionId: decoded.sessionId,
            taskRef,
            providerTaskId: decoded.providerTaskId,
            promptHash: decoded.promptHash,
          },
        };
      }

      const payload = await res.json().catch(() => ({}));
      const outputUrl = this.extractUrl(payload);
      const status = this.extractStatus(payload);

      if (outputUrl && (!status || status === 'completed' || status === 'succeeded' || status === 'success')) {
        return {
          success: true,
          provider: 'ltx',
          operation: decoded.operation,
          responseType: 'video',
          message: 'Video generation completed successfully.',
          assetUrl: outputUrl,
          assetType: 'video',
          predictionId: taskRef,
          predictionStatus: 'succeeded',
          metadata: {
            provider: 'ltx',
            operation: decoded.operation,
            outputType: 'video',
            sessionId: decoded.sessionId,
            taskRef,
            providerTaskId: decoded.providerTaskId,
            promptHash: decoded.promptHash,
          },
        };
      }

      if (status && TERMINAL_LTX_STATUS.has(status)) {
        return {
          success: !FAILED_LTX_STATUS.has(status),
          provider: 'ltx',
          operation: decoded.operation,
          responseType: 'video',
          message: FAILED_LTX_STATUS.has(status)
            ? (this.extractText(payload) || 'LTX generation failed.')
            : 'Video generation completed.',
          assetUrl: outputUrl,
          assetType: outputUrl ? 'video' : undefined,
          predictionId: taskRef,
          predictionStatus: FAILED_LTX_STATUS.has(status) ? 'failed' : 'succeeded',
          metadata: {
            provider: 'ltx',
            operation: decoded.operation,
            outputType: 'video',
            sessionId: decoded.sessionId,
            taskRef,
            providerTaskId: decoded.providerTaskId,
            promptHash: decoded.promptHash,
            raw: payload,
          },
        };
      }

      return {
        success: true,
        provider: 'ltx',
        operation: decoded.operation,
        responseType: 'video',
        message: this.extractText(payload) || 'Still processing…',
        predictionId: taskRef,
        predictionStatus: 'processing',
        metadata: {
          provider: 'ltx',
          operation: decoded.operation,
          sessionId: decoded.sessionId,
          taskRef,
          providerTaskId: decoded.providerTaskId,
          promptHash: decoded.promptHash,
          raw: payload,
        },
      };
    }

    return {
      success: true,
      provider: 'ltx',
      operation: decoded.operation,
      responseType: 'video',
      message: 'Still processing…',
      predictionId: taskRef,
      predictionStatus: 'processing',
      metadata: {
        provider: 'ltx',
        operation: decoded.operation,
        sessionId: decoded.sessionId,
        taskRef,
        providerTaskId: decoded.providerTaskId,
        promptHash: decoded.promptHash,
      },
    };
  }

  private async pollLegacyReplicate(predictionId: string, sessionId: string): Promise<ServiceManagerResponse> {
    const prediction = await pollPrediction(predictionId);

    if (prediction.status === 'succeeded') {
      const normalized = normalizeOutput(
        'image',
        'Replicate',
        'image',
        prediction.id,
        prediction.status,
        prediction.output,
        prediction.error,
        prediction.metrics as unknown as Record<string, unknown> | undefined,
      );

      return {
        success: normalized.success,
        provider: 'replicate',
        operation: 'text-to-image',
        responseType: normalized.url ? 'image' : 'text',
        message: normalized.text || 'Generation completed.',
        assetUrl: normalized.url,
        assetType: normalized.url ? 'image' : undefined,
        predictionId,
        predictionStatus: 'succeeded',
        metadata: {
          provider: 'replicate',
          operation: 'text-to-image',
          sessionId,
          providerTaskId: prediction.id,
          promptHash: this.hashPrompt(predictionId),
          legacyPredictionId: predictionId,
        },
      };
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      return {
        success: false,
        provider: 'replicate',
        operation: 'text-to-image',
        responseType: 'text',
        message: prediction.error || 'Generation failed.',
        predictionId,
        predictionStatus: prediction.status,
        metadata: {
          provider: 'replicate',
          operation: 'text-to-image',
          sessionId,
          providerTaskId: prediction.id,
          promptHash: this.hashPrompt(predictionId),
          legacyPredictionId: predictionId,
        },
      };
    }

    return {
      success: true,
      provider: 'replicate',
      operation: 'text-to-image',
      responseType: 'text',
      message: 'Still processing…',
      predictionId,
      predictionStatus: prediction.status,
      metadata: {
        provider: 'replicate',
        operation: 'text-to-image',
        sessionId,
        providerTaskId: prediction.id,
        promptHash: this.hashPrompt(predictionId),
        legacyPredictionId: predictionId,
      },
    };
  }

  private resolveOperation(request: ServiceManagerRequest): DeterministicOperation {
    if (request.intent === 'video_generation') {
      return 'video-avatar';
    }

    if (request.intent === 'avatar_generation') {
      const preferred = this.getOption(request.selectedOptions || {}, ['provider', 'video_provider', 'providerMode']);
      if (preferred && ['replicate', 'nanobanana'].includes(preferred.toLowerCase())) {
        return 'text-to-image';
      }
      return 'video-avatar';
    }

    return 'text-to-image';
  }

  private resolveImageProvider(selectedOptions?: Record<string, string>): 'nanobanana' | 'replicate' {
    const preferred = this.getOption(selectedOptions || {}, ['provider', 'image_provider', 'providerMode']);
    return preferred?.toLowerCase() === 'replicate' ? 'replicate' : 'nanobanana';
  }

  private resolveVideoProvider(request: ServiceManagerRequest): 'ltx' | 'heygen' {
    const preferred = this.getOption(request.selectedOptions || {}, ['provider', 'video_provider', 'providerMode']);
    if (preferred?.toLowerCase() === 'heygen') {
      return 'heygen';
    }

    if (preferred?.toLowerCase() === 'ltx') {
      return 'ltx';
    }

    if (request.intent === 'avatar_generation' || request.serviceContext === 'avatar') {
      return 'heygen';
    }

    return 'ltx';
  }

  private isHighQualityRequest(options: Record<string, string>): boolean {
    const endpoint = this.getOption(options, ['nanobanana_endpoint', 'nanobananaEndpoint', 'endpoint']);
    const quality = this.getOption(options, ['quality', 'img-quality', 'imgQuality']);
    const resolution = this.getOption(options, ['resolution', 'size']);

    return [endpoint, quality, resolution]
      .filter((item): item is string => Boolean(item))
      .some((item) => /pro-4k|4k|ultra|high|hd/i.test(item));
  }

  private normalizeAspectRatio(value?: string): '1:1' | '4:5' | '16:9' | '9:16' | '4:3' | '3:4' {
    if (!value) {
      return '1:1';
    }

    const normalized = value.trim().toLowerCase();
    const fromMap: Record<string, '1:1' | '4:5' | '16:9' | '9:16' | '4:3' | '3:4'> = {
      '1:1': '1:1',
      '4:5': '4:5',
      '16:9': '16:9',
      '9:16': '9:16',
      '4:3': '4:3',
      '3:4': '3:4',
      '1024x1024': '1:1',
      '1024x1792': '9:16',
      '1792x1024': '16:9',
      '1920x1080': '16:9',
      '1080x1920': '9:16',
      '1280x720': '16:9',
      '720x1280': '9:16',
    };

    return fromMap[normalized] || '1:1';
  }

  private mapLtxResolution(
    value: string | undefined,
    aspectRatio: string,
    model: 'ltx-2-3-fast' | 'ltx-2-3-pro' = 'ltx-2-3-fast',
  ): '1920x1080' | '1080x1920' | '2560x1440' | '3840x2160' {
    const supported = LTX_SUPPORTED_RESOLUTIONS[model];
    const normalized = (value || '').trim().toLowerCase().replace(/\s+/g, '');

    // Honor an explicit, supported resolution if the caller provided one.
    if (supported.includes(normalized)) {
      return normalized as '1920x1080' | '1080x1920' | '2560x1440' | '3840x2160';
    }

    // Otherwise derive from aspect ratio. Vertical → portrait HD, everything
    // else → landscape HD. (Square/4:3 have no native LTX size, so we land on
    // the safe 16:9 default the API always accepts.)
    if (aspectRatio === '9:16' || aspectRatio === '3:4') {
      return '1080x1920';
    }
    return '1920x1080';
  }

  private clampLtxFps(value: number): 24 | 25 | 30 {
    if (!Number.isFinite(value)) return 24;
    // Snap to the nearest LTX-accepted frame rate (24 / 25 / 30).
    let nearest: 24 | 25 | 30 = 24;
    let bestDelta = Infinity;
    for (const candidate of LTX_ALLOWED_FPS) {
      const delta = Math.abs(candidate - value);
      if (delta < bestDelta) {
        bestDelta = delta;
        nearest = candidate;
      }
    }
    return nearest;
  }

  private normalizeHeygenAspect(value?: string): '16:9' | '9:16' | '1:1' {
    const normalized = this.normalizeAspectRatio(value);
    if (normalized === '9:16') return '9:16';
    if (normalized === '1:1') return '1:1';
    return '16:9';
  }

  private normalizeVoiceGender(value?: string): 'female' | 'male' {
    return String(value || '').toLowerCase() === 'male' ? 'male' : 'female';
  }

  // PHASE 39 §2 — avatar_style is no longer hardcoded. The user's selected
  // framing flows through (normal / circle / closeUp), so the engine honors the
  // active prompt's face/body intent instead of a locked default.
  private normalizeHeygenAvatarStyle(value?: string): 'normal' | 'circle' | 'closeUp' {
    const v = String(value || '').toLowerCase().replace(/[\s_-]/g, '');
    if (v === 'circle') return 'circle';
    if (v === 'closeup' || v === 'close') return 'closeUp';
    return 'normal';
  }

  private mapHeygenDimension(aspectRatio: '16:9' | '9:16' | '1:1'): { width: number; height: number } {
    if (aspectRatio === '9:16') {
      return { width: 720, height: 1280 };
    }

    if (aspectRatio === '1:1') {
      return { width: 720, height: 720 };
    }

    return { width: 1280, height: 720 };
  }

  private mapReplicateQuality(value?: string): 'standard' | 'high' | 'ultra' {
    if (!value) return 'high';
    if (/ultra|4k/i.test(value)) return 'ultra';
    if (/high|hd|pro/i.test(value)) return 'high';
    return 'standard';
  }

  private toNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private getOption(options: Record<string, string>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = options[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return undefined;
  }

  private hashPrompt(prompt: string): string {
    return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
  }

  private encodeTaskRef(task: Omit<EncodedTaskRef, 'v'>): string {
    const payload: EncodedTaskRef = {
      v: TASK_REF_VERSION,
      ...task,
    };

    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  private decodeTaskRef(taskRef: string): EncodedTaskRef | null {
    try {
      const raw = Buffer.from(taskRef, 'base64url').toString('utf8');
      const parsed = JSON.parse(raw) as Partial<EncodedTaskRef>;

      if (
        parsed.v !== TASK_REF_VERSION
        || (parsed.provider !== 'replicate' && parsed.provider !== 'ltx' && parsed.provider !== 'heygen')
        || typeof parsed.providerTaskId !== 'string'
        || typeof parsed.sessionId !== 'string'
        || typeof parsed.serviceContext !== 'string'
        || typeof parsed.intent !== 'string'
        || (parsed.operation !== 'text-to-image' && parsed.operation !== 'video-avatar')
        || (parsed.responseType !== 'image' && parsed.responseType !== 'video')
        || typeof parsed.promptHash !== 'string'
        || typeof parsed.createdAt !== 'number'
      ) {
        return null;
      }

      return parsed as EncodedTaskRef;
    } catch {
      return null;
    }
  }

  private extractText(payload: unknown): string | undefined {
    if (!payload) {
      return undefined;
    }

    if (typeof payload === 'string') {
      return payload.trim() ? payload : undefined;
    }

    if (Array.isArray(payload)) {
      const chunks = payload.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      return chunks.length > 0 ? chunks.join('\n') : undefined;
    }

    if (typeof payload !== 'object') {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    const directKeys = ['message', 'msg', 'text', 'detail', 'error', 'error_message'];
    for (const key of directKeys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    const nestedKeys = ['data', 'result', 'response'];
    for (const key of nestedKeys) {
      const nested = this.extractText(record[key]);
      if (nested) {
        return nested;
      }
    }

    return undefined;
  }

  private extractUrl(payload: unknown): string | undefined {
    if (!payload) {
      return undefined;
    }

    if (typeof payload === 'string') {
      if (/^https?:\/\//i.test(payload) || /^data:/i.test(payload)) {
        return payload;
      }
      return undefined;
    }

    if (Array.isArray(payload)) {
      for (const item of payload) {
        const maybe = this.extractUrl(item);
        if (maybe) {
          return maybe;
        }
      }
      return undefined;
    }

    if (typeof payload !== 'object') {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    const keys = ['url', 'video_url', 'output_url', 'result_url', 'asset_url', 'assetUrl'];
    for (const key of keys) {
      const maybe = this.extractUrl(record[key]);
      if (maybe) {
        return maybe;
      }
    }

    const nestedKeys = ['data', 'result', 'response'];
    for (const key of nestedKeys) {
      const nested = this.extractUrl(record[key]);
      if (nested) {
        return nested;
      }
    }

    return undefined;
  }

  private extractTaskId(payload: unknown): string | undefined {
    if (!payload) {
      return undefined;
    }

    if (typeof payload === 'string') {
      return payload.trim() || undefined;
    }

    if (typeof payload !== 'object') {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    const keys = ['taskId', 'task_id', 'video_id', 'generation_id', 'id'];
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    const nestedKeys = ['data', 'result', 'response'];
    for (const key of nestedKeys) {
      const nested = this.extractTaskId(record[key]);
      if (nested) {
        return nested;
      }
    }

    return undefined;
  }

  private extractStatus(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    const direct = record.status;
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim().toLowerCase();
    }

    const nestedKeys = ['data', 'result', 'response'];
    for (const key of nestedKeys) {
      const nested = this.extractStatus(record[key]);
      if (nested) {
        return nested;
      }
    }

    return undefined;
  }

  private async getHeygenVoiceId(apiKey: string, gender: 'female' | 'male', language: string): Promise<string> {
    try {
      const res = await fetch(`${HEYGEN_BASE_URL}/v2/voices`, {
        headers: { 'X-Api-Key': apiKey },
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error('voices endpoint failed');
      }

      const payload = await res.json() as {
        data?: {
          voices?: Array<{ voice_id: string; language?: string; gender?: string }>;
        };
      };

      const voices = payload.data?.voices || [];
      const langCode = (language === 'ka' ? 'en' : language).toLowerCase();

      const exact = voices.find((voice) => (
        voice.gender?.toLowerCase() === gender
        && voice.language?.toLowerCase().startsWith(langCode)
      ));

      if (exact?.voice_id) {
        return exact.voice_id;
      }

      const byGender = voices.find((voice) => voice.gender?.toLowerCase() === gender);
      if (byGender?.voice_id) {
        return byGender.voice_id;
      }
    } catch {
      // Fallback to static IDs below.
    }

    const genderMap = HEYGEN_VOICE_MAP[gender];
    return genderMap[language] || genderMap.en || '1bd001e7e50f421d891986aad5158bc8';
  }

  private async getHeygenFirstAvatar(apiKey: string): Promise<string> {
    const res = await fetch(`${HEYGEN_BASE_URL}/v2/avatars`, {
      headers: { 'X-Api-Key': apiKey },
      cache: 'no-store',
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HeyGen avatars list failed (${res.status}): ${err || 'unknown error'}`);
    }

    const payload = await res.json() as {
      data?: {
        avatars?: Array<{ avatar_id: string }>;
      };
    };

    const avatarId = payload.data?.avatars?.[0]?.avatar_id;
    if (!avatarId) {
      throw new Error('No HeyGen avatar is available in this account');
    }

    return avatarId;
  }
}
