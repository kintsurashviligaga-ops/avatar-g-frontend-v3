/** Compatibility API for image callers. MyAvatar v32 generates images with Google Imagen only. */
import 'server-only';
import { generateImagenImages, geminiImagenModel, hasGeminiImagenProvider } from './geminiImagen';

export type GeminiImageSize = '1K' | '2K' | '4K';
export function geminiFrameModel(): string { return geminiImagenModel(); }

/** Legacy endpoint IDs remain accepted; they all select the configured Imagen model at its default size. */
export function geminiImageForEndpoint(_endpoint: string): { model: string; imageSize: GeminiImageSize } {
  return { model: geminiImagenModel(), imageSize: '1K' };
}

export interface GeminiImageArgs {
  prompt: string;
  /** Reference editing needs a separate Imagen edit adapter; reject it before provider I/O. */
  referenceImages?: string[];
  aspectRatio?: string;
  imageSize?: GeminiImageSize;
  model?: string;
  timeoutMs?: number;
}
export interface GeminiImageResult { base64: string; mimeType: string; model: string }

export async function generateGeminiImage(args: GeminiImageArgs): Promise<GeminiImageResult | null> {
  if (!hasGeminiImagenProvider() || !args.prompt?.trim() || args.referenceImages?.length) return null;
  if (args.imageSize && args.imageSize !== '1K') return null;
  const model = geminiImagenModel();
  if (args.model && args.model !== model) return null;
  try {
    const images = await generateImagenImages({ prompt: args.prompt, aspectRatio: args.aspectRatio, numberOfImages: 1 });
    const image = images?.[0];
    return image ? { base64: image.buffer.toString('base64'), mimeType: image.mimeType, model } : null;
  } catch {
    return null;
  }
}
