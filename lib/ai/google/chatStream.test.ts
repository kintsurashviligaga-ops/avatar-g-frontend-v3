/**
 * @jest-environment node
 */
// ai@6 streamText is built on WHATWG streams (ReadableStream / TransformStream), which Node has and jsdom does not.

import { APICallError, simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import type { ChatFrame } from '@/lib/chat/sse';

// ─── Provider mock ───────────────────────────────────────────────────────────
// Real `streamText` from ai, fake models: every network call is replaced by a MockLanguageModelV3 keyed by
// model id, so the SUT's fullStream handling runs against the genuine ai@6 pipeline.

const mockModels = new Map<string, MockLanguageModelV3>();
const mockCreateGoogle = jest.fn();

jest.mock('@ai-sdk/google', () => {
  const actual = jest.requireActual('@ai-sdk/google');
  return {
    ...actual,
    createGoogleGenerativeAI: (opts: unknown) => {
      mockCreateGoogle(opts);
      const provider = (id: string) => {
        const m = mockModels.get(id);
        if (!m) throw new Error(`test: no mock registered for ${id}`);
        return m;
      };
      provider.tools = actual.google.tools;
      return provider;
    },
  };
});

// eslint-disable-next-line import/first
import {
  streamGeminiChat,
  chatToolsFor,
  classifyChatError,
  unbookedAttempts,
  thinkingConfigFor,
  sanitizeSafetySettings,
  servedModelOf,
  samplingFor,
  isTransientFailure,
  type GeminiChatConfig,
  type StreamGeminiChatInput,
} from './chatStream';
// eslint-disable-next-line import/first
import { decodeFrames, encodeFrame } from '@/lib/chat/sse';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const USAGE = {
  inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: undefined },
  outputTokens: { total: 7, text: 7, reasoning: 0 },
};

function finishPart(unified: 'stop' | 'length' | 'content-filter' | 'other' | 'error' = 'stop', raw = 'STOP', providerMetadata?: Record<string, Record<string, unknown>>): LanguageModelV3StreamPart {
  return {
    type: 'finish',
    finishReason: { unified, raw },
    usage: USAGE,
    ...(providerMetadata ? { providerMetadata: providerMetadata as never } : {}),
  } as LanguageModelV3StreamPart;
}

function textParts(chunks: string[]): LanguageModelV3StreamPart[] {
  return [
    { type: 'text-start', id: 't0' },
    ...chunks.map((delta) => ({ type: 'text-delta', id: 't0', delta }) as LanguageModelV3StreamPart),
    { type: 'text-end', id: 't0' },
  ];
}

function streamModel(parts: LanguageModelV3StreamPart[], chunkDelayInMs: number | null = null): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [{ type: 'stream-start', warnings: [] } as LanguageModelV3StreamPart, ...parts],
        initialDelayInMs: null,
        chunkDelayInMs,
      }),
    }),
  });
}

function failingModel(err: unknown): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: async () => {
      throw err;
    },
  });
}

function apiError(statusCode: number | undefined, message: string, googleStatus = ''): APICallError {
  return new APICallError({
    message,
    url: 'https://generativelanguage.googleapis.com/v1beta/models/x:streamGenerateContent?alt=sse',
    requestBodyValues: {},
    statusCode,
    responseBody: JSON.stringify({ error: { code: statusCode ?? null, message, status: googleStatus } }),
    data: { error: { code: statusCode ?? null, message, status: googleStatus } },
  });
}

const BASE_CONFIG: GeminiChatConfig = {
  system: 'You are a helpful assistant.',
  temperature: 0.7,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 4096,
  safetySettings: [],
  googleSearch: true,
};

function run(models: string[], overrides: Partial<StreamGeminiChatInput> = {}) {
  const frames: ChatFrame[] = [];
  const promise = streamGeminiChat({
    apiKey: 'test-key',
    models,
    messages: [{ role: 'user', content: 'hello' }],
    config: BASE_CONFIG,
    onFrame: (f) => {
      frames.push(f);
    },
    ...overrides,
  });
  return { frames, promise };
}

/** The routing shape of `attempts` (model + code); what each attempt billed is asserted where it matters. */
const shape = (attempts: Array<{ model: string; code?: string; usage?: unknown; groundingQueries?: number }>) =>
  attempts.map(({ usage: _u, groundingQueries: _g, ...rest }) => rest);
const textOf = (frames: ChatFrame[]) => frames.map((f) => ('text' in f ? f.text : '')).join('');
const kinds = (frames: ChatFrame[]) => frames.map((f) => Object.keys(f)[0]);

let warnSpy: jest.SpyInstance;
beforeEach(() => {
  mockModels.clear();
  mockCreateGoogle.mockClear();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
});

// ─── streamGeminiChat ────────────────────────────────────────────────────────

