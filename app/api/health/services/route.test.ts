/** @jest-environment node */
/**
 * GET /api/health/services against a scripted global fetch — no network, no provider calls. Gemini runs on Vertex AI
 * only (MASTER TASK v3.1), so its row is Vertex readiness: a minted Workload Identity token, no model call, and an AI
 * Studio key is never read or sent. A probe's thrown message can never carry its own credential into the response.
 */
jest.mock('server-only', () => ({}));
// The admin-session leg of the gate: nobody is signed in here — only the x-admin-key header can open it.
jest.mock('../../../../lib/auth/adminGuard', () => ({ isAdmin: jest.fn(async () => false) }));
const mockToken = jest.fn(async (_requireVeo?: boolean) => 'ya29.test-token');
jest.mock('../../../../lib/veo/vertexAuth', () => ({
  ...jest.requireActual('../../../../lib/veo/vertexAuth'),
  getVertexAccessToken: (requireVeo?: boolean) => mockToken(requireVeo),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

type Result = { service: string; status: string; message: string; envVar: string };

const ADMIN = 'test-admin-key';
const AI_STUDIO_KEY = 'AQ.test-services-key-0123456789abcdef';
const ANTHROPIC = 'sk-ant-test-0123456789abcdef';
const VERTEX_ENV = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const ENV_VARS = ['ADMIN_KEY', 'GEMINI_API_KEY', 'GEMINI_TRANSPORT', 'ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', ...Object.keys(VERTEX_ENV)] as const;
const saved: Record<string, string | undefined> = {};
const realFetch = global.fetch;
const fetchMock = jest.fn();
const GEMINI = 'Google Gemini (Vertex AI)';

beforeEach(() => {
  for (const k of ENV_VARS) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.ADMIN_KEY = ADMIN;
  process.env.GEMINI_API_KEY = AI_STUDIO_KEY; // present on purpose: it must change nothing
  Object.assign(process.env, VERTEX_ENV);
  mockToken.mockReset().mockResolvedValue('ya29.test-token');
  fetchMock.mockReset();
  // Every configured probe gets a harmless 200.
  fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }));
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
  for (const k of ENV_VARS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

async function run(): Promise<Result[]> {
  const res = await GET(new NextRequest('http://localhost/api/health/services', { headers: { 'x-admin-key': ADMIN } }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: Result[] }).results;
}

test('the admin key is accepted ONLY as a header — `?key=` (which lands in access logs) is refused', async () => {
  const viaQuery = await GET(new NextRequest(`http://localhost/api/health/services?key=${ADMIN}`));
  expect(viaQuery.status).toBe(403);
  const wrong = await GET(new NextRequest('http://localhost/api/health/services', { headers: { 'x-admin-key': 'nope' } }));
  expect(wrong.status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('an unset ADMIN_KEY matches nothing — not even an empty header', async () => {
  delete process.env.ADMIN_KEY;
  const res = await GET(new NextRequest('http://localhost/api/health/services', { headers: { 'x-admin-key': '' } }));
  expect(res.status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('Gemini is Vertex readiness: a minted token, no Developer API request, the AI Studio key never sent', async () => {
  const results = await run();

  expect(results.find((r) => r.service === GEMINI)).toMatchObject({
    status: 'CONNECTED',
    envVar: 'GCP_PROJECT_ID',
    message: 'vertex · location:global · mode:wif · token:ok',
  });
  expect(mockToken).toHaveBeenCalledWith(false);
  for (const [u, init] of fetchMock.mock.calls as [string, RequestInit | undefined][]) {
    expect(u).not.toContain('generativelanguage.googleapis.com');
    expect(JSON.stringify(init?.headers ?? {})).not.toContain(AI_STUDIO_KEY);
  }
});

test('Vertex not configured: the row is UNCONFIGURED and names the variable, whatever key is set', async () => {
  delete process.env.GCP_PROJECT_ID;
  const gemini = (await run()).find((r) => r.service === GEMINI);
  expect(gemini?.status).toBe('UNCONFIGURED');
  expect(gemini?.message).toContain('GCP_PROJECT_ID');
  expect(mockToken).not.toHaveBeenCalled();
});

test('a token the chain cannot mint is an ERROR', async () => {
  mockToken.mockRejectedValue(new Error('Vertex access token request failed (HTTP 403: PERMISSION_DENIED)'));
  const gemini = (await run()).find((r) => r.service === GEMINI);
  expect(gemini?.status).toBe('ERROR');
  expect(gemini?.message).toContain('token:failed');
});

test('voice is Cloud TTS on the same token (its free ka-GE voices list); ElevenLabs is never asked, whatever key is set', async () => {
  process.env.ELEVENLABS_API_KEY = 'el-should-not-be-sent';
  fetchMock.mockImplementation(async (url: string) =>
    url.startsWith('https://texttospeech.googleapis.com/')
      ? new Response(JSON.stringify({ voices: [{ name: 'ka-GE-Chirp3-HD-Aoede', languageCodes: ['ka-GE'] }] }), { status: 200 })
      : new Response('{}', { status: 200 }));
  const results = await run();
  expect(results.find((r) => r.service === 'Google Cloud TTS (voice)')).toMatchObject({
    status: 'CONNECTED', envVar: 'GCP_PROJECT_ID', message: '1 ka-GE voices · best ka-GE-Chirp3-HD-Aoede',
  });
  expect(results.some((r) => /elevenlabs/i.test(r.service))).toBe(false);
  const urls = (fetchMock.mock.calls as [string][]).map(([u]) => u);
  expect(urls).toContain('https://texttospeech.googleapis.com/v1/voices?languageCode=ka-GE');
  expect(urls.some((u) => u.includes('elevenlabs.io'))).toBe(false);
  expect(urls.some((u) => u.includes('text:synthesize'))).toBe(false);
});

test('voice: a Cloud TTS refusal is an ERROR that says why; no Vertex config is UNCONFIGURED', async () => {
  fetchMock.mockImplementation(async (url: string) =>
    new Response('{}', { status: url.startsWith('https://texttospeech.googleapis.com/') ? 403 : 200 }));
  let voice = (await run()).find((r) => r.service === 'Google Cloud TTS (voice)');
  expect(voice?.status).toBe('ERROR');
  expect(voice?.message).toMatch(/HTTP 403 \(the Cloud Text-to-Speech API is off/);
  delete process.env.GCP_PROJECT_ID;
  voice = (await run()).find((r) => r.service === 'Google Cloud TTS (voice)');
  expect(voice?.status).toBe('UNCONFIGURED');
});

test('no outbound URL carries any `key=` query parameter', async () => {
  process.env.ANTHROPIC_API_KEY = ANTHROPIC;
  await run();
  for (const [u] of fetchMock.mock.calls as [string][]) expect(u).not.toMatch(/[?&]key=/);
});

test('a probe that throws with its key in the message reports it redacted', async () => {
  process.env.ANTHROPIC_API_KEY = ANTHROPIC;
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith('https://api.anthropic.com/')) throw new TypeError(`Headers.append: "${ANTHROPIC}" is an invalid header value.`);
    return new Response('{}', { status: 200 });
  });

  const anthropic = (await run()).find((r) => r.service === 'Anthropic Claude');
  expect(anthropic?.status).toBe('ERROR');
  expect(anthropic?.message).not.toContain(ANTHROPIC);
  expect(anthropic?.message).toContain('[redacted]');
});
