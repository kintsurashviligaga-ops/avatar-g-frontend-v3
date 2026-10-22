/** @jest-environment node */
/**
 * lib/ai/llmText.ts — Gemini ONLY (PROJECT_MASTER R7, "NO SILENT FALLBACK"; provider policy: Google + ElevenLabs).
 *
 * ⚠️ This used to be a chain — DeepSeek direct → DeepSeek via Atlas → Gemini → Anthropic — so a Gemini miss was silently
 * answered by a forbidden vendor. Pinned here: Gemini is the only provider whatever the routing flags say, and a Gemini miss
 * (an error, an empty reply, Vertex AI not configured) is null, the "no result" the callers already handle. Every other vendor is mocked to
 * SUCCEED (and Anthropic's constructor is a spy), so a reinstated fallback would turn each `null` below into its text.
 * The two callers named in the change (the deck outline, the dubbing translation) are run against the real helper to show
 * they still end on their deterministic fallbacks. No network, no spend.
 */
jest.mock('server-only', () => ({}));

const mockGemini = jest.fn();
jest.mock('../gemini/client', () => ({ generateWithGemini: (...a: unknown[]) => mockGemini(...a) }));
const mockBudgetAllows = jest.fn();
const mockBook = jest.fn();
jest.mock('../services/billing/chatBudget', () => ({
  chatBudgetAllows: (...a: unknown[]) => mockBudgetAllows(...a),
  bookChatUsage: (...a: unknown[]) => mockBook(...a),
}));
const mockReliability = jest.fn();
jest.mock('../observability/reliability', () => ({ reportReliability: (...a: unknown[]) => mockReliability(...a) }));

// The forbidden vendors — configured and answering, so only their absence from the code keeps them out.
const mockDeepseek = jest.fn(async () => 'deepseek text');
jest.mock('./deepseekClient', () => ({ deepseekConfigured: () => true, deepseekChat: () => mockDeepseek() }));
const mockAtlas = jest.fn(async () => 'atlas text');
jest.mock('./atlasClient', () => ({ atlasConfigured: () => true, atlasChat: () => mockAtlas() }));
const mockClaudeCreate = jest.fn(async () => ({ content: [{ type: 'text', text: 'claude text' }] }));
const mockAnthropicCtor = jest.fn(() => ({ messages: { create: mockClaudeCreate } }));
jest.mock('@anthropic-ai/sdk', () => ({ __esModule: true, default: function Anthropic() { return mockAnthropicCtor(); } }));

import { llmText, type LlmTextOpts } from './llmText';
import { generateOutline } from '../services/presentation/deckOutline';
import { fallbackOutline, type DeckRequest } from '../services/presentation/deckPlan';
import { translateSegments } from '../services/dubbing/translateSegments';

const ENV = { ...process.env };
// Vertex AI is the only transport (v3.1): the real gate reads these; an AI Studio key is neither needed nor enough.
const VERTEX_ENV = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.GEMINI_TRANSPORT;
  Object.assign(process.env, VERTEX_ENV);
  mockBudgetAllows.mockResolvedValue(true);
  mockGemini.mockResolvedValue({ text: 'gemini text', model: 'gemini-2.5-flash' });
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
  process.env.ATLAS_API_KEY = 'test-atlas-key';
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...ENV };
});

function expectNoOtherVendor() {
  expect(mockDeepseek).not.toHaveBeenCalled();
  expect(mockAtlas).not.toHaveBeenCalled();
  expect(mockAnthropicCtor).not.toHaveBeenCalled();
  expect(mockClaudeCreate).not.toHaveBeenCalled();
}

const ROUTING: Array<[string, Partial<LlmTextOpts>]> = [
  ['no flag', {}],
  ['geminiFirst', { geminiFirst: true }],
  ['googleOnly: true', { googleOnly: true }],
  ['googleOnly: false (the old kill switch)', { googleOnly: false }],
];