describe('streamGeminiChat — happy path', () => {
  it('streams meta once, every text delta, then usage; reports the answering model', async () => {
    mockModels.set('gemini-3.8-flash', streamModel([...textParts(['Hel', 'lo', '!']), finishPart()]));
    const { frames, promise } = run(['gemini-3.8-flash']);
    const res = await promise;

    expect(res.ok).toBe(true);
    expect(res.model).toBe('gemini-3.8-flash');
    expect(res.text).toBe('Hello!');
    expect(shape(res.attempts)).toEqual([{ model: 'gemini-3.8-flash' }]);
    expect(res.error).toBeUndefined();
    expect(kinds(frames)).toEqual(['meta', 'text', 'text', 'text', 'usage']);
    expect(frames[0]).toEqual({ meta: { provider: 'gemini', model: 'gemini-3.8-flash' } });
    expect(textOf(frames)).toBe('Hello!');
    expect(frames[frames.length - 1]).toEqual({ usage: { model: 'gemini-3.8-flash', inputTokens: 12, outputTokens: 7, totalTokens: 19 } });
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 7, totalTokens: 19 });
    // The shared factory (lib/ai/google/provider) also hands the SDK its provider-local fetch (redirect: 'manual', so the
    // key is never forwarded across a redirect).
    expect(mockCreateGoogle).toHaveBeenCalledWith({ apiKey: 'test-key', fetch: expect.any(Function) });
  });

  it('emits one deduped, http(s)-only sources frame at the end, before usage, and counts grounding queries', async () => {
    const source = (url: string, title?: string) =>
      ({ type: 'source', sourceType: 'url', id: url, url, ...(title ? { title } : {}) }) as LanguageModelV3StreamPart;
    mockModels.set(
      'gemini-3.8-flash',
      streamModel([
        source('https://a.example/1', 'A'),
        ...textParts(['answer']),
        source('https://a.example/1', 'A again'),
        source('javascript:alert(1)', 'evil'),
        source('https://b.example/2'),
        finishPart('stop', 'STOP', { google: { groundingMetadata: { webSearchQueries: ['q1', 'q2'] } } }),
      ]),
    );
    const { frames, promise } = run(['gemini-3.8-flash']);
    const res = await promise;

    expect(res.ok).toBe(true);
    const expected = [{ url: 'https://a.example/1', title: 'A' }, { url: 'https://b.example/2' }];
    expect(res.sources).toEqual(expected);
    expect(res.groundingQueries).toBe(2);
    expect(kinds(frames)).toEqual(['meta', 'text', 'sources', 'usage']);
    expect(frames.filter((f) => 'sources' in f)).toEqual([{ sources: expected }]);
  });

  it('passes the sampling config, the search tool and the sanitized provider options to the model', async () => {
    const model = streamModel([...textParts(['ok']), finishPart()]);
    mockModels.set('gemini-2.5-flash', model);
    const { promise } = run(['gemini-2.5-flash'], {
      config: {
        ...BASE_CONFIG,
        thinking: { level: 'off' },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'NOT_A_CATEGORY', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      },
    });
    await promise;

    const call = model.doStreamCalls[0]!;
    expect(call.temperature).toBe(0.7);
    expect(call.topP).toBe(0.95);
    expect(call.topK).toBe(40);
    expect(call.maxOutputTokens).toBe(4096);
    expect(call.tools?.map((t) => (t.type === 'provider' ? t.id : t.name))).toEqual(['google.google_search']);
    expect(call.includeRawChunks).toBe(true);
    expect(call.providerOptions).toEqual({
      google: {
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const prompt = call.prompt;
    expect(prompt[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
  });

  it('omits temperature when the config leaves it out (Thinking / Pro keep the Gemini 3 default of 1.0)', async () => {
    const model = streamModel([...textParts(['ok']), finishPart()]);
    mockModels.set('gemini-3.1-pro-preview', model);
    const { temperature: _t, ...noTemperature } = BASE_CONFIG;
    await run(['gemini-3.1-pro-preview'], { config: { ...noTemperature, thinking: { level: 'high' }, maxOutputTokens: 8192 } }).promise;
    const call = model.doStreamCalls[0]!;
    expect(call.temperature).toBeUndefined();
    expect(call.maxOutputTokens).toBe(8192);
    expect(call.providerOptions).toEqual({ google: { thinkingConfig: { thinkingLevel: 'high' } } });
  });

  it('sends no tools and no providerOptions when search is off and nothing is configured', async () => {
    const model = streamModel([...textParts(['ok']), finishPart()]);
    mockModels.set('gemini-3.8-flash', model);
    const { promise } = run(['gemini-3.8-flash'], { config: { ...BASE_CONFIG, googleSearch: false } });
    await promise;
    const call = model.doStreamCalls[0]!;
    expect(call.tools ?? []).toEqual([]);
    expect(call.providerOptions).toBeUndefined();
  });
});

describe('streamGeminiChat — tool selection (google_search, url_context)', () => {
  // ⚠️ url_context + google_search together on gemini-3.8-flash is UNVERIFIED live, and a 400 is `bad_request`, which
  // does not rotate — so url_context must be sent ONLY when the config says `urlContext: true` (the route sets it
  // behind GEMINI_CHAT_URL_CONTEXT=1 and only for a turn with a link; see lib/chat/urlContext.ts).
  const toolIds = (model: MockLanguageModelV3) =>
    (model.doStreamCalls[0]!.tools ?? []).map((t) => (t.type === 'provider' ? t.id : t.name));

  async function toolsSentFor(config: Partial<GeminiChatConfig>) {
    const model = streamModel([...textParts(['ok']), finishPart()]);
    mockModels.set('gemini-3.8-flash', model);
    await run(['gemini-3.8-flash'], { config: { ...BASE_CONFIG, ...config } }).promise;
    return toolIds(model);
  }

  it('urlContext: true sends url_context beside google_search', async () => {
    expect(await toolsSentFor({ urlContext: true })).toEqual(['google.google_search', 'google.url_context']);
  });

  it('urlContext without search sends url_context alone', async () => {
    expect(await toolsSentFor({ googleSearch: false, urlContext: true })).toEqual(['google.url_context']);
  });

  it('absent, false or a truthy non-boolean sends no url_context', async () => {
    expect(await toolsSentFor({})).toEqual(['google.google_search']);
    expect(await toolsSentFor({ urlContext: false })).toEqual(['google.google_search']);
    expect(await toolsSentFor({ urlContext: 'yes' as unknown as boolean })).toEqual(['google.google_search']);
  });

  it('every rotated attempt carries the same tools', async () => {
    const first = failingModel(apiError(503, 'The model is overloaded.', 'UNAVAILABLE'));
    const second = streamModel([...textParts(['ok']), finishPart()]);
    mockModels.set('gemini-3.8-flash', first);
    mockModels.set('gemini-3.6-flash', second);
    await run(['gemini-3.8-flash', 'gemini-3.6-flash'], { config: { ...BASE_CONFIG, urlContext: true } }).promise;
    expect(toolIds(second)).toEqual(['google.google_search', 'google.url_context']);
  });

  it('chatToolsFor is a pure selection over the provider tool factories', () => {
    const factories = { googleSearch: jest.fn(() => ({ kind: 'search' })), urlContext: jest.fn(() => ({ kind: 'url' })) };
    const f = factories as unknown as Parameters<typeof chatToolsFor>[1];
    expect(chatToolsFor({ googleSearch: false }, f)).toBeUndefined();
    expect(chatToolsFor({ googleSearch: true }, f)).toEqual({ google_search: { kind: 'search' } });
    expect(chatToolsFor({ googleSearch: true, urlContext: true }, f)).toEqual({ google_search: { kind: 'search' }, url_context: { kind: 'url' } });
    expect(factories.urlContext).toHaveBeenCalledWith({});
  });

  it('on the wire (the real @ai-sdk/google request builder, fetch mocked): tools = [{googleSearch}, {urlContext}]', async () => {
    const { createGoogleGenerativeAI } = jest.requireActual('@ai-sdk/google') as typeof import('@ai-sdk/google');
    const { streamText } = jest.requireActual('ai') as typeof import('ai');
    const bodies: Array<Record<string, unknown>> = [];
    const sse = 'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"ok"}]},"finishReason":"STOP"}]}\n\n';
    const fetch = jest.fn(async (_url: unknown, init?: { body?: unknown }) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    const google = createGoogleGenerativeAI({ apiKey: 'test-key', fetch: fetch as unknown as typeof globalThis.fetch });
    const result = streamText({
      model: google('gemini-3.8-flash'),
      prompt: 'read https://example.com',
      tools: chatToolsFor({ googleSearch: true, urlContext: true }, google.tools),
      maxRetries: 0,
    });
    let text = '';
    for await (const delta of result.textStream) text += delta;
    expect(text).toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodies[0]!.tools).toEqual([{ googleSearch: {} }, { urlContext: {} }]);
  });
});

describe('streamGeminiChat — rotation', () => {
  it('rotates to the next model on model_missing (404) and answers from it', async () => {
    mockModels.set('gemini-3.8-flash', failingModel(apiError(404, 'models/gemini-3.8-flash is not found for API version v1beta', 'NOT_FOUND')));
    mockModels.set('gemini-3.6-flash', streamModel([...textParts(['from ', 'second']), finishPart()]));
    const { frames, promise } = run(['gemini-3.8-flash', 'gemini-3.6-flash']);
    const res = await promise;

    expect(res.ok).toBe(true);
    expect(res.model).toBe('gemini-3.6-flash');
    expect(shape(res.attempts)).toEqual([{ model: 'gemini-3.8-flash', code: 'model_missing' }, { model: 'gemini-3.6-flash' }]);
    // The badge must not pretend the primary answered: a rotated attempt's meta says fallback.
    expect(frames[0]).toEqual({ meta: { provider: 'gemini', model: 'gemini-3.6-flash', fallback: true } });
    expect(textOf(frames)).toBe('from second');
    expect(frames.some((f) => 'error' in f)).toBe(false);
  });

  it('rotates when the failure arrives as an error PART in the stream (the case textStream used to drop)', async () => {
    mockModels.set('gemini-3.8-flash', streamModel([{ type: 'error', error: apiError(503, 'The model is overloaded.', 'UNAVAILABLE') }]));
    mockModels.set('gemini-2.5-flash', streamModel([...textParts(['ok']), finishPart()]));
    const res = await run(['gemini-3.8-flash', 'gemini-2.5-flash']).promise;
    expect(res.ok).toBe(true);
    expect(shape(res.attempts)).toEqual([{ model: 'gemini-3.8-flash', code: 'unavailable' }, { model: 'gemini-2.5-flash' }]);
  });

  it('rotates on rate_limited (a plain 429 is a per-model quota bucket)', async () => {
    mockModels.set(
      'gemini-3.8-flash',
      failingModel(apiError(429, 'You exceeded your current quota, please check your plan and billing details.', 'RESOURCE_EXHAUSTED')),
    );
    mockModels.set('gemini-3.6-flash', streamModel([...textParts(['ok']), finishPart()]));
    const res = await run(['gemini-3.8-flash', 'gemini-3.6-flash']).promise;
    expect(res.ok).toBe(true);
    expect(res.attempts[0]).toEqual({ model: 'gemini-3.8-flash', code: 'rate_limited' });
  });

  it('a text-less 200 that rotated is still reported as billed (usage on its attempt) — unbookedAttempts finds it', async () => {
    mockModels.set('gemini-3.8-flash', streamModel([finishPart('stop', 'STOP')]));
    mockModels.set('gemini-3.6-flash', streamModel([...textParts(['answer']), finishPart()]));
    const res = await run(['gemini-3.8-flash', 'gemini-3.6-flash']).promise;
    expect(res.ok).toBe(true);
    expect(res.attempts[0]).toMatchObject({ model: 'gemini-3.8-flash', code: 'unavailable', usage: { inputTokens: 12, outputTokens: 7 } });
    // The reported (last) attempt is booked from result.usage; only the EARLIER billed one is "unbooked".
    expect(unbookedAttempts(res).map((a) => a.model)).toEqual(['gemini-3.8-flash']);
    // A failure with nothing billed (a 404 before any response) is not booked.
    expect(unbookedAttempts({ attempts: [{ model: 'a', code: 'model_missing' }, { model: 'b' }] })).toEqual([]);
  });

  it('rotates past an empty 200 (no text, no error) and past a network failure', async () => {
    mockModels.set('gemini-3.8-flash', streamModel([finishPart('stop', 'STOP')]));
    mockModels.set('gemini-3.6-flash', failingModel(apiError(undefined, 'Cannot connect to API: ECONNRESET')));
    mockModels.set('gemini-2.5-flash', streamModel([...textParts(['third']), finishPart()]));
    const res = await run(['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-2.5-flash']).promise;
    expect(res.ok).toBe(true);
    expect(res.attempts.map((a) => a.code)).toEqual(['unavailable', 'network', undefined]);
  });

  it('does NOT rotate on quota (402 prepay depleted) — ends with a quota error frame', async () => {
    mockModels.set('gemini-3.8-flash', failingModel(apiError(402, 'Your prepayment credits are depleted.')));
    const second = streamModel([...textParts(['should not run']), finishPart()]);
    mockModels.set('gemini-3.6-flash', second);
    const { frames, promise } = run(['gemini-3.8-flash', 'gemini-3.6-flash']);
    const res = await promise;

    expect(res.ok).toBe(false);
    expect(res.error).toMatchObject({ code: 'quota', retryable: false, status: 402 });
    expect(shape(res.attempts)).toEqual([{ model: 'gemini-3.8-flash', code: 'quota' }]);
    expect(second.doStreamCalls).toHaveLength(0);
    expect(frames).toHaveLength(1);
    const err = frames[0] as Extract<ChatFrame, { error: unknown }>;
    expect(err.error.code).toBe('quota');
    expect(err.error.retryable).toBe(false);
    // Provider wording never reaches the browser.
    expect(err.error.message).not.toMatch(/prepay|credits|google/i);
  });

  it('does NOT rotate on auth (400 API_KEY_INVALID is an account problem, not a model problem)', async () => {
    mockModels.set('gemini-3.8-flash', failingModel(apiError(400, 'API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT')));
    const second = streamModel([...textParts(['nope']), finishPart()]);
    mockModels.set('gemini-3.6-flash', second);
    const res = await run(['gemini-3.8-flash', 'gemini-3.6-flash']).promise;
    expect(res.error?.code).toBe('auth');
    expect(second.doStreamCalls).toHaveLength(0);
  });

  it('ends with the LAST model’s error when every model in the chain fails with a rotatable code', async () => {
    mockModels.set('gemini-3.8-flash', failingModel(apiError(404, 'not found for API version v1beta', 'NOT_FOUND')));
    mockModels.set('gemini-3.6-flash', failingModel(apiError(503, 'overloaded', 'UNAVAILABLE')));
    const { frames, promise } = run(['gemini-3.8-flash', 'gemini-3.6-flash']);
    const res = await promise;
    expect(res.ok).toBe(false);
    expect(res.model).toBe('gemini-3.6-flash');
    expect(res.error).toMatchObject({ code: 'unavailable', retryable: true, status: 503 });
    expect(kinds(frames)).toEqual(['error']);
  });
});

describe('streamGeminiChat — the model that actually answered', () => {
  const raw = (rawValue: Record<string, unknown>) => ({ type: 'raw', rawValue }) as LanguageModelV3StreamPart;

  it('an alias names its real model in the FIRST meta frame (the version rides the first chunk)', async () => {
    mockModels.set(
      'gemini-pro-latest',
      streamModel([raw({ modelVersion: 'gemini-3.1-pro-preview' }), ...textParts(['ans', 'wer']), finishPart()]),
    );
    const { frames, promise } = run(['gemini-pro-latest']);
    const res = await promise;
    expect(frames.filter((f) => 'meta' in f)).toEqual([{ meta: { provider: 'gemini', model: 'gemini-3.1-pro-preview' } }]);
    // The chain member stays the result's model (rotation and booking key on it); the served one is reported beside it.
    expect(res.model).toBe('gemini-pro-latest');
    expect(res.servedModel).toBe('gemini-3.1-pro-preview');
    expect(frames[frames.length - 1]).toEqual({ usage: { model: 'gemini-pro-latest', inputTokens: 12, outputTokens: 7, totalTokens: 19 } });
  });

  it('the same model, or a pinned build of it, keeps the requested name', async () => {
    for (const version of ['gemini-3.8-flash', 'models/gemini-3.8-flash', 'gemini-3.8-flash-001', 'GEMINI-3.8-FLASH']) {
      mockModels.set('gemini-3.8-flash', streamModel([raw({ modelVersion: version }), ...textParts(['ok']), finishPart()]));
      const { frames, promise } = run(['gemini-3.8-flash']);
      const res = await promise;
      expect([version, frames[0]]).toEqual([version, { meta: { provider: 'gemini', model: 'gemini-3.8-flash' } }]);
      expect(res.servedModel).toBeUndefined();
    }
  });

  it('a version that only shows up after text started corrects the badge exactly once', async () => {
    mockModels.set(
      'gemini-flash-latest',
      streamModel([
        { type: 'text-start', id: 't0' },
        { type: 'text-delta', id: 't0', delta: 'one ' },
        raw({ modelVersion: 'gemini-3.8-flash' }),
        { type: 'text-delta', id: 't0', delta: 'two' },
        raw({ modelVersion: 'gemini-3.6-flash' }), // a second, different value is ignored — one correction at most
        { type: 'text-end', id: 't0' },
        finishPart(),
      ]),
    );
    const { frames, promise } = run(['gemini-flash-latest']);
    const res = await promise;
    expect(kinds(frames)).toEqual(['meta', 'text', 'meta', 'text', 'usage']);
    expect(frames[0]).toEqual({ meta: { provider: 'gemini', model: 'gemini-flash-latest' } });
    expect(frames[2]).toEqual({ meta: { provider: 'gemini', model: 'gemini-3.8-flash' } });
    expect(res.servedModel).toBe('gemini-3.8-flash');
    expect(textOf(frames)).toBe('one two');
  });

  it('a rotated alias keeps the fallback flag on its served-model meta and on the partial marker', async () => {
    mockModels.set('gemini-3.8-flash', failingModel(apiError(503, 'overloaded', 'UNAVAILABLE')));
    mockModels.set(
      'gemini-flash-latest',
      streamModel([raw({ modelVersion: 'gemini-3.6-flash' }), ...textParts(['half']), { type: 'error', error: apiError(500, 'boom') }]),
    );
    const { frames, promise } = run(['gemini-3.8-flash', 'gemini-flash-latest']);
    const res = await promise;
    expect(res.ok).toBe(false);
    expect(frames.filter((f) => 'meta' in f)).toEqual([
      { meta: { provider: 'gemini', model: 'gemini-3.6-flash', fallback: true } },
      { meta: { provider: 'gemini', model: 'gemini-3.6-flash', partial: true, fallback: true } },
    ]);
  });

  it('servedModelOf accepts only a plain gemini-* id that differs from the request', () => {
    expect(servedModelOf({ modelVersion: 'gemini-3.1-pro-preview' }, 'gemini-pro-latest')).toBe('gemini-3.1-pro-preview');
    expect(servedModelOf({ modelVersion: ' models/gemini-3.1-pro-preview ' }, 'gemini-pro-latest')).toBe('gemini-3.1-pro-preview');
    for (const bad of [undefined, null, 42, '', 'gpt-5', 'gemini 3', 'gemini-3.8-flash/../../x', `gemini-${'x'.repeat(200)}`, '<b>gemini</b>']) {
      expect([bad, servedModelOf({ modelVersion: bad }, 'gemini-pro-latest')]).toEqual([bad, null]);
    }
    expect(servedModelOf(null, 'gemini-pro-latest')).toBeNull();
    expect(servedModelOf({ modelVersion: 'gemini-2.5-pro' }, 'gemini-2.5-pro')).toBeNull();
    expect(servedModelOf({ modelVersion: 'gemini-2.5-pro-preview-06-2026' }, 'gemini-2.5-pro')).toBeNull();
  });
});

describe('streamGeminiChat — terminal failures', () => {
  it('error after text: keeps the partial answer, marks meta partial, ends with an error frame, never rotates', async () => {
    mockModels.set(
      'gemini-3.8-flash',
      streamModel([
        { type: 'text-start', id: 't0' },
        { type: 'text-delta', id: 't0', delta: 'Half an ' },
        { type: 'text-delta', id: 't0', delta: 'answer' },
        { type: 'error', error: apiError(503, 'The service is currently unavailable.', 'UNAVAILABLE') },
      ]),
    );
    const second = streamModel([...textParts(['second answer']), finishPart()]);
    mockModels.set('gemini-3.6-flash', second);
    const { frames, promise } = run(['gemini-3.8-flash', 'gemini-3.6-flash']);
    const res = await promise;

    expect(res.ok).toBe(false);
    expect(res.text).toBe('Half an answer');
    expect(res.model).toBe('gemini-3.8-flash');
    expect(shape(res.attempts)).toEqual([{ model: 'gemini-3.8-flash', code: 'unavailable' }]);
    expect(second.doStreamCalls).toHaveLength(0);
    expect(textOf(frames)).toBe('Half an answer');
    expect(kinds(frames)).toEqual(['meta', 'text', 'text', 'meta', 'error']);
    expect(frames[3]).toEqual({ meta: { provider: 'gemini', model: 'gemini-3.8-flash', partial: true } });
    expect(frames[4]).toMatchObject({ error: { code: 'unavailable', retryable: true } });
  });

  it('a content-filter finish with no text is a safety error and does not rotate', async () => {
    mockModels.set('gemini-3.8-flash', streamModel([finishPart('content-filter', 'SAFETY')]));
    const second = streamModel([...textParts(['bypass']), finishPart()]);
    mockModels.set('gemini-3.6-flash', second);
    const { frames, promise } = run(['gemini-3.8-flash', 'gemini-3.6-flash']);
    const res = await promise;

    expect(res.ok).toBe(false);
    expect(res.error).toMatchObject({ code: 'safety', retryable: false });
    expect(second.doStreamCalls).toHaveLength(0);
    expect(frames[frames.length - 1]).toMatchObject({ error: { code: 'safety', retryable: false } });
  });

  it('a content-filter stop mid-answer (e.g. RECITATION) ends the partial answer with a safety error', async () => {
    mockModels.set('gemini-3.8-flash', streamModel([...textParts(['partial']), finishPart('content-filter', 'RECITATION')]));
    const { frames, promise } = run(['gemini-3.8-flash', 'gemini-3.6-flash']);
    const res = await promise;
    expect(res.text).toBe('partial');
    expect(res.error?.code).toBe('safety');
    expect(kinds(frames)).toEqual(['meta', 'text', 'meta', 'usage', 'error']);
  });

  it('a prompt blocked by promptFeedback (visible only on raw chunks) is a safety error', async () => {
    mockModels.set(
      'gemini-3.8-flash',
      streamModel([{ type: 'raw', rawValue: { promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } } }, finishPart('other', '')]),
    );
    const second = streamModel([...textParts(['bypass']), finishPart()]);
    mockModels.set('gemini-3.6-flash', second);
    const res = await run(['gemini-3.8-flash', 'gemini-3.6-flash']).promise;
    expect(res.error?.code).toBe('safety');
    expect(res.error?.message).toContain('PROHIBITED_CONTENT');
    expect(second.doStreamCalls).toHaveLength(0);
  });

  it('a missing API key fails as auth without touching the provider', async () => {
    const { frames, promise } = run(['gemini-3.8-flash'], { apiKey: '   ' });
    const res = await promise;
    expect(res).toMatchObject({ ok: false, model: null, error: { code: 'auth', retryable: false } });
    expect(mockCreateGoogle).not.toHaveBeenCalled();
    expect(kinds(frames)).toEqual(['error']);
  });

  it('drops malformed and retired model ids before the network; none left → model_missing', async () => {
    const good = streamModel([...textParts(['ok']), finishPart()]);
    mockModels.set('gemini-3.8-flash', good);
    const res = await run(['../../v1/files', 'gemini-2.0-flash', 'models/x?key=1', 'gemini-3.8-flash']).promise;
    expect(res.ok).toBe(true);
    expect(shape(res.attempts)).toEqual([{ model: 'gemini-3.8-flash' }]);

    const none = await run(['gemini-1.5-pro', 'bad id']).promise;
    expect(none.error?.code).toBe('model_missing');
    expect(none.attempts).toEqual([]);
  });

  it('never throws: a provider factory that throws becomes a classified failure', async () => {
    // No mock registered → the provider function throws synchronously inside the attempt.
    const { frames, promise } = run(['gemini-3.8-flash']);
    const res = await promise;
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('unavailable');
    expect(kinds(frames)).toEqual(['error']);
  });
});

describe('streamGeminiChat — abort', () => {
  it('stops mid-stream when the caller aborts: no rotation, no frames after the abort', async () => {
    const many = Array.from({ length: 40 }, (_, i) => `w${i} `);
    mockModels.set('gemini-3.8-flash', streamModel([...textParts(many), finishPart()], 5));
    const second = streamModel([...textParts(['second']), finishPart()]);
    mockModels.set('gemini-3.6-flash', second);

    const ctrl = new AbortController();
    const frames: ChatFrame[] = [];
    let framesAtAbort = -1;
    const res = await streamGeminiChat({
      apiKey: 'k',
      models: ['gemini-3.8-flash', 'gemini-3.6-flash'],
      messages: [{ role: 'user', content: 'long answer please' }],
      config: BASE_CONFIG,
      abortSignal: ctrl.signal,
      onFrame: (f) => {
        frames.push(f);
        if ('text' in f && textOf(frames).split(' ').length > 3 && framesAtAbort < 0) {
          ctrl.abort();
          framesAtAbort = frames.length;
        }
      },
    });

    expect(res.ok).toBe(false);
    expect(shape(res.attempts)).toEqual([{ model: 'gemini-3.8-flash', code: 'network' }]);
    expect(second.doStreamCalls).toHaveLength(0);
    expect(frames.length).toBe(framesAtAbort);
    expect(frames.some((f) => 'error' in f || 'usage' in f)).toBe(false);
    expect(res.text.length).toBeGreaterThan(0);
    expect(res.text.length).toBeLessThan(many.join('').length);
  });

  it('does not call the provider at all when the signal is already aborted', async () => {
    const model = streamModel([...textParts(['x']), finishPart()]);
    mockModels.set('gemini-3.8-flash', model);
    const ctrl = new AbortController();
    ctrl.abort();
    const { frames, promise } = run(['gemini-3.8-flash'], { abortSignal: ctrl.signal });
    const res = await promise;
    expect(res.ok).toBe(false);
    expect(shape(res.attempts)).toEqual([]);
    expect(model.doStreamCalls).toHaveLength(0);
    expect(frames).toEqual([]);
  });

  it('treats a throwing onFrame as a gone consumer and stops reading', async () => {
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`);
    mockModels.set('gemini-3.8-flash', streamModel([...textParts(many), finishPart()], 2));
    let calls = 0;
    const res = await streamGeminiChat({
      apiKey: 'k',
      models: ['gemini-3.8-flash'],
      messages: [{ role: 'user', content: 'hi' }],
      config: BASE_CONFIG,
      onFrame: () => {
        calls++;
        if (calls >= 3) throw new Error('controller closed');
      },
    });
    expect(res.ok).toBe(false);
    expect(calls).toBe(3);
    expect(shape(res.attempts)).toEqual([{ model: 'gemini-3.8-flash', code: 'network' }]);
  });
});

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('classifyChatError', () => {
  it.each([
    ['401 Request had invalid authentication credentials.', 'auth', apiError(401, 'Request had invalid authentication credentials.', 'UNAUTHENTICATED')],
    ['403 Method doesn’t allow unregistered callers.', 'auth', apiError(403, 'Method doesn’t allow unregistered callers.', 'PERMISSION_DENIED')],
    ['400 API key expired. Please renew the API key.', 'auth', apiError(400, 'API key expired. Please renew the API key.', 'INVALID_ARGUMENT')],
    ['402 Payment Required', 'quota', apiError(402, 'Payment Required')],
    ['429 Your prepayment credits are depleted. Please go ', 'quota', apiError(429, 'Your prepayment credits are depleted. Please go to AI Studio to manage your billing.', 'RESOURCE_EXHAUSTED')],
    ['403 This API method requires billing to be enabled.', 'quota', apiError(403, 'This API method requires billing to be enabled.', 'PERMISSION_DENIED')],
    ['429 You exceeded your current quota, please check yo', 'rate_limited', apiError(429, 'You exceeded your current quota, please check your plan and billing details.', 'RESOURCE_EXHAUSTED')],
    ['404 models/gemini-2.0-flash is no longer available.', 'model_missing', apiError(404, 'models/gemini-2.0-flash is no longer available.', 'NOT_FOUND')],
    ['400 models/foo is not found for API version v1beta, ', 'model_missing', apiError(400, 'models/foo is not found for API version v1beta, or is not supported for generateContent.', 'INVALID_ARGUMENT')],
    ['500 Internal error encountered.', 'unavailable', apiError(500, 'Internal error encountered.', 'INTERNAL')],
    ['503 The model is overloaded. Please try again later.', 'unavailable', apiError(503, 'The model is overloaded. Please try again later.', 'UNAVAILABLE')],
    ['400 Invalid JSON payload received.', 'bad_request', apiError(400, 'Invalid JSON payload received.', 'INVALID_ARGUMENT')],
    ['undefined Cannot connect to API: getaddrinfo ENOTFOUND', 'network', apiError(undefined, 'Cannot connect to API: getaddrinfo ENOTFOUND')],
    ['TypeError fetch failed (ECONNRESET)', 'network', Object.assign(new TypeError('fetch failed'), { code: 'ECONNRESET' })],
    ['Error The operation was aborted (AbortError)', 'network', Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })],
    ['Error Invalid prompt (AI_InvalidPromptError)', 'bad_request', Object.assign(new Error('Invalid prompt'), { name: 'AI_InvalidPromptError' })],
    // An attachment the SDK downloads itself carries THAT host's status — never a Gemini model/key/outage verdict.
    ['AI_DownloadError 404 (a deleted attachment)', 'bad_request', Object.assign(new Error('Failed to download https://cdn.example/x.png: 404 Not Found'), { name: 'AI_DownloadError', statusCode: 404 })],
    ['AI_DownloadError 403 (an expired signed URL)', 'bad_request', Object.assign(new Error('Failed to download: 403 Forbidden'), { name: 'AI_DownloadError', statusCode: 403 })],
    ['AI_DownloadError 503 (the asset host is down)', 'bad_request', Object.assign(new Error('Failed to download: 503'), { name: 'AI_DownloadError', statusCode: 503 })],
    ['Error something odd', 'unavailable', new Error('something odd')],
  ])('%s → %s', (_label, code, err) => {
    expect(classifyChatError(err).code).toBe(code);
  });

  it('unwraps a RetryError to its last error', () => {
    const retry = Object.assign(new Error('Failed after 3 attempts'), { name: 'AI_RetryError', lastError: apiError(429, 'slow down') });
    expect(classifyChatError(retry)).toMatchObject({ code: 'rate_limited', status: 429, retryable: true });
  });

  it('redacts keys and truncates the diagnostic message', () => {
    const e = classifyChatError(new Error(`bad key AIzaSyA1234567890abcdefghijklmnop and https://x/?key=SECRET123 ${'x'.repeat(600)}`));
    expect(e.message).not.toContain('AIzaSyA1234567890');
    expect(e.message).not.toContain('SECRET123');
    expect(e.message.length).toBeLessThanOrEqual(301);
  });
});

describe('thinkingConfigFor', () => {
  it('uses thinkingLevel for Gemini 3 (Pro cannot go below low)', () => {
    expect(thinkingConfigFor('gemini-3.8-flash', 'low')).toEqual({ thinkingLevel: 'low' });
    expect(thinkingConfigFor('gemini-3.8-flash', 'high')).toEqual({ thinkingLevel: 'high' });
    expect(thinkingConfigFor('gemini-3.1-pro-preview', 'off')).toEqual({ thinkingLevel: 'low' });
    expect(thinkingConfigFor('gemini-3.1-pro-preview', 'high')).toEqual({ thinkingLevel: 'high' });
  });

  it("never sends 'minimal' to a model that rejects it (3.7 / 3.8 Flash, 3.1 Pro — Google's thinking page, 2026-09-25)", () => {
    // 'minimal' is an API error there, and a 400 does not rotate: the whole turn used to fail on the PRIMARY model.
    for (const id of ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.1-pro-preview', 'gemini-3-pro-preview']) {
      expect([id, thinkingConfigFor(id, 'off')]).toEqual([id, { thinkingLevel: 'low' }]);
    }
    // An unchecked newer Flash gets 'low' too (allowlist, not denylist).
    expect(thinkingConfigFor('gemini-3.9-flash', 'off')).toEqual({ thinkingLevel: 'low' });
  });

  it("keeps 'minimal' where it is documented: 3.0 – 3.6 Flash and every 3.x Flash-Lite", () => {
    for (const id of [
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite-preview',
    ]) {
      expect([id, thinkingConfigFor(id, 'off')]).toEqual([id, { thinkingLevel: 'minimal' }]);
    }
  });

  it('uses thinkingBudget for Gemini 2.5 (Pro floor 128, -1 = dynamic)', () => {
    expect(thinkingConfigFor('gemini-2.5-flash', 'off')).toEqual({ thinkingBudget: 0 });
    expect(thinkingConfigFor('gemini-2.5-flash-lite', 'off')).toEqual({ thinkingBudget: 0 });
    expect(thinkingConfigFor('gemini-2.5-pro', 'off')).toEqual({ thinkingBudget: 128 });
    expect(thinkingConfigFor('gemini-2.5-pro', 'low')).toEqual({ thinkingBudget: 1024 });
    expect(thinkingConfigFor('gemini-2.5-flash', 'high')).toEqual({ thinkingBudget: -1 });
  });

  it('sends nothing when unsure: no level, aliases, other families', () => {
    expect(thinkingConfigFor('gemini-3.8-flash', undefined)).toBeUndefined();
    expect(thinkingConfigFor('gemini-flash-latest', 'off')).toBeUndefined();
    expect(thinkingConfigFor('gemini-pro-latest', 'high')).toBeUndefined();
    expect(thinkingConfigFor('gemma-3-27b-it', 'low')).toBeUndefined();
  });
});

describe('sanitizeSafetySettings', () => {
  it('raises anything looser than BLOCK_ONLY_HIGH to the floor, keeps stricter, drops unknown categories', () => {
    expect(
      sanitizeSafetySettings([
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'nonsense' },
        { category: 'HARM_CATEGORY_UNSPECIFIED', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'MADE_UP', threshold: 'BLOCK_ONLY_HIGH' },
      ]),
    ).toEqual([
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ]);
  });

  it('keeps one entry per category, the strictest', () => {
    expect(
      sanitizeSafetySettings([
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
      ]),
    ).toEqual([{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' }]);
    expect(sanitizeSafetySettings(undefined)).toEqual([]);
  });
});

// ─── Sampling per model family ───────────────────────────────────────────────

describe('samplingFor — Gemini 3 runs on its own defaults unless a persona chose them', () => {
  const PLATFORM = { temperature: 0.7, topK: 40 };

  it('drops temperature and topK for every Gemini 3 id (any case, padded)', () => {
    for (const id of ['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'GEMINI-3.8-FLASH', ' gemini-3.6-flash ']) {
      expect([id, samplingFor(id, PLATFORM)]).toEqual([id, {}]);
      expect([id, samplingFor(id, { ...PLATFORM, personaSampling: false })]).toEqual([id, {}]);
    }
  });

  it('keeps them on Gemini 3 when a persona chose its temperature (personaSampling === true only)', () => {
    expect(samplingFor('gemini-3.8-flash', { ...PLATFORM, personaSampling: true })).toEqual({ temperature: 0.7, topK: 40 });
    expect(samplingFor('gemini-3.1-pro-preview', { temperature: 0.2, personaSampling: true })).toEqual({ temperature: 0.2 });
    expect(samplingFor('gemini-3.8-flash', { ...PLATFORM, personaSampling: 'yes' as unknown as boolean })).toEqual({});
  });

  it('other families keep exactly what is configured', () => {
    for (const id of ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemma-3-27b-it']) {
      expect([id, samplingFor(id, PLATFORM)]).toEqual([id, { temperature: 0.7, topK: 40 }]);
    }
    expect(samplingFor('gemini-2.5-flash', { temperature: 0 })).toEqual({ temperature: 0 });
    expect(samplingFor('gemini-2.5-flash', { topK: 1 })).toEqual({ topK: 1 });
    expect(samplingFor('gemini-2.5-flash', {})).toEqual({});
  });

  it('on the wire: a Gemini 3 call carries no temperature / topK, a persona call does, topP always travels', async () => {
    const plain = streamModel([...textParts(['ok']), finishPart()]);
    mockModels.set('gemini-3.8-flash', plain);
    await run(['gemini-3.8-flash']).promise;
    expect(plain.doStreamCalls[0]!.temperature).toBeUndefined();
    expect(plain.doStreamCalls[0]!.topK).toBeUndefined();
    expect(plain.doStreamCalls[0]!.topP).toBe(0.95);

    const persona = streamModel([...textParts(['ok']), finishPart()]);
    mockModels.set('gemini-3.8-flash', persona);
    await run(['gemini-3.8-flash'], { config: { ...BASE_CONFIG, temperature: 0.9, personaSampling: true } }).promise;
    expect(persona.doStreamCalls[0]!.temperature).toBe(0.9);
    expect(persona.doStreamCalls[0]!.topK).toBe(40);
  });

  it('is decided per attempt: a chain that rotates from Gemini 3 to 2.5 sends the knobs only to 2.5', async () => {
    const first = failingModel(apiError(503, 'The model is overloaded.', 'UNAVAILABLE'));
    const second = streamModel([...textParts(['ok']), finishPart()]);
    mockModels.set('gemini-3.8-flash', first);
    mockModels.set('gemini-2.5-flash', second);
    const res = await run(['gemini-3.8-flash', 'gemini-2.5-flash']).promise;
    expect(res.ok).toBe(true);
    expect(first.doStreamCalls[0]!.temperature).toBeUndefined();
    expect(first.doStreamCalls[0]!.topK).toBeUndefined();
    expect(second.doStreamCalls[0]!.temperature).toBe(0.7);
    expect(second.doStreamCalls[0]!.topK).toBe(40);
  });
});

// ─── The same-model retry ────────────────────────────────────────────────────

/** A model whose n-th stream call follows `steps[n]`: an Error is thrown, an array of parts is streamed. */
function sequenceModel(steps: Array<unknown[] | Error>): MockLanguageModelV3 {
  const model: MockLanguageModelV3 = new MockLanguageModelV3({
    doStream: async () => {
      const step = steps[Math.min(model.doStreamCalls.length, steps.length) - 1];
      if (step instanceof Error) throw step;
      return {
        stream: simulateReadableStream({
          chunks: [{ type: 'stream-start', warnings: [] } as LanguageModelV3StreamPart, ...(step as LanguageModelV3StreamPart[])],
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      };
    },
  });
  return model;
}

const overloaded = () => apiError(503, 'The model is overloaded. Please try again later.', 'UNAVAILABLE');
const tooMany = () => apiError(429, 'You exceeded your current quota, please check your plan and billing details.', 'RESOURCE_EXHAUSTED');

describe('isTransientFailure', () => {
  it('a 429, a 503 or an "overloaded" message is worth one more try of the same model', () => {
    expect(isTransientFailure({ code: 'rate_limited', message: 'slow down' })).toBe(true);
    expect(isTransientFailure({ code: 'rate_limited', message: 'x', status: 429 })).toBe(true);
    expect(isTransientFailure({ code: 'unavailable', message: 'Service Unavailable', status: 503 })).toBe(true);
    expect(isTransientFailure({ code: 'unavailable', message: 'The model is OVERLOADED.' })).toBe(true);
    expect(isTransientFailure(classifyChatError(overloaded()))).toBe(true);
    expect(isTransientFailure(classifyChatError(tooMany()))).toBe(true);
    expect(isTransientFailure(classifyChatError(new Error('The model is overloaded. Please try again later.')))).toBe(true);
  });

  it('not an empty 200, a 500, an unknown failure or any other code', () => {
    expect(isTransientFailure(undefined)).toBe(false);
    expect(isTransientFailure({ code: 'unavailable', message: 'empty response (finish: STOP)' })).toBe(false);
    expect(isTransientFailure({ code: 'unavailable', message: 'Internal error encountered.', status: 500 })).toBe(false);
    expect(isTransientFailure({ code: 'unavailable', message: 'something odd' })).toBe(false);
    for (const code of ['network', 'model_missing', 'quota', 'auth', 'safety', 'bad_request'] as const) {
      expect([code, isTransientFailure({ code, message: 'overloaded', status: 503 })]).toEqual([code, false]);
    }
  });
});

describe('streamGeminiChat — retryTransientOnce', () => {
  const PRO = 'gemini-3.1-pro-preview';
  const ok = () => [...textParts(['Pro ', 'answer']), finishPart()];

  it.each([
    ['a 503', overloaded],
    ['a 429', tooMany],
    ['an "overloaded" error part with no status', () => new Error('The model is overloaded. Please try again later.')],
  ])('retries the same model once after %s with no text, and answers from it', async (_label, makeErr) => {
    const model = sequenceModel([makeErr(), ok()]);
    mockModels.set(PRO, model);
    const { frames, promise } = run([PRO], { retryTransientOnce: true, retryDelayMs: 0 });
    const res = await promise;

    expect(model.doStreamCalls).toHaveLength(2);
    expect(res.ok).toBe(true);
    expect(res.model).toBe(PRO);
    expect(res.text).toBe('Pro answer');
    expect(res.error).toBeUndefined();
    expect(shape(res.attempts)).toEqual([{ model: PRO, code: res.attempts[0]!.code }, { model: PRO }]);
    expect(['unavailable', 'rate_limited']).toContain(res.attempts[0]!.code);
    // The retry is the same chain member: its badge is not a fallback, and the failed try left no frame behind.
    expect(kinds(frames)).toEqual(['meta', 'text', 'text', 'usage']);
    expect(frames[0]).toEqual({ meta: { provider: 'gemini', model: PRO } });
  });

  it('an error part in the stream (not a thrown request) is retried too', async () => {
    const model = sequenceModel([[{ type: 'error', error: overloaded() }], ok()]);
    mockModels.set(PRO, model);
    const res = await run([PRO], { retryTransientOnce: true, retryDelayMs: 0 }).promise;
    expect(model.doStreamCalls).toHaveLength(2);
    expect(res.ok).toBe(true);
  });

  it('is off by default: a single-model chain fails on the first 503', async () => {
    const model = sequenceModel([overloaded(), ok()]);
    mockModels.set(PRO, model);
    const { frames, promise } = run([PRO], { retryDelayMs: 0 });
    const res = await promise;
    expect(model.doStreamCalls).toHaveLength(1);
    expect(res.ok).toBe(false);
    expect(res.error).toMatchObject({ code: 'unavailable', status: 503 });
    expect(kinds(frames)).toEqual(['error']);
  });

  it('retryTransientOnce: false is the same as off', async () => {
    const model = sequenceModel([tooMany(), ok()]);
    mockModels.set(PRO, model);
    const res = await run([PRO], { retryTransientOnce: false, retryDelayMs: 0 }).promise;
    expect(model.doStreamCalls).toHaveLength(1);
    expect(res.error?.code).toBe('rate_limited');
  });

  it('never retries once text was sent (a second answer would be appended to the first)', async () => {
    const model = sequenceModel([
      [{ type: 'text-start', id: 't0' }, { type: 'text-delta', id: 't0', delta: 'Half ' }, { type: 'error', error: overloaded() }],
      ok(),
    ]);
    mockModels.set(PRO, model);
    const { frames, promise } = run([PRO], { retryTransientOnce: true, retryDelayMs: 0 });
    const res = await promise;
    expect(model.doStreamCalls).toHaveLength(1);
    expect(res.ok).toBe(false);
    expect(res.text).toBe('Half ');
    expect(kinds(frames)).toEqual(['meta', 'text', 'meta', 'error']);
  });

  it('does not retry a failure that is not transient (a 500, a 404, quota)', async () => {
    for (const err of [apiError(500, 'Internal error encountered.', 'INTERNAL'), apiError(404, 'not found for API version v1beta', 'NOT_FOUND'), apiError(402, 'Payment Required')]) {
      const model = sequenceModel([err, ok()]);
      mockModels.set(PRO, model);
      const res = await run([PRO], { retryTransientOnce: true, retryDelayMs: 0 }).promise;
      expect([err.statusCode, model.doStreamCalls.length, res.ok]).toEqual([err.statusCode, 1, false]);
    }
  });

  it('spends ONE retry per turn: a model that fails twice ends the turn with one error frame', async () => {
    const model = sequenceModel([overloaded(), overloaded(), ok()]);
    mockModels.set(PRO, model);
    const { frames, promise } = run([PRO], { retryTransientOnce: true, retryDelayMs: 0 });
    const res = await promise;
    expect(model.doStreamCalls).toHaveLength(2);
    expect(res.ok).toBe(false);
    expect(res.error).toMatchObject({ code: 'unavailable', retryable: true, status: 503 });
    expect(shape(res.attempts)).toEqual([{ model: PRO, code: 'unavailable' }, { model: PRO, code: 'unavailable' }]);
    expect(kinds(frames)).toEqual(['error']);
  });

  it('…across the whole chain: after the retry the chain rotates, and the next model gets no retry of its own', async () => {
    const first = sequenceModel([overloaded(), overloaded(), ok()]);
    const second = sequenceModel([tooMany(), ok()]);
    mockModels.set('gemini-3.8-flash', first);
    mockModels.set('gemini-3.6-flash', second);
    const res = await run(['gemini-3.8-flash', 'gemini-3.6-flash'], { retryTransientOnce: true, retryDelayMs: 0 }).promise;
    expect(first.doStreamCalls).toHaveLength(2);
    expect(second.doStreamCalls).toHaveLength(1);
    expect(res.ok).toBe(false);
    expect(res.model).toBe('gemini-3.6-flash');
    expect(shape(res.attempts)).toEqual([
      { model: 'gemini-3.8-flash', code: 'unavailable' },
      { model: 'gemini-3.8-flash', code: 'unavailable' },
      { model: 'gemini-3.6-flash', code: 'rate_limited' },
    ]);
  });

  it('retries before rotating: a chain whose first model recovers never reaches the second', async () => {
    const first = sequenceModel([overloaded(), ok()]);
    const second = streamModel([...textParts(['second']), finishPart()]);
    mockModels.set('gemini-3.8-flash', first);
    mockModels.set('gemini-3.6-flash', second);
    const { frames, promise } = run(['gemini-3.8-flash', 'gemini-3.6-flash'], { retryTransientOnce: true, retryDelayMs: 0 });
    const res = await promise;
    expect(res.ok).toBe(true);
    expect(res.model).toBe('gemini-3.8-flash');
    expect(second.doStreamCalls).toHaveLength(0);
    expect(frames[0]).toEqual({ meta: { provider: 'gemini', model: 'gemini-3.8-flash' } });
  });

  it('a caller abort during the backoff ends the turn at once: no second try, no frames', async () => {
    const model = sequenceModel([overloaded(), ok()]);
    mockModels.set(PRO, model);
    const ctrl = new AbortController();
    const started = Date.now();
    const { frames, promise } = run([PRO], { retryTransientOnce: true, retryDelayMs: 60_000, abortSignal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 20);
    const res = await promise;
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('network');
    expect(shape(res.attempts)).toEqual([{ model: PRO, code: 'unavailable' }]);
    expect(frames).toEqual([]);
  });
});

// ─── Truncation (finish MAX_TOKENS) ──────────────────────────────────────────

describe('streamGeminiChat — an answer cut at maxOutputTokens', () => {
  it('a MAX_TOKENS / length finish with text is ok but truncated, and a {truncated} frame follows usage', async () => {
    mockModels.set('gemini-3.8-flash', streamModel([...textParts(['A long answer that stops mid-']), finishPart('length', 'MAX_TOKENS')]));
    const { frames, promise } = run(['gemini-3.8-flash']);
    const res = await promise;
    expect(res.ok).toBe(true);
    expect(res.truncated).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.text).toBe('A long answer that stops mid-');
    expect(kinds(frames)).toEqual(['meta', 'text', 'usage', 'truncated']);
    expect(frames[frames.length - 1]).toEqual({ truncated: true });
  });

  it('either signal is enough: the unified `length` reason or Google\'s raw MAX_TOKENS', async () => {
    for (const [unified, raw] of [['length', ''], ['other', 'MAX_TOKENS']] as const) {
      mockModels.set('gemini-3.8-flash', streamModel([...textParts(['cut']), finishPart(unified, raw)]));
      const res = await run(['gemini-3.8-flash']).promise;
      expect([unified, raw, res.ok, res.truncated]).toEqual([unified, raw, true, true]);
    }
  });

  it('the frame comes after sources and usage — the last frame before the route\'s [DONE]', async () => {
    const source = { type: 'source', sourceType: 'url', id: 's', url: 'https://a.example/1', title: 'A' } as LanguageModelV3StreamPart;
    mockModels.set('gemini-3.8-flash', streamModel([source, ...textParts(['cut']), finishPart('length', 'MAX_TOKENS')]));
    const { frames, promise } = run(['gemini-3.8-flash']);
    await promise;
    expect(kinds(frames)).toEqual(['meta', 'text', 'sources', 'usage', 'truncated']);
    // …and the browser's codec reads the whole tail back unchanged.
    expect(decodeFrames(frames.map((f) => encodeFrame(f)).join('') + encodeFrame('DONE'))).toEqual([...frames, 'DONE']);
  });

  it('a normal STOP is not truncated: no flag on the result, no frame', async () => {
    mockModels.set('gemini-3.8-flash', streamModel([...textParts(['done.']), finishPart('stop', 'STOP')]));
    const { frames, promise } = run(['gemini-3.8-flash']);
    const res = await promise;
    expect('truncated' in res).toBe(false);
    expect(frames.some((f) => 'truncated' in f)).toBe(false);
  });

  it('MAX_TOKENS with NO text is an empty answer (thinking ate the budget): it rotates, it is not "truncated"', async () => {
    mockModels.set('gemini-3.8-flash', streamModel([finishPart('length', 'MAX_TOKENS')]));
    mockModels.set('gemini-3.6-flash', streamModel([...textParts(['full answer']), finishPart()]));
    const { frames, promise } = run(['gemini-3.8-flash', 'gemini-3.6-flash']);
    const res = await promise;
    expect(res.ok).toBe(true);
    expect(res.model).toBe('gemini-3.6-flash');
    expect(res.attempts[0]).toMatchObject({ model: 'gemini-3.8-flash', code: 'unavailable' });
    expect(res.truncated).toBeUndefined();
    expect(frames.some((f) => 'truncated' in f)).toBe(false);

    // Alone in the chain it fails as unavailable — still not truncated.
    mockModels.set('gemini-3.8-flash', streamModel([finishPart('length', 'MAX_TOKENS')]));
    const alone = await run(['gemini-3.8-flash']).promise;
    expect(alone.ok).toBe(false);
    expect(alone.error?.code).toBe('unavailable');
    expect(alone.truncated).toBeUndefined();
  });

  it('a rotated model that runs out of tokens reports the truncation of the answer it gave', async () => {
    mockModels.set('gemini-3.8-flash', failingModel(apiError(404, 'not found for API version v1beta', 'NOT_FOUND')));
    mockModels.set('gemini-3.6-flash', streamModel([...textParts(['cut']), finishPart('length', 'MAX_TOKENS')]));
    const { frames, promise } = run(['gemini-3.8-flash', 'gemini-3.6-flash']);
    const res = await promise;
    expect(res).toMatchObject({ ok: true, model: 'gemini-3.6-flash', truncated: true });
    expect(frames[frames.length - 1]).toEqual({ truncated: true });
  });

  it('a safety stop is never reported as truncated', async () => {
    mockModels.set('gemini-3.8-flash', streamModel([...textParts(['partial']), finishPart('content-filter', 'MAX_TOKENS')]));
    const { frames, promise } = run(['gemini-3.8-flash']);
    const res = await promise;
    expect(res.error?.code).toBe('safety');
    expect(res.truncated).toBeUndefined();
    expect(frames.some((f) => 'truncated' in f)).toBe(false);
  });
});
