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
  classifyChatError,
  unbookedAttempts,
  thinkingConfigFor,
  sanitizeSafetySettings,
  type GeminiChatConfig,
  type StreamGeminiChatInput,
} from './chatStream';

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
    expect(mockCreateGoogle).toHaveBeenCalledWith({ apiKey: 'test-key' });
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

describe('streamGeminiChat — rotation', () => {
  it('rotates to the next model on model_missing (404) and answers from it', async () => {
    mockModels.set('gemini-3.8-flash', failingModel(apiError(404, 'models/gemini-3.8-flash is not found for API version v1beta', 'NOT_FOUND')));
    mockModels.set('gemini-3.6-flash', streamModel([...textParts(['from ', 'second']), finishPart()]));
    const { frames, promise } = run(['gemini-3.8-flash', 'gemini-3.6-flash']);
    const res = await promise;

    expect(res.ok).toBe(true);
    expect(res.model).toBe('gemini-3.6-flash');
    expect(shape(res.attempts)).toEqual([{ model: 'gemini-3.8-flash', code: 'model_missing' }, { model: 'gemini-3.6-flash' }]);
    expect(frames[0]).toEqual({ meta: { provider: 'gemini', model: 'gemini-3.6-flash' } });
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
    expect(thinkingConfigFor('gemini-3.8-flash', 'off')).toEqual({ thinkingLevel: 'minimal' });
    expect(thinkingConfigFor('gemini-3.8-flash', 'low')).toEqual({ thinkingLevel: 'low' });
    expect(thinkingConfigFor('gemini-3.8-flash', 'high')).toEqual({ thinkingLevel: 'high' });
    expect(thinkingConfigFor('gemini-3.1-pro-preview', 'off')).toEqual({ thinkingLevel: 'low' });
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
