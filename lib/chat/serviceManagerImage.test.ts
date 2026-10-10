/** @jest-environment node */
/**
 * ServiceManager's image legs: NO SILENT FALLBACK TO ANOTHER OUTSIDE PROVIDER (the owner, 2026-10-09). The cascade was
 * Imagen → FLUX → NanoBanana → FLUX → Grok; a job now runs one outside engine at most, and a miss may move only to
 * Google's own image model (lib/ai/geminiImage). Every engine is mocked — no network, no spend — so a regression shows
 * up as a call to an engine that must not run.
 */
jest.mock('server-only', () => ({}));
jest.mock('../ai/geminiImagen', () => ({
  hasGeminiImagenProvider: jest.fn(() => false),
  generateImagenImages: jest.fn(async () => null),
  geminiImagenModel: jest.fn(() => 'imagen-4.0-generate-001'),
}));
jest.mock('../ai/geminiImage', () => ({ generateGeminiImage: jest.fn() }));
jest.mock('../ai/google/transport', () => ({ ...jest.requireActual('../ai/google/transport'), googleTransportBlocker: jest.fn(() => null) }));
jest.mock('../nanobanana/client', () => ({ generateNanoBananaImage: jest.fn() }));
jest.mock('../ai/xaiImage', () => ({ generateGrokImage: jest.fn(), hasXaiApiKey: jest.fn(() => true) }));
jest.mock('../replicate/client', () => ({ createPrediction: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../orchestrator/storage-adapter', () => ({
  uploadAndSign: jest.fn(async () => 'https://x.supabase.co/storage/v1/object/sign/renders/gemini.png?token=t'),
  uploadBufferAndSign: jest.fn(async () => 'https://x.supabase.co/storage/v1/object/sign/renders/imagen.png?token=t'),
  createSignedAssetUrl: jest.fn(),
  removeStorageObjects: jest.fn(async () => undefined),
}));
jest.mock('../services/billing/guardedCall', () => ({
  BudgetExceededError: class extends Error {},
  guardedCall: jest.fn(async (_o: unknown, fn: () => Promise<unknown>) => fn()),
}));
jest.mock('../video/remixOps', () => ({ stripBottomWatermark: jest.fn() }));
jest.mock('../ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));

import { ServiceManager, type ServiceManagerRequest } from './ServiceManager';
import { generateImagenImages, hasGeminiImagenProvider } from '../ai/geminiImagen';
import { generateGeminiImage } from '../ai/geminiImage';
import { googleTransportBlocker } from '../ai/google/transport';
import { generateNanoBananaImage } from '../nanobanana/client';
import { generateGrokImage } from '../ai/xaiImage';
import { createPrediction } from '../replicate/client';

const imagenOn = hasGeminiImagenProvider as jest.Mock;
const imagen = generateImagenImages as jest.Mock;
const gemini = generateGeminiImage as jest.Mock;
const blocker = googleTransportBlocker as jest.Mock;
const nano = generateNanoBananaImage as jest.Mock;
const grok = generateGrokImage as jest.Mock;
const flux = createPrediction as jest.Mock;

const req = (over: Partial<ServiceManagerRequest> = {}): ServiceManagerRequest => ({
  sessionId: 's1',
  serviceContext: 'image',
  intent: 'image_generation',
  userPrompt: 'a red bicycle on a cobbled street',
  selectedOptions: {},
  locale: 'en',
  confidence: 0.9,
  ...over,
} as ServiceManagerRequest);

const GEMINI_OK = { base64: 'aW1n', mimeType: 'image/png', model: 'gemini-3.1-flash-image' };

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.IMAGE_PRIMARY_PROVIDER;
  delete process.env.MEDIA_GOOGLE_ONLY;
  imagenOn.mockReturnValue(false);
  blocker.mockReturnValue(null);
  gemini.mockResolvedValue(GEMINI_OK);
});

describe('FLUX is the configured engine (the default)', () => {
  it('a FLUX miss moves to Google image — never NanoBanana, never Grok', async () => {
    flux.mockRejectedValue(new Error('replicate 503'));
    const r = await new ServiceManager().execute(req());
    expect(r.success).toBe(true);
    expect(r.metadata.imageProvider).toBe('gemini-image');
    expect(r.metadata.imageFallback).toBe('replicate->gemini-image');
    expect(nano).not.toHaveBeenCalled();
    expect(grok).not.toHaveBeenCalled();
  });

  it('a FLUX miss with no Google transport is an honest failure, with no other outside engine tried', async () => {
    flux.mockRejectedValue(new Error('replicate 503'));
    blocker.mockReturnValue('no key');
    const r = await new ServiceManager().execute(req());
    expect(r.success).toBe(false);
    expect(r.predictionStatus).toBe('failed');
    expect(r.message).not.toMatch(/replicate 503/); // the provider's internals stay in the log
    expect(gemini).not.toHaveBeenCalled();
    expect(nano).not.toHaveBeenCalled();
    expect(grok).not.toHaveBeenCalled();
  });

  it('a started FLUX prediction is the result: nothing else runs', async () => {
    flux.mockResolvedValue({ id: 'p1', status: 'starting' });
    const r = await new ServiceManager().execute(req());
    expect(r.success).toBe(true);
    expect(r.predictionId).toBeTruthy();
    expect(gemini).not.toHaveBeenCalled();
    expect(nano).not.toHaveBeenCalled();
  });
});

