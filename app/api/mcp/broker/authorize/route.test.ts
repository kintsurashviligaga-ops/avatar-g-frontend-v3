/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { createServerClient, createServiceRoleClient } from '../../../../../lib/supabase/server';

jest.mock('server-only', () => ({}));
jest.mock('../../../../../lib/supabase/server', () => ({ createServerClient: jest.fn(), createServiceRoleClient: jest.fn() }));
const id = '00000000-0000-4000-8000-000000000001';
const pending = '00000000-0000-4000-8000-000000000002';
const resource = 'https://myavatar.ge/api/mcp/gemini';
const params = () => new URLSearchParams({ client_id: 'client', redirect_uri: 'https://client.example/callback', response_type: 'code', resource, state: 'state', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', scope: 'mcp:read mcp:write' });
const get = (query = params()) => new NextRequest(`https://myavatar.ge/api/mcp/broker/authorize?${query}`);
const post = (values: URLSearchParams, origin = 'https://myavatar.ge') => new NextRequest('https://myavatar.ge/api/mcp/broker/authorize', { method: 'POST', headers: { origin }, body: values });
const rpc = jest.fn();
beforeEach(() => {
  process.env.MCP_BROKER_EXPERIMENTAL = 'true';
  process.env.MCP_BROKER_CLIENT_ID = 'client';
  process.env.MCP_BROKER_CLIENT_SECRET = 'synthetic-secret-for-broker-tests-0123456789';
  process.env.MCP_BROKER_REDIRECT_URI = 'https://client.example/callback';
  process.env.MCP_GEMINI_RESOURCE_URL = resource;
  (createServerClient as jest.Mock).mockReturnValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id } }, error: null }) } });
  rpc.mockResolvedValue({ data: true, error: null });
  (createServiceRoleClient as jest.Mock).mockReturnValue({ rpc });
});
afterEach(() => {
  for (const key of ['MCP_BROKER_EXPERIMENTAL','MCP_BROKER_CLIENT_ID','MCP_BROKER_CLIENT_SECRET','MCP_BROKER_REDIRECT_URI','MCP_GEMINI_RESOURCE_URL']) delete process.env[key];
  jest.resetAllMocks();
});

test('stays closed by default and rejects tampered OAuth requests before storing anything', async () => {
  delete process.env.MCP_BROKER_EXPERIMENTAL;
  expect((await GET(get())).status).toBe(404);
  process.env.MCP_BROKER_EXPERIMENTAL = 'true';
  for (const [key,value] of [['client_id','bad'],['redirect_uri','https://evil.example/'],['resource','https://evil.example/'],['scope','mcp:write'],['code_challenge_method','plain']]) {
    const query = params(); query.set(key!,value!);
    expect((await GET(get(query))).status).toBe(400);
  }
  expect(createServiceRoleClient).not.toHaveBeenCalled();
});

test('requires a first-party signed-in user and stores validated bindings without issuing a grant', async () => {
  (createServerClient as jest.Mock).mockReturnValueOnce({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) } });
  expect((await GET(get())).status).toBe(401);
  const response = await GET(get());
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.text()).toContain('does not yet link your account');
  expect(rpc).toHaveBeenCalledWith('mcp_oauth_begin_pending', expect.objectContaining({ p_user_id: id, p_client_id: 'client', p_resource: resource, p_scopes: ['mcp:read','mcp:write'], p_code_challenge: 'x'.repeat(43), p_oauth_state: 'state' }));
  expect(rpc).toHaveBeenCalledTimes(1);
});

test('consent requires same-origin form and authenticates user again', async () => {
  const values = new URLSearchParams({ id: pending, decision: 'approve' });
  expect((await POST(post(values,'https://evil.example'))).status).toBe(403);
  const duplicate = new URLSearchParams(values); duplicate.append('decision','deny');
  expect((await POST(post(duplicate))).status).toBe(400);
  (createServerClient as jest.Mock).mockReturnValueOnce({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) } });
  expect((await POST(post(values))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
  const response = await POST(post(values));
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('No access was issued');
  expect(rpc).toHaveBeenCalledWith('mcp_oauth_decide_pending', { p_id: pending, p_user_id: id, p_approve: true });
  rpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await POST(post(values))).status).toBe(400);
});
