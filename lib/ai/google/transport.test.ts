/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('../../veo/vertexAuth', () => ({
  ...jest.requireActual('../../veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-test-token'),
  getVertexAuthClient: jest.fn(() => ({ getAccessToken: async () => ({ token: 'sdk-vertex-token' }) })),
}));
import { getVertexAccessToken, vertexAiConfig, vertexConfig } from '../../veo/vertexAuth';
import { googleAiConfigured, googleModelFetch, googleModelRequest, googleTransport } from './transport';
import { generateWithGemini } from '@/lib/gemini/client';
import { embed } from '@/lib/memory/embed';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from './provider';

const savedEnv = { ...process.env };
const originalFetch = global.fetch;
const fetchMock = jest.fn();
const wif = {
  GCP_PROJECT_ID: 'test-project', GCP_PROJECT_NUMBER: '123456789',
  GCP_SERVICE_ACCOUNT_EMAIL: 'runner@test-project.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool', GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
beforeEach(() => {
  process.env = { ...savedEnv };
  for (const key of Object.keys(process.env)) if (/^(GCP_|GEMINI_|GOOGLE_GENERATIVE_AI_API_KEY)/.test(key)) delete process.env[key];
  Object.assign(process.env, wif, { GEMINI_TRANSPORT: 'vertex', GEMINI_API_KEY: 'developer-key-must-not-be-used' });
  fetchMock.mockReset();
  (getVertexAccessToken as jest.Mock).mockReset().mockResolvedValue('vertex-test-token');
  global.fetch = fetchMock;
});
afterEach(() => { process.env = { ...savedEnv }; global.fetch = originalFetch; });

test('Gemini auth needs no Veo bucket and defaults to global, independently of Veo', () => {
  process.env.GCP_VEO_LOCATION = 'us-central1';
  expect(vertexAiConfig()?.location).toBe('global');
  expect(vertexConfig()).toBeNull();
  expect(googleAiConfigured()).toBe(true);
});
test('global Vertex requests carry only OAuth and a project-scoped endpoint', async () => {
  const request = await googleModelRequest('gemini-3.8-flash', 'streamGenerateContent');
  expect(request.url).toBe('https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/publishers/google/models/gemini-3.8-flash:streamGenerateContent?alt=sse');
  expect(request.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer vertex-test-token' });
  expect(getVertexAccessToken).toHaveBeenCalledWith(false);
});
test('regional Vertex URL uses the regional hostname', async () => {
  process.env.GCP_GEMINI_LOCATION = 'us-central1';
  expect((await googleModelRequest('gemini-3.8-flash', 'generateContent')).url).toContain('https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/');
});
test('an incomplete Vertex configuration never falls back to the configured API key', async () => {
  delete process.env.GCP_PROJECT_ID;
  expect(googleAiConfigured()).toBe(false);
  await expect(googleModelFetch('gemini-3.8-flash', 'generateContent', {})).rejects.toThrow('GCP_PROJECT_ID');
  expect(fetchMock).not.toHaveBeenCalled();
});
test('failed token exchange never calls Developer API', async () => {
  (getVertexAccessToken as jest.Mock).mockRejectedValue(new Error('token failed'));
  await expect(googleModelFetch('gemini-3.8-flash', 'generateContent', {})).rejects.toThrow('token failed');
  expect(fetchMock).not.toHaveBeenCalled();
});
test.each(['typo', 'auto', ''])('invalid selector %s fails closed', (value) => {
  process.env.GEMINI_TRANSPORT = value;
  expect(googleAiConfigured()).toBe(false);
  expect(googleTransport).toThrow('GEMINI_TRANSPORT');
});
test.each(['../secret', 'model?key=secret', 'https://evil.test/model'])('rejects a model path injection %s', async (model) => {
  await expect(googleModelRequest(model, 'generateContent')).rejects.toThrow('Invalid Google model');
  expect(getVertexAccessToken).not.toHaveBeenCalled();
});
test('legacy transport retains header-based key authentication', async () => {
  delete process.env.GEMINI_TRANSPORT;
  const req = await googleModelRequest('gemini-3.8-flash', 'generateContent');
  expect(req.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  expect(req.headers['x-goog-api-key']).toBe(process.env.GEMINI_API_KEY);
  expect(getVertexAccessToken).not.toHaveBeenCalled();
});
test('REST generation works with no Developer API key and does not follow redirects', async () => {
  delete process.env.GEMINI_API_KEY;
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hello' }] } }] })));
  expect((await generateWithGemini({ prompt: 'hi', tier: 'flash' })).text).toBe('hello');
  expect(fetchMock.mock.calls[0][0]).toContain('aiplatform.googleapis.com/');
  expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
  expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBeUndefined();
});
test('Vertex embeddings translate predict request and response without changing dimensions', async () => {
  delete process.env.GEMINI_API_KEY;
  const values = Array.from({ length: 1536 }, () => 0.1);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ predictions: [{ embeddings: { values } }] })));
  expect(await embed('remember me')).toEqual(values);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toContain('gemini-embedding-001:predict');
  expect(JSON.parse(init.body)).toEqual({ instances: [{ content: 'remember me', task_type: 'SEMANTIC_SIMILARITY' }], parameters: { outputDimensionality: 1536 } });
});

