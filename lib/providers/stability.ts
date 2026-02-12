// Stability AI Avatar Provider Implementation
// https://platform.stability.ai/docs/api-reference

import type {
  IAvatarProvider,
  AvatarProviderInput,
  AvatarGenerationResult
} from './interfaces';

interface StabilityTextPrompt {
  text: string;
  weight: number;
}

interface StabilityTextToImagePayload {
  text_prompts: StabilityTextPrompt[];
  width: number;
  height: number;
  samples: number;
  steps: number;
  cfg_scale?: number;
  seed?: number;
  style_preset?: string;
}

interface StabilityArtifact {
  base64?: string;
  seed?: number;
  finishReason?: string;
}

interface StabilityResponse {
  artifacts?: StabilityArtifact[];
}

export class StabilityAvatarProvider implements IAvatarProvider {
  name = 'stability';
  private apiKey: string;
  private baseUrl = 'https://api.stability.ai/v1';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.STABILITY_API_KEY || '';
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async generate(input: AvatarProviderInput): Promise<AvatarGenerationResult> {
    if (!this.isAvailable()) {
      throw new Error('Stability AI API key not configured');
    }

    const startTime = Date.now();

    // Use SDXL 1.0 model (supports 1024x1024)
    const endpoint = `${this.baseUrl}/generation/stable-diffusion-xl-1024-v1-0/text-to-image`;

    // Build request payload - ONLY include supported fields
    const payload: StabilityTextToImagePayload = {
      text_prompts: [
        {
          text: input.prompt,
          weight: 1
        }
      ],
      width: input.width || 1024,
      height: input.height || 1024,
      samples: input.enable_turnaround ? 4 : 1,
      steps: input.num_inference_steps || 30
    };

    // Only add optional fields if provided
    if (input.guidance_scale) {
      payload.cfg_scale = input.guidance_scale;
    }
    
    if (input.seed) {
      payload.seed = input.seed;
    }

    if (input.style_preset) {
      payload.style_preset = input.style_preset;
    }

    if (input.negative_prompt) {
      payload.text_prompts.push({
        text: input.negative_prompt,
        weight: -1
      });
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Stability AI error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as StabilityResponse;
      const generationTime = Date.now() - startTime;

      // Extract image URLs from artifacts
      const artifacts = data.artifacts || [];
      const imageUrls = artifacts
        .map((artifact) => artifact.base64)
        .filter((base64): base64 is string => Boolean(base64))
        .map((base64) => `data:image/png;base64,${base64}`);

      if (imageUrls.length === 0) {
        throw new Error('No images generated');
      }

      return {
        image_url: imageUrls[0]!,
        turnaround_urls: imageUrls.length > 1 ? imageUrls.slice(1) : undefined,
        generation_time_ms: generationTime,
        metadata: {
          seed: data.artifacts?.at(0)?.seed,
          finish_reason: data.artifacts?.at(0)?.finishReason
        }
      };

    } catch (error) {
      throw new Error(`Stability generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async imageToImage(input: AvatarProviderInput & { init_image: string }): Promise<AvatarGenerationResult> {
    if (!this.isAvailable()) {
      throw new Error('Stability AI API key not configured');
    }

    const startTime = Date.now();

    const endpoint = `${this.baseUrl}/generation/stable-diffusion-xl-1024-v1-0/image-to-image`;

    // Build FormData - ONLY include supported fields
    const formData = new FormData();
    
    // Text prompts (required)
    formData.append('text_prompts[0][text]', input.prompt);
    formData.append('text_prompts[0][weight]', '1');
    
    if (input.negative_prompt) {
      formData.append('text_prompts[1][text]', input.negative_prompt);
      formData.append('text_prompts[1][weight]', '-1');
    }

    // Init image (required for image-to-image)
    const imageBlob = await this.dataUrlToBlob(input.init_image);
    formData.append('init_image', imageBlob, 'init.png');

    // Dimensions (required for SDXL)
    formData.append('width', String(input.width || 1024));
    formData.append('height', String(input.height || 1024));

    // Steps (required)
   formData.append('steps', String(input.num_inference_steps || 30));

    // Optional parameters - only add if provided
    if (input.guidance_scale) {
      formData.append('cfg_scale', String(input.guidance_scale));
    }

    if (input.seed) {
      formData.append('seed', String(input.seed));
    }

    if (input.style_preset) {
      formData.append('style_preset', input.style_preset);
    }

    // Note: DO NOT include 'strength' field - not supported by SDXL
    // Image strength is determined by the number of steps

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json'
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Stability AI error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as StabilityResponse;
      const generationTime = Date.now() - startTime;

      const artifacts = data.artifacts || [];
      const firstImage = artifacts.find((artifact) => artifact.base64)?.base64;
      if (!firstImage) {
        throw new Error('No images generated');
      }

      const imageUrl = `data:image/png;base64,${firstImage}`;

      return {
        image_url: imageUrl,
        generation_time_ms: generationTime,
        metadata: {
          seed: artifacts[0]?.seed,
          finish_reason: artifacts[0]?.finishReason
        }
      };

    } catch (error) {
      throw new Error(`Stability image-to-image failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    if (dataUrl.startsWith('data:')) {
      const response = await fetch(dataUrl);
      return response.blob();
    } else {
      // Assume it's a URL, fetch it
      const response = await fetch(dataUrl);
      return response.blob();
    }
  }
}