describe('NanoBanana is the configured engine', () => {
  beforeEach(() => { process.env.IMAGE_PRIMARY_PROVIDER = 'nanobanana'; });

  it('a NanoBanana 402 no longer fails over to FLUX or Grok; Google image may answer', async () => {
    nano.mockResolvedValue({ url: null, text: null, raw: { code: 402, msg: 'insufficient credits' } });
    const r = await new ServiceManager().execute(req());
    expect(flux).not.toHaveBeenCalled();
    expect(grok).not.toHaveBeenCalled();
    expect(r.success).toBe(true);
    expect(r.metadata.imageFallback).toBe('nanobanana->gemini-image');
  });

  it('with Google also unavailable, the NanoBanana error itself is returned', async () => {
    nano.mockResolvedValue({ url: null, text: null, raw: { code: 402, msg: 'insufficient credits' } });
    blocker.mockReturnValue('no key');
    const r = await new ServiceManager().execute(req());
    expect(r.success).toBe(false);
    expect(r.provider).toBe('nanobanana');
    expect(flux).not.toHaveBeenCalled();
    expect(grok).not.toHaveBeenCalled();
  });
});

describe('Imagen (opt-in) is the engine', () => {
  beforeEach(() => { imagenOn.mockReturnValue(true); });

  it('an Imagen miss moves to Google image, never to FLUX or NanoBanana', async () => {
    imagen.mockResolvedValue(null);
    const r = await new ServiceManager().execute(req());
    expect(r.success).toBe(true);
    expect(r.metadata.imageFallback).toBe('imagen->gemini-image');
    expect(flux).not.toHaveBeenCalled();
    expect(nano).not.toHaveBeenCalled();
  });

  it('Imagen and Google image both missing is an honest failure', async () => {
    imagen.mockResolvedValue(null);
    gemini.mockResolvedValue(null);
    const r = await new ServiceManager().execute(req());
    expect(r.success).toBe(false);
    expect(flux).not.toHaveBeenCalled();
    expect(nano).not.toHaveBeenCalled();
    expect(grok).not.toHaveBeenCalled();
  });
});

it("a photo edit sends the photo to Google image and requires it to load (an edit never becomes an unrelated image)", async () => {
  flux.mockRejectedValue(new Error('down'));
  await new ServiceManager().execute(req({ imageUrl: 'https://x.supabase.co/me.jpg' }));
  expect(gemini).toHaveBeenCalledWith(expect.objectContaining({ referenceImages: ['https://x.supabase.co/me.jpg'], requireReferences: true }));
});

describe('MEDIA_GOOGLE_ONLY on — no outside engine runs, whatever is configured or picked', () => {
  beforeEach(() => { process.env.MEDIA_GOOGLE_ONLY = '1'; });
  afterAll(() => { delete process.env.MEDIA_GOOGLE_ONLY; });

  it('the configured NanoBanana is skipped; Google image answers', async () => {
    process.env.IMAGE_PRIMARY_PROVIDER = 'nanobanana';
    const r = await new ServiceManager().execute(req());
    expect(r.success).toBe(true);
    expect(r.metadata.imageFallback).toBe('google-only->gemini-image');
    expect(nano).not.toHaveBeenCalled();
    expect(flux).not.toHaveBeenCalled();
    expect(grok).not.toHaveBeenCalled();
  });

  it('an explicit FLUX pick does not reach FLUX', async () => {
    await new ServiceManager().execute(req({ selectedOptions: { imageModel: 'flux' } }));
    expect(flux).not.toHaveBeenCalled();
    expect(gemini).toHaveBeenCalled();
  });

  it('Imagen (when enabled) runs first for a prompt-only request', async () => {
    imagenOn.mockReturnValue(true);
    imagen.mockResolvedValue([{ base64: 'aW1n', mimeType: 'image/png' }]);
    await new ServiceManager().execute(req());
    expect(imagen).toHaveBeenCalled();
    expect(flux).not.toHaveBeenCalled();
    expect(nano).not.toHaveBeenCalled();
  });

  it('Google unavailable is an honest failure, not an outside engine', async () => {
    blocker.mockReturnValue('no key');
    const r = await new ServiceManager().execute(req());
    expect(r.success).toBe(false);
    expect(flux).not.toHaveBeenCalled();
    expect(nano).not.toHaveBeenCalled();
    expect(grok).not.toHaveBeenCalled();
  });
});

describe('MEDIA_GOOGLE_ONLY and the chat avatar (HeyGen)', () => {
  it('is refused before HeyGen is called, in the user\'s language', async () => {
    process.env.MEDIA_GOOGLE_ONLY = '1';
    process.env.HEYGEN_API_KEY = 'hg-test';
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
    try {
      const r = await new ServiceManager().execute(req({ intent: 'avatar_generation', serviceContext: 'avatar', userPrompt: 'Hello from Tbilisi' }));
      expect(r.success).toBe(false);
      expect(r.provider).toBe('heygen');
      expect(r.metadata.code).toBe('google_only');
      expect(r.message).toMatch(/Google/);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.HEYGEN_API_KEY;
    }
  });
});
