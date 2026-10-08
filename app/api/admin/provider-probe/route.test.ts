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
