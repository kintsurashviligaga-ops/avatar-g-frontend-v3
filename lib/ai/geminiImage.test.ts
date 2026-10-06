/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./geminiImagen', () => ({
  generateImagenImages: jest.fn(), geminiImagenModel: () => 'imagen-4.0-generate-001',
  hasGeminiImagenProvider: jest.fn(() => true),
}));
import { generateImagenImages, hasGeminiImagenProvider } from './geminiImagen';
import { geminiImageForEndpoint, generateGeminiImage } from './geminiImage';
const generate = jest.mocked(generateImagenImages);
beforeEach(() => { jest.clearAllMocks(); jest.mocked(hasGeminiImagenProvider).mockReturnValue(true); });

test('legacy IDs resolve to the actual configured Imagen model and default size', () => {
  for (const id of ['v2-1k', 'v2-2k', 'v2-4k', 'pro-1k2k', 'pro-4k', 'text-to-image']) {
    expect(geminiImageForEndpoint(id)).toEqual({ model: 'imagen-4.0-generate-001', imageSize: '1K' });
  }
});
test('returns Imagen bytes with truthful model metadata, using one generation', async () => {
  generate.mockResolvedValue([{ buffer: Buffer.from('image'), mimeType: 'image/png' }]);
  await expect(generateGeminiImage({ prompt: 'landscape', aspectRatio: '16:9' })).resolves.toEqual({
    base64: Buffer.from('image').toString('base64'), mimeType: 'image/png', model: 'imagen-4.0-generate-001',
  });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate).toHaveBeenCalledWith({ prompt: 'landscape', aspectRatio: '16:9', numberOfImages: 1 });
});
test('unsupported edits, sizes and models perform no provider call', async () => {
  await expect(generateGeminiImage({ prompt: 'p', referenceImages: ['https://example.com/person.jpg'] })).resolves.toBeNull();
  await expect(generateGeminiImage({ prompt: 'p', imageSize: '4K' })).resolves.toBeNull();
  await expect(generateGeminiImage({ prompt: 'p', model: 'gemini-3.1-flash-image' })).resolves.toBeNull();
  expect(generate).not.toHaveBeenCalled();
});
test('unavailable or failed generation has no retry or alternate provider', async () => {
  jest.mocked(hasGeminiImagenProvider).mockReturnValue(false);
  await expect(generateGeminiImage({ prompt: 'p' })).resolves.toBeNull();
  expect(generate).not.toHaveBeenCalled();
  jest.mocked(hasGeminiImagenProvider).mockReturnValue(true);
  generate.mockResolvedValue(null);
  await expect(generateGeminiImage({ prompt: 'p' })).resolves.toBeNull();
  expect(generate).toHaveBeenCalledTimes(1);
});
