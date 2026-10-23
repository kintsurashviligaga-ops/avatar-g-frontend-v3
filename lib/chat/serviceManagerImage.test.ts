/** @jest-environment node */
/**
 * ServiceManager's image legs: GOOGLE ONLY (MASTER TASK v3.1, audit F-04). The cascade was Imagen → FLUX → NanoBanana →
 * FLUX → Grok; a chat image now runs on Imagen (prompt-only, when enabled) or Google's own image model
 * (lib/ai/geminiImage), whatever was configured or picked and whatever MEDIA_GOOGLE_ONLY says. Every engine is mocked —
 * no network, no spend — so a regression shows up as a call to an engine that must not run. The NanoBanana and Grok
 * clients are gone (PR 20): a call to either would have to reach the network, which the spy below refuses and records.
 */
jest.mock('server-only', () => ({}));
jest.mock('../ai/geminiImagen', () => ({
  hasGeminiImagenProvider: jest.fn(() => false),
  generateImagenImages: jest.fn(async () => null),
  geminiImagenModel: jest.fn(() => 'imagen-4.0-generate-001'),
}));
jest.mock('../ai/geminiImage', () => ({ generateGeminiImage: jest.fn() }));
jest.mock('../ai/google/transport', () => ({ ...jest.requireActual('../ai/google/transport'), googleTransportBlocker: jest.fn(() => null) }));
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
import { createPrediction } from '../replicate/client';

const imagenOn = hasGeminiImagenProvider as jest.Mock;
const imagen = generateImagenImages as jest.Mock;
const gemini = generateGeminiImage as jest.Mock;
const blocker = googleTransportBlocker as jest.Mock;
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

const ENV = { ...process.env };
/** Any request that reached NanoBanana or xAI (Grok) — the spy refuses it, so a call shows up here. */
const resellerCalls = () => jest.mocked(fetch).mock.calls.filter(([u]) => /nanobananaapi\.ai|api\.x\.ai/.test(String(u)));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  delete process.env.IMAGE_PRIMARY_PROVIDER;
  delete process.env.MEDIA_GOOGLE_ONLY;
  delete process.env.OUTSIDE_ENGINES_APPROVED;
  imagenOn.mockReturnValue(false);
  blocker.mockReturnValue(null);
  gemini.mockResolvedValue(GEMINI_OK);
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...ENV };
});

function expectNoOutsideEngine(): void {
  expect(flux).not.toHaveBeenCalled();
  expect(resellerCalls()).toEqual([]);
}

describe('no outside engine runs, whatever is configured, picked or set', () => {
  it.each([
    {},
    { IMAGE_PRIMARY_PROVIDER: 'nanobanana' },
    { IMAGE_PRIMARY_PROVIDER: 'replicate', MEDIA_GOOGLE_ONLY: '0' },
    { IMAGE_PRIMARY_PROVIDER: 'nanobanana', MEDIA_GOOGLE_ONLY: 'false', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-nanobanana' },
  ])('Google image answers (%o)', async (env) => {
    Object.assign(process.env, env);
    const r = await new ServiceManager().execute(req());
    expect(r.success).toBe(true);
    expect(r.metadata.imageProvider).toBe('gemini-image');
    expect(r.metadata.imageFallback).toBe('google-only->gemini-image');
    expectNoOutsideEngine();
  });

  it('an explicit FLUX pick does not reach FLUX', async () => {
    process.env.MEDIA_GOOGLE_ONLY = '0';
    process.env.OUTSIDE_ENGINES_APPROVED = 'owner-2026-10-20-replicate';
    await new ServiceManager().execute(req({ selectedOptions: { imageModel: 'flux' } }));
    expectNoOutsideEngine();
    expect(gemini).toHaveBeenCalled();
  });

  it('Google unavailable is an honest failure, not an outside engine', async () => {
    blocker.mockReturnValue('no key');
    const r = await new ServiceManager().execute(req());
    expect(r.success).toBe(false);
    expect(r.predictionStatus).toBe('failed');
    expect(gemini).not.toHaveBeenCalled();
    expectNoOutsideEngine();
  });
});

describe('Imagen (opt-in) is the engine', () => {
  beforeEach(() => { imagenOn.mockReturnValue(true); });

  it('runs first for a prompt-only request', async () => {
    imagen.mockResolvedValue([{ base64: 'aW1n', mimeType: 'image/png' }]);
    await new ServiceManager().execute(req());
    expect(imagen).toHaveBeenCalled();
    expect(gemini).not.toHaveBeenCalled();
    expectNoOutsideEngine();
  });

  it('an Imagen miss moves to Google image, never to FLUX or NanoBanana', async () => {
    imagen.mockResolvedValue(null);
    const r = await new ServiceManager().execute(req());
    expect(r.success).toBe(true);
    expect(r.metadata.imageProvider).toBe('gemini-image');
    expectNoOutsideEngine();
  });

  it('Imagen and Google image both missing is an honest failure', async () => {
    imagen.mockResolvedValue(null);
    gemini.mockResolvedValue(null);
    const r = await new ServiceManager().execute(req());
    expect(r.success).toBe(false);
    expectNoOutsideEngine();
  });
});

it("a photo edit sends the photo to Google image and requires it to load (an edit never becomes an unrelated image)", async () => {
  await new ServiceManager().execute(req({ imageUrl: 'https://x.supabase.co/me.jpg' }));
  expect(gemini).toHaveBeenCalledWith(expect.objectContaining({ referenceImages: ['https://x.supabase.co/me.jpg'], requireReferences: true }));
  expectNoOutsideEngine();
});

describe('the chat avatar (HeyGen)', () => {
  it.each([
    {},
    { MEDIA_GOOGLE_ONLY: '0', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-heygen' },
  ])('is refused before HeyGen is called, in the user\'s language (%o)', async (env) => {
    Object.assign(process.env, env, { HEYGEN_API_KEY: 'hg-test' });
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
    }
  });
});