describe('what a call used (Agent G PART 5, G3/G7)', () => {
  const REPORTED = { text: 'gemini text', model: 'gemini-2.5-flash', tokensIn: 1200, tokensOut: 80, tokensCached: 1024, tokensThinking: 0, tokensTotal: 1280, latencyMs: 420 };

  test('Gemini\'s own counts are booked, cache hits included, under the serving model', async () => {
    mockGemini.mockResolvedValue(REPORTED);
    await llmText({ user: 'hello', system: 'sys' });
    expect(mockBook).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash', inputTokens: 1200, outputTokens: 80, totalTokens: 1280, cachedInputTokens: 1024,
      inputChars: 'sys hello'.length, chars: 'gemini text'.length,
    });
  });

  test('onUsage hears each answered call: tokens, cache hits, latency and an estimated cost', async () => {
    mockGemini.mockResolvedValue(REPORTED);
    const onUsage = jest.fn();
    await llmText({ user: 'hello', system: 'sys', onUsage });
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage.mock.calls[0][0]).toMatchObject({ model: 'gemini-2.5-flash', tokensIn: 1200, tokensOut: 80, tokensCached: 1024, latencyMs: 420 });
    expect(onUsage.mock.calls[0][0].costUsd).toBeGreaterThan(0);
  });

  test('a miss is not a call that used anything, and a throwing listener does not lose the answer', async () => {
    const onUsage = jest.fn(() => { throw new Error('meter broke'); });
    mockGemini.mockResolvedValue({ text: '', model: 'gemini-2.5-flash' });
    expect(await llmText({ user: 'x', onUsage })).toBeNull();
    expect(onUsage).not.toHaveBeenCalled();
    mockGemini.mockResolvedValue(REPORTED);
    expect(await llmText({ user: 'x', onUsage })).toBe('gemini text');
    expect(onUsage).toHaveBeenCalledTimes(1);
  });
});

describe('Gemini answers', () => {
  test.each(ROUTING)('%s → Gemini\'s text, booked and reported as gemini', async (_label, flags) => {
    expect(await llmText({ user: 'hello', system: 'sys', ...flags })).toBe('gemini text');
    expect(mockGemini).toHaveBeenCalledTimes(1);
    expect(mockGemini.mock.calls[0][0]).toMatchObject({ prompt: 'hello', systemPrompt: 'sys', tier: 'flash', maxTokens: 2000, temperature: 0.6, thinkingBudget: 0 });
    // Booked under the model that served, with the characters standing in for the counts this mock did not report.
    expect(mockBook).toHaveBeenCalledWith({ model: 'gemini-2.5-flash', inputChars: 'sys hello'.length, chars: 'gemini text'.length });
    expect(mockReliability).toHaveBeenCalledWith({ surface: 'llm.text', providerServed: 'gemini', fallbackDepth: 0, degraded: false });
    expectNoOtherVendor();
  });

  test('the Gemini options reach the call: model, timeout, JSON mode; Search grounding only without JSON', async () => {
    await llmText({ user: 'u', geminiModel: 'gemini-2.5-pro', timeoutMs: 12_000, json: true, googleSearch: true });
    expect(mockGemini.mock.calls[0][0]).toMatchObject({ model: 'gemini-2.5-pro', timeoutMs: 12_000, responseMimeType: 'application/json' });
    expect(mockGemini.mock.calls[0][0]).not.toHaveProperty('googleSearch');
    await llmText({ user: 'u', googleSearch: true });
    expect(mockGemini.mock.calls[1][0]).toMatchObject({ googleSearch: true });
  });
});

