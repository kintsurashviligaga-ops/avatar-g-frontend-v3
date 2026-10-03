/** @jest-environment node */
/**
 * lib/ai/geminiImage — the image studio's endpoints mapped onto Google's own models, and the size that a model refuses
 * costing one free retry instead of the image.
 */
jest.mock('server-only', () => ({}));
jest.mock('../orchestrator/gemini-guard', () => ({ resolveGeminiKey: jest.fn(() => 'test-key') }));

import { GEMINI_PRO_IMAGE_MODEL, buildGeminiImageBody, geminiFrameModel, geminiImageForEndpoint, generateGeminiImage } from './geminiImage';

afterEach(() => jest.restoreAllMocks());

describe('geminiImageForEndpoint', () => {
  test('Nano Banana 2 for the v2 and legacy endpoints, Pro for pro-*; the size is the endpoint\'s own', () => {
    expect(geminiImageForEndpoint('v2-1k')).toEqual({ model: geminiFrameModel(), imageSize: '1K' });
    expect(geminiImageForEndpoint('v2-2k')).toEqual({ model: geminiFrameModel(), imageSize: '2K' });
    expect(geminiImageForEndpoint('v2-4k')).toEqual({ model: geminiFrameModel(), imageSize: '4K' });
    expect(geminiImageForEndpoint('text-to-image')).toEqual({ model: geminiFrameModel(), imageSize: '1K' });
    expect(geminiImageForEndpoint('pro-1k2k')).toEqual({ model: GEMINI_PRO_IMAGE_MODEL, imageSize: '2K' });
    expect(geminiImageForEndpoint('pro-4k')).toEqual({ model: GEMINI_PRO_IMAGE_MODEL, imageSize: '4K' });
    expect(geminiImageForEndpoint('')).toEqual({ model: geminiFrameModel(), imageSize: '1K' });
  });
});

describe('buildGeminiImageBody', () => {
  test('1K is the default and is never asked for; 2K / 4K ride imageConfig beside the ratio', () => {
    expect(buildGeminiImageBody('p', [], '9:16', '1K').generationConfig).toEqual({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } });
    expect(buildGeminiImageBody('p', [], '9:16', '4K').generationConfig).toEqual({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16', imageSize: '4K' } });
    expect(buildGeminiImageBody('p', [], undefined, '2K').generationConfig).toEqual({ responseModalities: ['IMAGE'], imageConfig: { imageSize: '2K' } });
    expect(buildGeminiImageBody('p', [], 'nope').generationConfig).toEqual({ responseModalities: ['IMAGE'] });
  });
});

describe('generateGeminiImage', () => {
  const okBody = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  test('a model that refuses the size (400) is asked once more at its default — the image still arrives', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(reply(400, { error: { message: 'imageSize not supported' } }))
      .mockResolvedValueOnce(reply(200, okBody));
    const r = await generateGeminiImage({ prompt: 'p', model: 'gemini-3.1-flash-image', imageSize: '4K', aspectRatio: '1:1' });
    expect(r).toEqual({ base64: 'AAAA', mimeType: 'image/png', model: 'gemini-3.1-flash-image' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    const second = JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body));
    expect(first.generationConfig.imageConfig).toEqual({ aspectRatio: '1:1', imageSize: '4K' });
    expect(second.generationConfig.imageConfig).toEqual({ aspectRatio: '1:1' });
    // The key travels in the header, never the URL.
    expect(String(fetchSpy.mock.calls[0][0])).not.toContain('test-key');
  });

  test('a 1K request is never retried, and any other failure is a null — never a throw', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(reply(400, {}));
    await expect(generateGeminiImage({ prompt: 'p', imageSize: '1K' })).resolves.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockResolvedValue(reply(402, {}));
    await expect(generateGeminiImage({ prompt: 'p', imageSize: '4K' })).resolves.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2); // a 402 is not a size problem: no retry
  });
});
