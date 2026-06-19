// Master Prompt §5 / B.3 — Storyboard agent. Wraps the app's working Nano Banana client.
// Character consistency (IP-Adapter): scene 1's image URL becomes the identity anchor
// passed as referenceImageDataUrl for scenes 2-5, so the protagonist never drifts.
import 'server-only';
import { BaseAgent, AgentContext } from './base-agent';
import { generateNanoBananaImage } from '@/lib/nanobanana/client';

export interface ImageResult {
  url: string;
}

export class NanoBananaAgent extends BaseAgent {
  constructor() {
    super('NanoBanana', 90000); // image gen + result polling
  }

  async generateImage(ctx: AgentContext, prompt: string, opts?: { faceEmbeddingUrl?: string }): Promise<ImageResult> {
    return this.guarded(
      ctx,
      async () => {
        const res = await generateNanoBananaImage({
          prompt,
          aspectRatio: '16:9',
          service: 'image',
          ...(opts?.faceEmbeddingUrl ? { referenceImageDataUrl: opts.faceEmbeddingUrl } : {}),
        });
        if (!res.url) throw new Error('NanoBanana returned no image url');
        return { url: res.url };
      },
      2,
    );
  }

  /** The IP-Adapter identity anchor for scenes 2-5 is the scene-1 image URL itself. */
  async extractFaceEmbedding(_ctx: AgentContext, image: ImageResult): Promise<string> {
    return image.url;
  }
}
