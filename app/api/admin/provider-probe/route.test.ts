/** @jest-environment node */
/**
 * The admin provider probe: unauthorised callers get 404, and the Veo keyless-chain result is written to one log line
 * (statuses only) so GCP Part 0 AUTH can be read from the deployment's runtime logs. No network: every provider key is
 * unset, and the Veo transport, Vertex config and auth check are mocked.
 */
jest.mock('server-only', () => ({}));

const mockUser = jest.fn();
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: async () => ({ user: mockUser() }),
}));
const mockGate = jest.fn();
jest.mock('../../../../lib/admin/guard', () => ({ assertAdminAccess: () => mockGate() }));
const mockTransport = jest.fn();
jest.mock('../../../../lib/veo/engine', () => ({ veoTransport: () => mockTransport() }));
jest.mock('../../../../lib/veo/policy', () => ({ isGoogleOnly: () => true }));
const mockProblems = jest.fn();
jest.mock('../../../../lib/veo/vertexAuth', () => ({ vertexConfigProblems: () => mockProblems() }));
const mockAuth = jest.fn();
jest.mock('../../../../lib/veo/authCheck', () => ({ checkVertexAuth: () => mockAuth() }));
const mockReadiness = jest.fn();
jest.mock('../../../../lib/ai/google/readiness', () => ({ checkGoogleAiReadiness: (o: unknown) => mockReadiness(o) }));
const mockCloudTts = jest.fn();
jest.mock('../../../../lib/audio/google-tts', () => ({ checkCloudTts: () => mockCloudTts() }));

import { NextRequest } from 'next/server';
import { GET } from './route';

const KEYS = [
  'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'ANTHROPIC_API_KEY', 'REPLICATE_API_TOKEN', 'ELEVENLABS_API_KEY',
  'HEYGEN_API_KEY', 'STRIPE_SECRET_KEY', 'RESEND_API_KEY',
];
const ENV = process.env;
const req = () => new NextRequest('https://preview.example/api/admin/provider-probe');
let warn: jest.SpyInstance;

beforeEach(() => {
  process.env = { ...ENV };
  for (const k of KEYS) delete process.env[k];
  jest.clearAllMocks();
  mockUser.mockReturnValue({ id: 'u1', email: 'admin@example.com' });
  mockGate.mockReturnValue({ ok: true });
  mockTransport.mockReturnValue('vertex');
  mockProblems.mockReturnValue([]);
  mockReadiness.mockResolvedValue({ configured: true, ok: true, detail: 'vertex · location:global · mode:wif · token:ok' });
  mockCloudTts.mockResolvedValue({ state: 'ok', detail: '4 ka-GE voices · best ka-GE-Chirp3-HD-Aoede' });
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  process.env = ENV;
});

const veoOf = async (res: Response) =>
  ((await res.json()) as { results?: Array<{ provider: string; ok: boolean; detail: string }> }).results?.find(
    (r) => r.provider === 'veo',
  );

it('answers 404 to a caller who is not an admin, and probes nothing', async () => {
  mockGate.mockReturnValue({ ok: false });
  const res = await GET(req());
  expect(res.status).toBe(404);
  expect(mockAuth).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
});

it('never generates or spends Developer API balance during a diagnostic GET, even with a configured key', async () => {
  process.env.GEMINI_API_KEY = 'gemini-test-key';
  process.env.ANTHROPIC_API_KEY = 'anthropic-test-key';
  mockAuth.mockResolvedValue({ ok: true, steps: ['mode:wif', 'token:ok'] });
  const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }));
  try {
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
    for (const [url, init] of fetchSpy.mock.calls) {
      expect(String(url)).not.toMatch(/:generateContent|:streamGenerateContent|:predict|interactions/);
      expect(String(url)).not.toContain('generativelanguage.googleapis.com');
      expect(init?.method ?? 'GET').toBe('GET');
    }
    expect(body.billingVerification).toMatchObject({ status: 'not_tested', paidInference: false });
    expect(body.results.some((r: { provider: string }) => r.provider === 'gemini-billing')).toBe(false);
    expect(JSON.stringify(body)).not.toContain('gemini-test-key');
  } finally {
    fetchSpy.mockRestore();
  }
});

