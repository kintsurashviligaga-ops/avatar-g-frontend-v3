/** One Google Imagen character portrait reused as the Veo start frame. */
import 'server-only';
import { generateImagenImages, hasGeminiImagenProvider } from '@/lib/ai/geminiImagen';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
export type AnchorAspect = '9:16' | '16:9' | '1:1';
export type ImageQuality = 'fast' | 'high';

export async function generateAnchorFrame(characterDescription: string, aspect: AnchorAspect = '9:16', _quality?: ImageQuality): Promise<string | null> {
  const desc = characterDescription?.trim();
  if (!desc || !hasGeminiImagenProvider()) return null;
  try {
    const images = await generateImagenImages({
      prompt: `${desc.slice(0, 1500)}, cinematic character portrait, head and shoulders, facing camera directly, clean simple background, photorealistic, sharp focus, soft cinematic lighting`,
      aspectRatio: aspect, numberOfImages: 1,
    });
    const image = images?.[0];
    if (!image) return null;
    const extension = image.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    return await uploadAndSign('uploads', `film-anchor/${crypto.randomUUID()}.${extension}`, image.buffer.toString('base64'), image.mimeType, 604800);
  } catch { return null; }
}
