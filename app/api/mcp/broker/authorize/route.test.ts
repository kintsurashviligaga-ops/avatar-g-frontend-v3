/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { createServerClient, createServiceRoleClient } from '../../../../../lib/supabase/server';
import { openUpstreamToken } from '../../../../../lib/mcp/gemini/oauth/upstreamSecrets';
import { verifyS256Pkce } from '../../../../../lib/mcp/gemini/oauth/tokens';

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
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  process.env.MCP_BROKER_UPSTREAM_CLIENT_ID = 'upstream-client';
  process.env.MCP_BROKER_UPSTREAM_CLIENT_SECRET = 'synthetic-upstream-secret-0123456789';
  process.env.MCP_BROKER_UPSTREAM_REDIRECT_URI = 'https://myavatar.ge/api/mcp/oauth/upstream/callback';
  process.env.MCP_BROKER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  (createServerClient as jest.Mock).mockReturnValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id } }, error: null }) } });
  rpc.mockResolvedValue({ data: true, error: null });
  (createServiceRoleClient as jest.Mock).mockReturnValue({ rpc });
});
afterEach(() => {
  for (const key of ['MCP_BROKER_EXPERIMENTAL','MCP_BROKER_CLIENT_ID','MCP_BROKER_CLIENT_SECRET','MCP_BROKER_REDIRECT_URI','MCP_GEMINI_RESOURCE_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','MCP_BROKER_UPSTREAM_CLIENT_ID','MCP_BROKER_UPSTREAM_CLIENT_SECRET','MCP_BROKER_UPSTREAM_REDIRECT_URI','MCP_BROKER_ENCRYPTION_KEY']) delete process.env[key];
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
  expect(await response.text()).toContain('not available in production');
  expect(rpc).toHaveBeenCalledWith('mcp_oauth_begin_pending', expect.objectContaining({ p_user_id: id, p_client_id: 'client', p_resource: resource, p_scopes: ['mcp:read','mcp:write'], p_code_challenge: 'x'.repeat(43), p_oauth_state: 'state' }));
  expect(rpc).toHaveBeenCalledTimes(1);
});

test('a database limit rejects excess authorization requests', async () => {
  rpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await GET(get())).status).toBe(429);
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
  expect(response.status).toBe(303);
  expect(rpc).toHaveBeenCalledWith('mcp_oauth_decide_pending', { p_id: pending, p_user_id: id, p_approve: true });
  const location = new URL(response.headers.get('location')!);
  const start = rpc.mock.calls.find(([name]) => name === 'mcp_oauth_start_upstream')?.[1];
  const verifier = openUpstreamToken(start.p_verifier_ciphertext, { grantId: pending, userId: id, clientId: 'client' }, 'pkce', Buffer.alloc(32, 7));
  expect(verifier && verifyS256Pkce(verifier, location.searchParams.get('code_challenge') ?? '')).toBe(true);
  expect(start.p_state_hash).not.toContain(location.searchParams.get('state'));
  rpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await POST(post(values))).status).toBe(400);
});

test('rejects oversized consent forms before updating a grant', async () => {
  const large = new NextRequest('https://myavatar.ge/api/mcp/broker/authorize', { method:'POST',
    headers:{origin:'https://myavatar.ge','content-type':'application/x-www-form-urlencoded'}, body:'a='.padEnd(17000,'x') });
  expect((await POST(large)).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

test('denial atomically retrieves state and redirects only to the registered client once', async () => {
  rpc.mockResolvedValueOnce({ data:[{oauth_state:'opaque+client state'}], error:null });
  const values = new URLSearchParams({ id:pending, decision:'deny' });
  const response = await POST(post(values));
  expect(response.status).toBe(303);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  const redirect = new URL(response.headers.get('location')!);
  expect(`${redirect.origin}${redirect.pathname}`).toBe('https://client.example/callback');
  expect(redirect.searchParams.get('error')).toBe('access_denied');
  expect(redirect.searchParams.get('state')).toBe('opaque+client state');
  expect(rpc).toHaveBeenCalledWith('mcp_oauth_deny_pending', {p_id:pending,p_user_id:id,p_client_id:'client',p_redirect_uri:'https://client.example/callback',p_resource:resource});
  expect(rpc).toHaveBeenCalledTimes(1);
  rpc.mockResolvedValueOnce({data:[],error:null});
  expect((await POST(post(values))).status).toBe(400);
  rpc.mockResolvedValueOnce({data:null,error:{message:'not provisioned'}});
  expect((await POST(post(values))).status).toBe(503);
});

test('denial fails closed on malformed returned state', async () => {
  const values = new URLSearchParams({ id:pending, decision:'deny' });
  for (const state of ['', 'x'.repeat(1025), 'line\nbreak', 4]) {
    rpc.mockResolvedValueOnce({data:[{oauth_state:state}],error:null});
    expect((await POST(post(values))).status).toBe(400);
  }
});
