/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('openai', () => jest.fn(() => ({})));
jest.mock('replicate', () => jest.fn(() => ({})));

import OpenAI from 'openai';
import Replicate from 'replicate';
import { OpenAIProvider } from './openai';
import { OpenRouterProvider } from './openrouter';
import { DeepSeekProvider } from './deepseek';
import { StabilityAvatarProvider } from './stability';
import { ReplicateAvatarProvider } from './replicate';
import { atlasChat, atlasConfigured } from '../ai/atlasClient';
import { deepseekChat, deepseekConfigured } from '../ai/deepseekClient';
import { webSearch } from '../ai/webSearch';
import { generateText } from '../ai/openai';
import { generateImage } from '../ai/stability';
import { getOpenAIReply } from '../openai';
import { getReplicateClient, runReplicateModel, createPrediction, pollPrediction, pollUntilDone } from '../replicate/client';
import { klingConfigured, klingImageToVideo, klingVideoToVideo, klingSubmit, klingPoll, klingAuthOk } from '../ai/klingClient';
import { generateWorldLabsInterior } from '../worldlabs/client';
import { generateNanoBananaImage } from '../nanobanana/client';

const ENV = { ...process.env };
const DEPRECATED = { code: 'provider_deprecated' };
let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  for (const key of ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY', 'ATLAS_API_KEY', 'STABILITY_API_KEY', 'REPLICATE_API_TOKEN', 'NANOBANANA_API_KEY', 'WORLDLABS_API_KEY', 'TAVILY_API_KEY']) process.env[key] = 'legacy-credential';
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('A retired provider attempted network access'));
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(OpenAI).not.toHaveBeenCalled();
  expect(Replicate).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test.each([
  ['OpenAI', () => new OpenAIProvider()],
  ['OpenRouter', () => new OpenRouterProvider()],
  ['DeepSeek', () => new DeepSeekProvider()],
] as const)('%s adapters reject both generation and stream iteration without constructing a paid client', async (_name, create) => {
  const provider = create();
  expect(provider.isAvailable()).toBe(false);
  await expect(provider.generateText({ prompt: 'hello' })).rejects.toMatchObject(DEPRECATED);
  await expect(provider.streamText({ prompt: 'hello' }).next()).rejects.toMatchObject(DEPRECATED);
});

test.each([
  ['Stability', () => new StabilityAvatarProvider()],
  ['Replicate', () => new ReplicateAvatarProvider()],
] as const)('%s avatar adapters reject create and image editing despite legacy credentials', async (_name, create) => {
  const provider = create();
  expect(provider.isAvailable()).toBe(false);
  await expect(provider.generate({ prompt: 'portrait' })).rejects.toMatchObject(DEPRECATED);
  await expect(provider.imageToImage({ prompt: 'portrait', init_image: 'https://example.com/image.png' })).rejects.toMatchObject(DEPRECATED);
});

test('deprecated text/search fallback helpers stay inert even with legacy credentials', async () => {
  expect(atlasConfigured()).toBe(false);
  expect(deepseekConfigured()).toBe(false);
  await expect(atlasChat({ user: 'hello' })).resolves.toBeNull();
  await expect(deepseekChat({ user: 'hello' })).resolves.toBeNull();
  await expect(webSearch('current weather')).resolves.toBeNull();
});

test.each([
  ['legacy OpenAI text', () => generateText('hello')],
  ['legacy OpenAI assistant', () => getOpenAIReply('hello')],
  ['legacy Stability image', () => generateImage('portrait')],
  ['Replicate SDK run', () => runReplicateModel('owner/model', {})],
  ['Replicate create', () => createPrediction('owner/model', {})],
  ['Replicate poll', () => pollPrediction('job-123')],
  ['Replicate poll loop', () => pollUntilDone('job-123')],
  ['Kling image video', () => klingImageToVideo({ imageUrl: 'https://example.com/image.png', prompt: 'hello' })],
  ['Kling video edit', () => klingVideoToVideo({ imageUrl: 'https://example.com/image.png', videoUrl: 'https://example.com/video.mp4', prompt: 'hello' })],
  ['Kling submit', () => klingSubmit({ imageUrl: 'https://example.com/image.png', prompt: 'hello' })],
  ['Kling poll', () => klingPoll('job-123')],
  ['Kling auth probe', () => klingAuthOk()],
  ['WorldLabs interior', () => generateWorldLabsInterior({ imageDataUrl: 'data:image/png;base64,YQ==', prompt: 'hello' })],
  ['NanoBanana external API', () => generateNanoBananaImage({ prompt: 'hello' })],
] as const)('%s rejects before any credentials, SDK or fetch are used', async (_name, run) => {
  await expect(run()).rejects.toMatchObject(DEPRECATED);
});

test('direct legacy SDK access cannot bypass the provider policy', () => {
  expect(() => getReplicateClient()).toThrow(expect.objectContaining(DEPRECATED));
  expect(klingConfigured()).toBe(false);
});
