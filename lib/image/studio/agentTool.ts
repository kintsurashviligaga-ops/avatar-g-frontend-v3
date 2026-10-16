import { z } from 'zod';
import { defineTool } from '@/lib/agent/tools/registry';
import type { ImageRequest } from './contracts';
import type { quoteImage, ImageDeps } from './engine';

export type ImageQuote = Awaited<ReturnType<typeof quoteImage>>;
export interface ImageToolContext {
  userId: string;
  media?: boolean;
  imageDraft?: ImageRequest;
  onImageQuote?: (quote: ImageQuote) => void;
  imageDeps?: ImageDeps;
}
/** No model-supplied prompt, asset path, model, price or confirmation. All settings come from the user's reviewed draft. */
export const imageQuoteTool = defineTool({
  name: 'quote_image', effect: 'quote', confirms: 'image_run',
  description: 'QUOTE ONLY the exact image draft selected in Image Studio. Preserves the user text, model and ordered references. No generation or charge; the user must confirm the displayed price.',
  input: z.object({}).strict(), limit: 4,
  offered: (ctx: ImageToolContext) => ctx.media === true && !!ctx.imageDraft && !!ctx.onImageQuote,
  run: async (_input, ctx: ImageToolContext) => {
    if (!ctx.imageDraft || !ctx.onImageQuote || ctx.media !== true) return { error: 'not_available' };
    const { quoteImage: quote } = await import('./engine');
    const deps = ctx.imageDeps ?? (await import('./live')).liveImageDeps();
    const result = await quote(deps, ctx.userId, ctx.imageDraft);
    ctx.onImageQuote(result);
    return { planned: true, generated: false, credits: result.credits, modelId: result.plan.request.modelId,
      operation: result.plan.request.operation, next: 'Confirm the displayed image quote to start.' };
  },
});
