import 'server-only';
import type { ProviderFactory, IAvatarProvider, IOutfitFittingProvider, IVoiceProvider, ITalkingAvatarProvider, IFaceAnalysisProvider } from './interfaces';
import { generateImagenImages, geminiImagenModel, hasGeminiImagenProvider } from '@/lib/ai/geminiImagen';

/** No demo assets or successful fake jobs may escape through the production factory. */
async function unavailable(): Promise<never> {
  throw new Error('This capability has no configured permitted provider');
}
const unavailableBase = { name: 'unavailable', isAvailable: () => false };
const avatar: IAvatarProvider = {
  name: 'google-imagen', isAvailable: hasGeminiImagenProvider,
  async generate(input) {
    if (input.reference_image || input.enable_turnaround) return unavailable();
    if (!hasGeminiImagenProvider()) return unavailable();
    const start = Date.now();
    const ratio = input.width && input.height ? input.width / input.height : 1;
    const aspectRatio = ratio > 1.5 ? '16:9' : ratio > 1.1 ? '4:3' : ratio < 0.65 ? '9:16' : ratio < 0.9 ? '3:4' : '1:1';
    const images = await generateImagenImages({ prompt: input.prompt, negativePrompt: input.negative_prompt, aspectRatio, numberOfImages: 1 });
    const image = images?.[0];
    if (!image) throw new Error('Imagen generation failed');
    return { image_url: `data:${image.mimeType};base64,${image.buffer.toString('base64')}`, generation_time_ms: Date.now() - start, metadata: { provider: 'google', model: geminiImagenModel() } };
  },
  imageToImage: unavailable,
};
const outfit: IOutfitFittingProvider = { ...unavailableBase, fitOutfit: unavailable };
const voice: IVoiceProvider = { ...unavailableBase, trainVoice: unavailable, synthesize: unavailable };
const talkingAvatar: ITalkingAvatarProvider = { ...unavailableBase, generateVideo: unavailable };
const face: IFaceAnalysisProvider = { ...unavailableBase, analyze: unavailable };

export class DefaultProviderFactory implements ProviderFactory {
  getAvatarProvider(): IAvatarProvider { return avatar; }
  getOutfitFittingProvider(): IOutfitFittingProvider { return outfit; }
  getVoiceProvider(): IVoiceProvider { return voice; }
  getTalkingAvatarProvider(): ITalkingAvatarProvider { return talkingAvatar; }
  getFaceAnalysisProvider(): IFaceAnalysisProvider { return face; }
}
export const providerFactory = new DefaultProviderFactory();