test('the real Vertex SDK generates with refreshed WIF-client OAuth, never an ambient express API key', async () => {
  delete process.env.GEMINI_API_KEY;
  process.env.GOOGLE_VERTEX_API_KEY = 'ambient-express-key';
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    candidates: [{ content: { role: 'model', parts: [{ text: 'Vertex answer' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 },
  }), { headers: { 'Content-Type': 'application/json' } }));
  const result = await generateText({ model: createGoogleGenerativeAI()('gemini-3.8-flash'), prompt: 'Hi', maxRetries: 0 });
  expect(result.text).toBe('Vertex answer');
  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toContain('/projects/test-project/locations/global/publishers/google/models/');
  expect(String(url)).not.toContain('key=');
  const headers = new Headers(init.headers);
  expect(headers.get('authorization')).toBe('Bearer sdk-vertex-token');
  expect(headers.get('x-goog-api-key')).toBeNull();
  expect(init.redirect).toBe('manual');
});


test('Developer SDK uses only the canonical key with manual redirects', async () => {
  process.env.GEMINI_TRANSPORT = 'gemini';
  process.env.GEMINI_API_KEY = 'canonical-key';
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'ambient-alias-key';
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Developer answer' }] }, finishReason: 'STOP' }] }), { headers: { 'Content-Type': 'application/json' } }));
  const result = await generateText({ model: createGoogleGenerativeAI()('gemini-3.8-flash'), prompt: 'Hi', maxRetries: 0 });
  expect(result.text).toBe('Developer answer');
  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toContain('https://generativelanguage.googleapis.com/');
  expect(new Headers(init.headers).get('x-goog-api-key')).toBe('canonical-key');
  expect(init.redirect).toBe('manual');
  expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('ambient-alias-key');
});

test('an ambient SDK alias cannot activate generation without GEMINI_API_KEY', () => {
  process.env.GEMINI_TRANSPORT = 'gemini';
  delete process.env.GEMINI_API_KEY;
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'ambient-alias-key';
  expect(() => createGoogleGenerativeAI()).toThrow('GEMINI_API_KEY is not configured');
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each(['gemini', 'vertex'])('%s SDK refuses redirects without forwarding credentials', async (transport) => {
  process.env.GEMINI_TRANSPORT = transport;
  fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://attacker.example/' } }));
  await expect(generateText({ model: createGoogleGenerativeAI()('gemini-3.8-flash'), prompt: 'Hi', maxRetries: 0 })).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
});