describe('Gemini misses → null, and no other provider is tried (R7)', () => {
  test.each(ROUTING)('%s · Gemini throws → null', async (_label, flags) => {
    mockGemini.mockRejectedValue(new Error('Gemini 503'));
    expect(await llmText({ user: 'hello', ...flags })).toBeNull();
    expect(mockGemini).toHaveBeenCalledTimes(1);
    expectNoOtherVendor();
    expect(mockBook).not.toHaveBeenCalled();
    expect(mockReliability).toHaveBeenCalledWith({ surface: 'llm.text', providerServed: null, fallbackDepth: 1, degraded: true });
  });

  test('Gemini answers blank text → null', async () => {
    mockGemini.mockResolvedValue({ text: '   ', model: 'gemini-2.5-flash' });
    expect(await llmText({ user: 'hello', geminiFirst: true })).toBeNull();
    expectNoOtherVendor();
  });

  test('Vertex AI not configured → null without calling Gemini or anyone else, an AI Studio key or not', async () => {
    delete process.env.GCP_PROJECT_ID;
    process.env.GEMINI_API_KEY = 'ai-studio-key';
    expect(await llmText({ user: 'hello' })).toBeNull();
    expect(mockGemini).not.toHaveBeenCalled();
    expectNoOtherVendor();
  });

  test('GEMINI_TRANSPORT=gemini_api → null before any call', async () => {
    process.env.GEMINI_TRANSPORT = 'gemini_api';
    process.env.GEMINI_API_KEY = 'ai-studio-key';
    expect(await llmText({ user: 'hello' })).toBeNull();
    expect(mockGemini).not.toHaveBeenCalled();
    expectNoOtherVendor();
  });

  test('the budget guard refuses → null before any provider', async () => {
    mockBudgetAllows.mockResolvedValue(false);
    expect(await llmText({ user: 'hello' })).toBeNull();
    expect(mockGemini).not.toHaveBeenCalled();
    expectNoOtherVendor();
  });
});

describe('the callers keep working on null', () => {
  beforeEach(() => mockGemini.mockRejectedValue(new Error('Gemini down')));

  test('deckOutline: two Gemini misses → the deterministic skeleton deck (usedFallback), never another vendor', async () => {
    const req: DeckRequest = { topic: 'Tbilisi coffee', slideCount: 5, language: 'en', theme: 'dark', withImages: false };
    const out = await generateOutline(req);
    expect(out).toEqual({ slides: fallbackOutline(req), usedFallback: true });
    expect(mockGemini).toHaveBeenCalledTimes(2); // the first try and its one retry, both on Gemini
    expectNoOtherVendor();
  });

  test('translateSegments: a Gemini miss leaves every line in its source language, timings untouched', async () => {
    const segs = [
      { startSec: 0, endSec: 1.5, text: 'Hello there.' },
      { startSec: 1.5, endSec: 3, text: 'How are you?', speaker: 'B' },
    ];
    const out = await translateSegments(segs, 'ka', 'en');
    expect(out.untranslated).toBe(2);
    expect(out.segments).toEqual(segs.map((s) => ({ ...s, translated: s.text })));
    // The batch call, then one call per line — every one of them Gemini.
    expect(mockGemini).toHaveBeenCalledTimes(3);
    expectNoOtherVendor();
  });
});

describe('a miss says why in the logs', () => {
  test('an empty reply logs its finishReason (MAX_TOKENS used to look like a dead key)', async () => {
    mockGemini.mockResolvedValue({ text: '', model: 'gemini-3.8-flash', finishReason: 'MAX_TOKENS' });
    await expect(llmText({ user: 'brief', json: true, maxTokens: 20 })).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith('[llmText] Gemini returned no text', { model: 'gemini-3.8-flash', finishReason: 'MAX_TOKENS', maxTokens: 20 });
  });

  test('a thrown call logs its message, cut to 300 characters', async () => {
    mockGemini.mockRejectedValue(new Error(`Gemini API error 400: ${'x'.repeat(1000)}`));
    await expect(llmText({ user: 'brief' })).resolves.toBeNull();
    const call = (console.warn as jest.Mock).mock.calls.find((c) => c[0] === '[llmText] Gemini call failed');
    expect(call?.[1].message).toMatch(/^Gemini API error 400: x+$/);
    expect(call?.[1].message.length).toBe(300);
    expectNoOtherVendor();
  });
});