it('reports Gemini as Vertex AI readiness (a minted token), never as an AI Studio key', async () => {
  process.env.GEMINI_API_KEY = 'gemini-test-key';
  mockAuth.mockResolvedValue({ ok: true, steps: ['mode:wif', 'token:ok'] });
  const res = await GET(req());
  const body = (await res.json()) as { results: Array<{ provider: string; configured: boolean; ok: boolean; detail: string }> };
  expect(mockReadiness).toHaveBeenCalledWith({ live: true });
  expect(body.results.find((r) => r.provider === 'gemini')).toEqual({
    provider: 'gemini',
    configured: true,
    ok: true,
    detail: 'vertex · location:global · mode:wif · token:ok',
  });

  mockReadiness.mockResolvedValue({ configured: false, ok: false, detail: 'vertex · missing GCP_PROJECT_ID' });
  const unset = (await (await GET(req())).json()) as { summary: { not_configured: string[] } };
  expect(unset.summary.not_configured).toContain('gemini');
});

it('logs the passing keyless chain as one status line', async () => {
  mockAuth.mockResolvedValue({ ok: true, steps: ['mode:wif', 'token:ok', 'bucket:ok', 'sign:ok'] });
  const res = await GET(req());
  expect(res.status).toBe(200);
  expect((await veoOf(res))?.ok).toBe(true);
  expect(warn).toHaveBeenCalledWith(
    '[provider-probe] veo ok=true transport:vertex · google-only:true · vertex:ready · auth:mode:wif token:ok bucket:ok sign:ok',
  );
});

it('logs a failed step with the error text the auth check already redacted', async () => {
  mockAuth.mockResolvedValue({ ok: false, steps: ['mode:wif', 'token:failed HTTP 400: invalid_grant'] });
  const res = await GET(req());
  expect((await veoOf(res))?.ok).toBe(false);
  expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[provider-probe\] veo ok=false .*token:failed HTTP 400: invalid_grant$/));
});

it('logs the missing variable names and skips the auth check when Vertex is not configured', async () => {
  mockTransport.mockReturnValue(null);
  mockProblems.mockReturnValue(['GCP_VEO_BUCKET']);
  await GET(req());
  expect(mockAuth).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith('[provider-probe] veo ok=false transport:none · google-only:true · vertex:missing GCP_VEO_BUCKET');
});

// Speech runs on Cloud TTS since PR 5d: the probe asks its free voices list, and ElevenLabs is never asked, even with a key.
it('reports the voice as Cloud TTS, and never calls ElevenLabs', async () => {
  process.env.ELEVENLABS_API_KEY = 'el-test-key';
  mockAuth.mockResolvedValue({ ok: true, steps: ['mode:wif', 'token:ok', 'bucket:ok', 'sign:ok'] });
  const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('{}', { status: 200 }));
  try {
    let body = (await (await GET(req())).json()) as { results: Array<{ provider: string; configured: boolean; ok: boolean; detail: string }> };
    expect(body.results.find((r) => r.provider === 'cloud-tts')).toEqual({
      provider: 'cloud-tts', configured: true, ok: true, detail: '4 ka-GE voices · best ka-GE-Chirp3-HD-Aoede',
    });
    expect(body.results.some((r) => r.provider === 'elevenlabs')).toBe(false);
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('elevenlabs.io'))).toBe(false);

    mockCloudTts.mockResolvedValue({ state: 'down', detail: 'voices list HTTP 403 (the Cloud Text-to-Speech API is off on the project, or the service account is not allowed)' });
    body = (await (await GET(req())).json()) as typeof body;
    expect(body.results.find((r) => r.provider === 'cloud-tts')).toMatchObject({ configured: true, ok: false, detail: expect.stringMatching(/HTTP 403/) });
    expect(JSON.stringify(body)).not.toContain('el-test-key');
  } finally {
    fetchSpy.mockRestore();
  }
});
