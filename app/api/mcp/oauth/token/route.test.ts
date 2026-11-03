/** @jest-environment node */
import { POST } from './route';
import { createServiceRoleClient } from '../../../../../lib/supabase/server';
import { newOpaqueToken } from '../../../../../lib/mcp/gemini/oauth/tokens';
import { brokerConfig } from '../../../../../lib/mcp/gemini/oauth/config';

jest.mock('server-only', () => ({}));
jest.mock('../../../../../lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }));
const secret = 'synthetic-client-secret-for-tests-only';
const id = 'synthetic-client';
const redirect = 'https://client.example.test/callback';
const resource = 'https://myavatar.ge/api/mcp/gemini';
const verifier = 'x'.repeat(43);

function request(values: Record<string, string>, headers: Record<string, string> = {}): Request {
  return new Request('https://myavatar.ge/api/mcp/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, ...headers },
    body: new URLSearchParams(values).toString(),
  });
}
beforeEach(() => {
  process.env.MCP_BROKER_EXPERIMENTAL = 'true';
  process.env.MCP_BROKER_CLIENT_ID = id;
  process.env.MCP_BROKER_CLIENT_SECRET = secret;
  process.env.MCP_BROKER_REDIRECT_URI = redirect;
  process.env.MCP_GEMINI_RESOURCE_URL = resource;
});
afterEach(() => {
  for (const key of ['MCP_BROKER_EXPERIMENTAL', 'MCP_BROKER_CLIENT_ID', 'MCP_BROKER_CLIENT_SECRET', 'MCP_BROKER_REDIRECT_URI', 'MCP_GEMINI_RESOURCE_URL']) delete process.env[key];
  jest.resetAllMocks();
});

test('is disabled by default and rejects wrong client authentication', async () => {
  delete process.env.MCP_BROKER_EXPERIMENTAL;
  expect((await POST(request({ grant_type: 'authorization_code' }))).status).toBe(404);
  process.env.MCP_BROKER_EXPERIMENTAL = 'true';
  expect((await POST(request({ grant_type: 'authorization_code' }, { authorization: 'Basic YmFkOmJhZA==' }))).status).toBe(401);
  expect(createServiceRoleClient).not.toHaveBeenCalled();
});

test('cannot be enabled in production while the broker is incomplete', () => {
  expect(brokerConfig({ ...process.env, NODE_ENV: 'production' })).toBeNull();
});

test('validates exact redirect, resource and S256 verifier before touching durable state', async () => {
  const code = newOpaqueToken('code');
  const invalid = await POST(request({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: 'https://evil.example/callback' }));
  expect(await invalid.json()).toEqual({ error: 'invalid_grant' });
  const target = await POST(request({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, resource: 'https://evil.example' }));
  expect(await target.json()).toEqual({ error: 'invalid_target' });
  expect(createServiceRoleClient).not.toHaveBeenCalled();
});

test('redeems once through the transactional function and returns only granted scopes', async () => {
  const rpc = jest.fn().mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: ['mcp:read'], error: null });
  (createServiceRoleClient as jest.Mock).mockReturnValue({ rpc });
  const code = newOpaqueToken('code');
  const response = await POST(request({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, resource }));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 600, scope: 'mcp:read' });
  expect(body.access_token).toMatch(/^ma_at_/);
  expect(body.refresh_token).toMatch(/^ma_rt_/);
  expect(JSON.stringify(rpc.mock.calls)).not.toContain(code);
  expect(JSON.stringify(rpc.mock.calls)).not.toContain(body.access_token);
  expect(JSON.stringify(rpc.mock.calls)).not.toContain(body.refresh_token);
});

test('rejects a consumed refresh and never returns replacement tokens', async () => {
  const rpc = jest.fn().mockResolvedValue({ data: false, error: null });
  (createServiceRoleClient as jest.Mock).mockReturnValue({ rpc });
  const response = await POST(request({ grant_type: 'refresh_token', refresh_token: newOpaqueToken('refresh') }));
  expect(await response.json()).toEqual({ error: 'invalid_grant' });
  expect(rpc).toHaveBeenCalledTimes(1);
});
