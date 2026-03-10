import { ServiceType, QualityTier } from './models';

export interface GenerateInput {
  service: ServiceType;
  prompt: string;
  variant?: string;
  quality?: QualityTier;
  negativePrompt?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  imageUrl?: string;
  style?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: GenerateInput;
}

const ASPECT_RATIOS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1344, height: 768 },
  '9:16': { width: 768, height: 1344 },
  '4:3': { width: 1152, height: 896 },
  '3:4': { width: 896, height: 1152 },
};

export function validateInput(raw: Record<string, unknown>): ValidationResult {
  const service = String(raw.service || '').trim();
  const prompt = String(raw.prompt || '').trim();

  if (!service) return { valid: false, error: 'Missing service type' };
  if (!['avatar', 'image', 'photo', 'video', 'music', 'visual-ai'].includes(service)) {
    return { valid: false, error: `Invalid service: ${service}` };
  }

  // Photo/visual-ai may not need a text prompt if they have an image
  if (!prompt && !raw.imageUrl && service !== 'photo' && service !== 'visual-ai') {
    return { valid: false, error: 'Prompt is required' };
  }

  const sanitized: GenerateInput = {
    service: service as ServiceType,
    prompt: prompt.slice(0, 2000),
    variant: raw.variant ? String(raw.variant).trim() : undefined,
    quality: (['standard', 'high', 'ultra'].includes(String(raw.quality)) ? raw.quality : 'high') as QualityTier,
    negativePrompt: raw.negativePrompt ? String(raw.negativePrompt).slice(0, 500) : undefined,
    aspectRatio: raw.aspectRatio && Object.keys(ASPECT_RATIOS).includes(String(raw.aspectRatio))
      ? (raw.aspectRatio as GenerateInput['aspectRatio'])
      : '1:1',
    imageUrl: raw.imageUrl ? String(raw.imageUrl) : undefined,
    style: raw.style ? String(raw.style).trim() : undefined,
  };

  return { valid: true, sanitized };
}

export function getAspectDimensions(ratio: string = '1:1'): { width: number; height: number } {
  return ASPECT_RATIOS[ratio] ?? ASPECT_RATIOS['1:1']!;
}

export function buildModelInput(input: GenerateInput): Record<string, unknown> {
  const dims = getAspectDimensions(input.aspectRatio);

  switch (input.service) {
    case 'avatar':
      return {
        prompt: input.prompt,
        negative_prompt: input.negativePrompt || 'blurry, low quality, distorted face, extra limbs',
        width: dims.width,
        height: dims.height,
        num_inference_steps: input.quality === 'ultra' ? 50 : input.quality === 'high' ? 30 : 20,
        guidance_scale: 7.5,
        ...(input.imageUrl ? { image: input.imageUrl } : {}),
      };

    case 'image':
      return {
        prompt: input.prompt,
        negative_prompt: input.negativePrompt || 'blurry, low quality, watermark',
        width: dims.width,
        height: dims.height,
        num_inference_steps: input.quality === 'ultra' ? 50 : input.quality === 'high' ? 30 : 20,
        guidance_scale: 7.5,
        ...(input.style ? { style_preset: input.style } : {}),
      };

    case 'photo':
      if (!input.imageUrl) {
        return { prompt: input.prompt || 'enhance' };
      }
      if (input.variant === 'remove-bg') {
        return { image: input.imageUrl };
      }
      return {
        image: input.imageUrl,
        scale: input.quality === 'ultra' ? 4 : input.quality === 'high' ? 4 : 2,
        face_enhance: true,
      };

    case 'video':
      return {
        prompt: input.prompt,
        negative_prompt: input.negativePrompt || 'blurry, low quality, glitchy',
        num_frames: 24,
        fps: 8,
        width: 576,
        height: 320,
        ...(input.imageUrl ? { image: input.imageUrl } : {}),
      };

    case 'music':
      return {
        prompt: input.prompt,
        duration: input.quality === 'ultra' ? 30 : input.quality === 'high' ? 15 : 8,
        model_version: 'stereo-large',
        output_format: 'mp3',
        normalization_strategy: 'peak',
      };

    case 'visual-ai':
      return {
        ...(input.imageUrl ? { image: input.imageUrl } : {}),
        ...(input.prompt ? { question: input.prompt } : {}),
        task: 'image_captioning',
      };

    default:
      return { prompt: input.prompt };
  }
}
