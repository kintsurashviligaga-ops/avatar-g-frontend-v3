/** @jest-environment node */
/**
 * The Google transport selector (Part 2, A2; contract lib/contracts/geminiTransport.ts).
 *
 * Pinned (MASTER TASK v3.1, Vertex only): GEMINI_TRANSPORT unset or `vertex` goes to aiplatform with a bearer token
 * and never carries an API key; `gemini_api` / `gemini` throw NotConfiguredError even with a key and Vertex configured;
 * an unconfigured Vertex throws NotConfiguredError naming variables; an unknown value fails closed. No call ever
 * reaches generativelanguage.googleapis.com, whatever key is in the environment.
 * Only the token mint is mocked (vertexAuth's env reading is real); fetch is a spy; nothing reaches the network.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../veo/vertexAuth', () => ({
  ...jest.requireActual('../../veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));

import { isNotConfiguredError } from '@/lib/contracts/geminiTransport';
import { getVertexAccessToken } from '../../veo/vertexAuth';
import {
  DEVELOPER_API_REFUSED,
  googleAiConfigured,
  googleCallAttempts,
  googleModelFetch,
  googleTransportBlocker,
  googleTransportKind,
  googleImageTransportKind,
  googleTransports,
} from './transport';
import { createGoogleGenerativeAI } from './provider';
import { buildLyriaVertexBody } from '../lyriaMusic';

const WIF = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const ENV = [
  'GEMINI_TRANSPORT', 'GEMINI_IMAGE_TRANSPORT', 'GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GCP_GEMINI_LOCATION',
  'GCP_PREDICT_LOCATION', 'GCP_VEO_BUCKET', 'GCP_SERVICE_ACCOUNT_KEY', ...Object.keys(WIF),
];
const saved: Record<string, string | undefined> = {};
let fetchSpy: jest.SpyInstance;

function call(n = 0): { url: string; init: RequestInit & { headers: Record<string, string> } } {
  const [url, init] = fetchSpy.mock.calls[n] as [string, RequestInit & { headers: Record<string, string> }];
  return { url, init };
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
});

afterEach(() => {
  // Whatever the test set, nothing may have gone to the Developer API.
  expect(fetchSpy.mock.calls.map(([url]) => String(url)).filter((u) => u.includes('generativelanguage'))).toEqual([]);
  fetchSpy.mockRestore();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('which transport', () => {
  it.each([
    [undefined],
    [''],
    [' Vertex '],
  ])('GEMINI_TRANSPORT=%p → vertex', (value) => {
    expect(googleTransportKind(value === undefined ? {} : { GEMINI_TRANSPORT: value })).toBe('vertex');
  });

  it.each(['gemini_api', 'gemini', ' GEMINI_API '])('GEMINI_TRANSPORT=%p is refused with NotConfiguredError', (value) => {
    let err: unknown;
    try {
      googleTransportKind({ GEMINI_TRANSPORT: value });
    } catch (e) {
      err = e;
    }
    expect(isNotConfiguredError(err)).toBe(true);
    expect(err).toMatchObject({ transportKind: 'gemini_api', missingVars: [DEVELOPER_API_REFUSED] });
  });

  it('an unknown value fails closed: no transport is configured, nothing is called', async () => {
    process.env.GEMINI_TRANSPORT = 'openai';
    process.env.GEMINI_API_KEY = 'gemini-key';
    Object.assign(process.env, WIF);
    expect(() => googleTransportKind()).toThrow('GEMINI_TRANSPORT must be vertex or unset');
    expect(googleAiConfigured()).toBe(false);
    expect(googleTransportBlocker('gemini-key')).toBe('GEMINI_TRANSPORT is not vertex');
    await expect(googleModelFetch('gemini-3.8-flash', 'generateContent', { method: 'POST' })).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the Developer API is never a transport (v3.1)', () => {
  it.each(['gemini_api', 'gemini'])('GEMINI_TRANSPORT=%s with a key AND Vertex configured: refused, nothing sent', async (value) => {
    process.env.GEMINI_TRANSPORT = value;
    process.env.GEMINI_API_KEY = 'gemini-key';
    Object.assign(process.env, WIF);
    expect(googleAiConfigured()).toBe(false);
    expect(googleTransportBlocker('gemini-key')).toBe('GEMINI_TRANSPORT is not vertex');
    expect(googleCallAttempts(['gemini-key'])).toEqual([]);
    const err = await googleModelFetch('gemini-3.8-flash', 'generateContent', { method: 'POST' }).catch((e) => e);
    expect(isNotConfiguredError(err)).toBe(true);
    expect(err).toMatchObject({ transportKind: 'gemini_api', missingVars: [DEVELOPER_API_REFUSED] });
    expect(err.message).not.toContain('gemini-key');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getVertexAccessToken).not.toHaveBeenCalled();
  });

  it('unset with only a key (Vertex unconfigured): NotConfiguredError for vertex, and the key is not used instead', async () => {
    process.env.GEMINI_API_KEY = 'gemini-key';
    process.env.GEMINI_API_KEYS = 'k1,k2';
    expect(googleAiConfigured()).toBe(false);
    expect(googleTransportBlocker('gemini-key')).toBe('Vertex AI is not configured');
    const err = await googleModelFetch('gemini-3.8-flash', 'generateContent', { method: 'POST' }).catch((e) => e);
    expect(isNotConfiguredError(err)).toBe(true);
    expect(err.transportKind).toBe('vertex');
    expect(err.missingVars).toContain('GCP_PROJECT_ID');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('selectFixed(gemini_api) is refused even with a key and Vertex configured', () => {
    process.env.GEMINI_API_KEY = 'gemini-key';
    Object.assign(process.env, WIF);
    expect(() => googleTransports.selectFixed('gemini_api')).toThrow(`gemini_api transport is not configured: missing ${DEVELOPER_API_REFUSED}`);
  });
});

describe('GEMINI_TRANSPORT unset is Vertex', () => {
  it('calls the global Vertex endpoint with a bearer token; the key in the environment is not sent', async () => {
    Object.assign(process.env, WIF);
    process.env.GEMINI_API_KEY = 'gemini-key';
    expect(googleAiConfigured()).toBe(true);
    expect(googleTransports.select().kind).toBe('vertex');
    await googleModelFetch('gemini-3.8-flash', 'generateContent', { method: 'POST', body: '{}' });
    const { url, init } = call();
    expect(url).toBe(
      'https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/global/publishers/google/models/gemini-3.8-flash:generateContent',
    );
    expect(init.headers.Authorization).toBe('Bearer vertex-token');
    expect(init.headers['x-goog-api-key']).toBeUndefined();
    expect(JSON.stringify(init.headers)).not.toContain('gemini-key');
  });

  it('streams with alt=sse and strips a `models/` prefix', async () => {
    Object.assign(process.env, WIF);
    await googleModelFetch('models/gemini-3.8-flash', 'streamGenerateContent', { method: 'POST' });
    expect(call().url).toBe(
      'https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/global/publishers/google/models/gemini-3.8-flash:streamGenerateContent?alt=sse',
    );
  });

  it('rejects a malformed model id before any request', async () => {
    Object.assign(process.env, WIF);
    await expect(googleModelFetch('../../evil?x=1', 'generateContent', { method: 'POST' })).rejects.toThrow('Invalid Google model id');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('vertex', () => {
  beforeEach(() => {
    process.env.GEMINI_TRANSPORT = 'vertex';
  });

  it('is not configured without project and Workload Identity — and does not fall back to the API key', async () => {
    process.env.GEMINI_API_KEY = 'gemini-key';
    expect(googleAiConfigured()).toBe(false);
    expect(googleTransportBlocker('gemini-key')).toBe('Vertex AI is not configured');
    const err = await googleModelFetch('gemini-3.8-flash', 'generateContent', { method: 'POST' }).catch((e) => e);
    expect(isNotConfiguredError(err)).toBe(true);
    expect(err.transportKind).toBe('vertex');
    expect(err.missingVars).toContain('GCP_PROJECT_ID');
    expect(err.message).not.toContain('gemini-key');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('needs no Veo bucket: project + Workload Identity are enough', () => {
    Object.assign(process.env, WIF);
    expect(googleAiConfigured()).toBe(true);
    expect(googleTransports.select().checkConfiguration()).toEqual({ ok: true, missing: [] });
    expect(googleTransports.select().kind).toBe('vertex');
  });

  it('calls the global Vertex endpoint with a bearer token and no API key', async () => {
    Object.assign(process.env, WIF);
    process.env.GEMINI_API_KEY = 'gemini-key';
    await googleModelFetch('gemini-3.1-flash-image', 'generateContent', {
      method: 'POST',
      headers: { 'x-goog-api-key': 'smuggled', Authorization: 'Bearer smuggled', 'X-Trace': 't1' },
    });
    const { url, init } = call();
    expect(url).toBe(
      'https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/global/publishers/google/models/gemini-3.1-flash-image:generateContent',
    );
    expect(init.headers.Authorization).toBe('Bearer vertex-token');
    expect(init.headers['x-goog-api-key']).toBeUndefined();
    expect(JSON.stringify(init.headers)).not.toContain('smuggled');
    expect(JSON.stringify(init.headers)).not.toContain('gemini-key');
    expect(init.headers['x-trace']).toBe('t1');
    expect(init.redirect).toBe('manual');
    expect(getVertexAccessToken).toHaveBeenCalledWith(false);
  });

  it('a regional GCP_GEMINI_LOCATION uses that region\'s host; predict defaults to us-central1', async () => {
    Object.assign(process.env, WIF, { GCP_GEMINI_LOCATION: 'europe-west4' });
    await googleModelFetch('gemini-3.8-flash', 'streamGenerateContent', { method: 'POST' });
    expect(call(0).url).toBe(
      'https://europe-west4-aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/europe-west4/publishers/google/models/gemini-3.8-flash:streamGenerateContent?alt=sse',
    );
    await googleModelFetch('imagen-4.0-generate-001', 'predict', { method: 'POST' });
    expect(call(1).url).toMatch(/^https:\/\/us-central1-aiplatform\.googleapis\.com\/.*\/locations\/us-central1\/.*:predict$/);
  });

  it('selectFixed returns Vertex, or NotConfiguredError', () => {
    expect(() => googleTransports.selectFixed('vertex')).toThrow(/vertex transport is not configured: missing .*GCP_PROJECT_ID/);
    Object.assign(process.env, WIF);
    expect(googleTransports.selectFixed('vertex').kind).toBe('vertex');
  });
});

describe('SDK factory (lib/ai/google/provider)', () => {
  it('vertex: the SDK targets the publisher endpoint and its placeholder key never leaves the process', async () => {
    process.env.GEMINI_TRANSPORT = 'vertex';
    Object.assign(process.env, WIF);
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text: 'hi' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const google = createGoogleGenerativeAI({ apiKey: 'caller-key' });
    const { generateText } = await import('ai');
    await generateText({ model: google('gemini-3.8-flash'), prompt: 'hello', maxRetries: 0 });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(
      'https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/global/publishers/google/models/gemini-3.8-flash:generateContent',
    );
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer vertex-token');
    expect(headers.get('x-goog-api-key')).toBeNull();
    expect(JSON.stringify([...headers.entries()])).not.toContain('caller-key');
    expect(init.redirect).toBe('manual');
  });

  it('vertex without config throws NotConfiguredError instead of using the caller\'s key', () => {
    process.env.GEMINI_TRANSPORT = 'vertex';
    let err: unknown;
    try {
      createGoogleGenerativeAI({ apiKey: 'caller-key' });
    } catch (e) {
      err = e;
    }
    expect(isNotConfiguredError(err)).toBe(true);
  });

  it('GEMINI_TRANSPORT=gemini_api throws NotConfiguredError even with a key and Vertex configured', () => {
    process.env.GEMINI_TRANSPORT = 'gemini_api';
    Object.assign(process.env, WIF);
    expect(() => createGoogleGenerativeAI({ apiKey: 'caller-key' })).toThrow(`gemini_api transport is not configured: missing ${DEVELOPER_API_REFUSED}`);
  });

  it('unset without Vertex config throws NotConfiguredError for vertex, not a Developer API client', () => {
    process.env.GEMINI_API_KEY = 'gemini-key';
    expect(() => createGoogleGenerativeAI()).toThrow(/vertex transport is not configured/);
  });
});

describe('Lyria 3 on Vertex', () => {
  it('asks for AUDIO and TEXT (AUDIO alone is a 400 on Vertex, Part 0 T2)', () => {
    expect(buildLyriaVertexBody('calm piano')).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'calm piano' }] }],
      generationConfig: { responseModalities: ['AUDIO', 'TEXT'] },
    });
  });
});

describe('the 19-importer Gemini REST client follows the transport', () => {
  it('generateWithGemini: a key alone sends nothing; with Vertex configured (unset) it calls aiplatform with a bearer token', async () => {
    const { generateWithGemini } = await import('../../gemini/client');
    const answer = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 });

    process.env.GEMINI_API_KEY = 'gemini-key';
    await expect(generateWithGemini({ prompt: 'hi', tier: 'flash', model: 'gemini-3.8-flash' })).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();

    Object.assign(process.env, WIF);
    fetchSpy.mockResolvedValueOnce(answer());
    const res = await generateWithGemini({ prompt: 'hi', tier: 'flash', model: 'gemini-3.8-flash' });
    expect(res.text).toBe('ok');
    expect(call(0).url).toMatch(/^https:\/\/aiplatform\.googleapis\.com\/v1\/projects\/gen-lang-client-0671348730\/locations\/global\/publishers\/google\/models\/gemini-3\.8-flash:generateContent$/);
    expect(call(0).init.headers.Authorization).toBe('Bearer vertex-token');
    expect(call(0).init.headers['x-goog-api-key']).toBeUndefined();
  });
});

describe('speech-to-text and embeddings follow the transport', () => {
  const useVertex = () => {
    process.env.GEMINI_TRANSPORT = 'vertex';
    Object.assign(process.env, WIF);
  };

  it('Gemini STT on vertex: aiplatform generateContent, bearer token, the audio inline, no API key', async () => {
    const { transcribeWithGeminiDetailed, hasGeminiSttKey } = await import('../../voice-v2v/geminiStt');
    process.env.GEMINI_API_KEY = 'gemini-key';
    useVertex();
    expect(hasGeminiSttKey()).toBe(true);
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'გამარჯობა' }] } }] }), { status: 200 }));
    const r = await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'ka-GE', { models: ['gemini-3.8-flash'] });
    expect(r.text).toBe('გამარჯობა');
    expect(call(0).url).toMatch(/^https:\/\/aiplatform\.googleapis\.com\/v1\/projects\/gen-lang-client-0671348730\/locations\/global\/publishers\/google\/models\/gemini-3\.8-flash:generateContent$/);
    expect(call(0).init.headers.Authorization).toBe('Bearer vertex-token');
    expect(call(0).init.headers['x-goog-api-key']).toBeUndefined();
    const body = JSON.parse(String(call(0).init.body)) as { contents: Array<{ role: string; parts: Array<{ inline_data?: unknown }> }> };
    expect(body.contents[0]!.role).toBe('user');
    expect(body.contents[0]!.parts[1]!.inline_data).toEqual({ mime_type: 'audio/wav', data: 'QUJD' });
  });

  it('Gemini STT on an unconfigured vertex: an auth error, no call, and the API key is not used instead', async () => {
    const { transcribeWithGeminiDetailed, hasGeminiSttKey } = await import('../../voice-v2v/geminiStt');
    process.env.GEMINI_API_KEY = 'gemini-key';
    process.env.GEMINI_TRANSPORT = 'vertex';
    expect(hasGeminiSttKey()).toBe(false);
    await expect(transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US')).rejects.toMatchObject({ code: 'auth' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('embeddings on vertex: the same model through regional predict, 1536 dimensions, values read from predictions', async () => {
    const { embed } = await import('../../memory/embed');
    useVertex();
    const values = Array.from({ length: 1536 }, (_, i) => i / 1536);
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ predictions: [{ embeddings: { values } }] }), { status: 200 }));
    await expect(embed('hello')).resolves.toEqual(values);
    expect(call(0).url).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/us-central1/publishers/google/models/gemini-embedding-001:predict',
    );
    expect(call(0).init.headers.Authorization).toBe('Bearer vertex-token');
    expect(JSON.parse(String(call(0).init.body))).toEqual({
      instances: [{ content: 'hello', task_type: 'SEMANTIC_SIMILARITY' }],
      parameters: { outputDimensionality: 1536 },
    });
  });

  it('embedContent is a Developer API method: asking Vertex for it throws before any request', async () => {
    useVertex();
    await expect(googleModelFetch('gemini-embedding-001', 'embedContent', { method: 'POST' })).rejects.toThrow(/use predict/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('key-rotating callers (orchestrator script / interior routes)', () => {
  it('exactly one attempt on Vertex, none when it cannot serve; a key pool never adds attempts', () => {
    expect(googleCallAttempts(['k1', ' k2 ', 'k1', ''])).toEqual([]); // unconfigured Vertex: the pool is NOT used instead
    expect(googleCallAttempts([])).toEqual([]);
    Object.assign(process.env, WIF);
    expect(googleCallAttempts(['k1', 'k2'])).toEqual([undefined]);
    expect(googleCallAttempts([])).toEqual([undefined]);
    process.env.GEMINI_TRANSPORT = 'gemini_api';
    expect(googleCallAttempts(['k1'])).toEqual([]);
    process.env.GEMINI_TRANSPORT = 'bogus';
    expect(googleCallAttempts(['k1'])).toEqual([]);
  });
});

describe('image transport override (GEMINI_IMAGE_TRANSPORT)', () => {
  it('follows GEMINI_TRANSPORT when unset: Vertex', () => {
    expect(googleImageTransportKind({})).toBe('vertex');
    expect(googleImageTransportKind({ GEMINI_TRANSPORT: 'vertex' })).toBe('vertex');
    expect(googleImageTransportKind({ GEMINI_TRANSPORT: 'gemini_api', GEMINI_IMAGE_TRANSPORT: 'vertex' })).toBe('vertex');
  });

  it('a leftover GEMINI_IMAGE_TRANSPORT=gemini_api refuses images instead of moving them to the AI Studio key', async () => {
    expect(() => googleImageTransportKind({ GEMINI_TRANSPORT: 'vertex', GEMINI_IMAGE_TRANSPORT: 'gemini_api' })).toThrow(DEVELOPER_API_REFUSED);
    const { googleImageModelFetch, googleImageTransportBlocker } = await import('./transport');
    Object.assign(process.env, WIF, { GEMINI_API_KEY: 'gemini-key', GEMINI_IMAGE_TRANSPORT: 'gemini_api' });
    expect(googleImageTransportBlocker()).toBe('GEMINI_IMAGE_TRANSPORT is not vertex');
    await expect(googleImageModelFetch('gemini-3.1-flash-image', 'generateContent', { method: 'POST' })).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails closed on an unknown value', () => {
    expect(() => googleImageTransportKind({ GEMINI_IMAGE_TRANSPORT: 'replicate' })).toThrow();
  });
});
