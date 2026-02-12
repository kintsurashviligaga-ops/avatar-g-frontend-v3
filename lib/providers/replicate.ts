// Replicate Avatar Provider Implementation
// https://replicate.com/docs/reference/http

import Replicate from 'replicate';
import type {
  IAvatarProvider,
  AvatarProviderInput,
  AvatarGenerationResult
} from './interfaces';

export class ReplicateAvatarProvider implements IAvatarProvider {
  name = 'replicate';
  private client: Replicate | null = null;

  constructor(apiToken?: string) {
    const token = apiToken || process.env.REPLICATE_API_TOKEN;
    if (token) {
      this.client = new Replicate({ auth: token });
    }
  }

  isAvailable(): boolean {
    return !!this.client;
  }

  async generate(input: AvatarProviderInput): Promise<AvatarGenerationResult> {
    if (!this.client) {
      throw new Error('Replicate API token not configured');
    }

    const startTime = Date.now();

    try {
      // Use SDXL model for high-quality avatar generation
      const output = await this.client.run(
        "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        {
          input: {
            prompt: input.prompt,
            negative_prompt: input.negative_prompt || '',
            width: input.width || 1024,
            height: input.height || 1024,
            num_inference_steps: input.num_inference_steps || 30,
            guidance_scale: input.guidance_scale || 7.5,
            seed: input.seed,
            num_outputs: input.enable_turnaround ? 4 : 1
          }
        }
      ) as string[];

      const generationTime = Date.now() - startTime;

      if (!output || output.length === 0) {
        throw new Error('No images generated');
      }

      return {
        image_url: output[0],
        turnaround_urls: output.length > 1 ? output.slice(1) : undefined,
        generation_time_ms: generationTime,
        metadata: {
          model: 'sdxl',
          seed: input.seed
        }
      };

    } catch (error) {
      throw new Error(`Replicate generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async imageToImage(input: AvatarProviderInput & { init_image: string }): Promise<AvatarGenerationResult> {
    if (!this.client) {
      throw new Error('Replicate API token not configured');
    }

    const startTime = Date.now();

    try {
      // Use SDXL img2img model
      const output = await this.client.run(
        "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        {
          input: {
            image: input.init_image,
            prompt: input.prompt,
            negative_prompt: input.negative_prompt || '',
            width: input.width || 1024,
            height: input.height || 1024,
            num_inference_steps: input.num_inference_steps || 30,
            guidance_scale: input.guidance_scale || 7.5,
            prompt_strength: 0.8, // How much to transform the image
            seed: input.seed
          }
        }
      ) as string[];

      const generationTime = Date.now() - startTime;

      if (!output || output.length === 0) {
        throw new Error('No images generated');
      }

      return {
        image_url: output[0],
        generation_time_ms: generationTime,
        metadata: {
          model: 'sdxl-img2img',
          seed: input.seed
        }
      };

    } catch (error) {
      throw new Error(`Replicate image-to-image failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
