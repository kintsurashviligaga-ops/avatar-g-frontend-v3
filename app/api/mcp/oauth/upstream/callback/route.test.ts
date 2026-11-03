/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET } from './route';
import { createServerClient, createServiceRoleClient } from '../../../../../../lib/supabase/server';
import { exchangeUpstreamCode } from '../../../../../../lib/mcp/gemini/oauth/upstreamOAuth';
import { sealUpstreamToken } from '../../../../../../lib/mcp/gemini/oauth/upstreamSecrets';
import { upstreamStateDigest } from '../../../../../../lib/mcp/gemini/oauth/upstreamState';

jest.mock('server-only', () => ({}));
jest.mock('../../../../../../lib/supabase/server', () => ({ createServerClient: jest.fn(), createServiceRoleClient: jest.fn() }));
jest.mock('../../../../../../lib/mcp/gemini/oauth/upstreamOAuth', () => ({
  upstreamConfig: () => ({ issuer: 'https://project.supabase.co/auth/v1', clientId: 'upstream', clientSecret: 'secret', redirectUri: 'https://myavatar.ge/api/mcp/oauth/upstream/callback', anonKey: 'anon' }),
  exchangeUpstreamCode: jest.fn(),
}));
const user = '00000000-0000-4000-8000-000000000001';
const pending = '00000000-0000-4000-8000-000000000002';
const browserSession = '00000000-0000-4000-8000-000000000003';
const upstreamSession = '00000000-0000-4000-8000-000000000004';
const state = 's'.repeat(43);
const verifier = 'v'.repeat(43);
const rpc = jest.fn();
const browserClaims = () => ({iss:'https://project.supabase.co/auth/v1',sub:user,aud:'authenticated',exp:Math.floor(Date.now()/1000)+300,session_id:browserSession});
const request = (query = new URLSearchParams({ state, code: 'upstream-code' })) => new NextRequest(`https://myavatar.ge/api/mcp/oauth/upstream/callback?${query}`);
beforeEach(() => {
  process.env.MCP_BROKER_EXPERIMENTAL='true'; process.env.MCP_BROKER_CLIENT_ID='client';
  process.env.MCP_BROKER_CLIENT_SECRET='synthetic-client-secret-for-tests-only';
  process.env.MCP_BROKER_REDIRECT_URI='https://client.example/callback'; process.env.MCP_GEMINI_RESOURCE_URL='https://myavatar.ge/api/mcp/gemini';
  process.env.MCP_BROKER_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
  (createServerClient as jest.Mock).mockReturnValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: user } }, error: null }), getClaims:jest.fn().mockResolvedValue({data:{claims:browserClaims()},error:null}) } });
  (createServiceRoleClient as jest.Mock).mockReturnValue({ rpc });
  rpc.mockImplementation(async (name: string) => name === 'mcp_oauth_claim_upstream_code'
    ? { data: [{ pending_id: pending, verifier_ciphertext: sealUpstreamToken(verifier,{grantId: pending,userId: user,clientId:'client'},'pkce',Buffer.alloc(32,7)), downstream_state: 'client-state' }], error: null }
    : { data: true, error: null });
  (exchangeUpstreamCode as jest.Mock).mockResolvedValue({ accessToken:'access',refreshToken:'refresh',expiresAt:Date.now()+60000,sessionId:upstreamSession });
});

test.each([undefined, '', 'bad', browserSession])('refuses missing, invalid or shared upstream session (%s)', async (sessionId) => {
  (exchangeUpstreamCode as jest.Mock).mockResolvedValueOnce({accessToken:'access',refreshToken:'refresh',expiresAt:Date.now()+60000,sessionId});
  expect((await GET(request())).status).toBe(400);
  expect(rpc.mock.calls.filter(([name]) => name === 'mcp_oauth_finalize_pending')).toHaveLength(0);
});

test.each([{session_id:undefined},{session_id:'bad'},{sub:'other'},{iss:'https://evil.example'},{aud:'other'},{exp:1}])('rejects invalid signed first-party claims', async (overrides) => {
  (createServerClient as jest.Mock).mockReturnValueOnce({auth:{getUser:jest.fn().mockResolvedValue({data:{user:{id:user}},error:null}),getClaims:jest.fn().mockResolvedValue({data:{claims:{...browserClaims(),...overrides}},error:null})}});
  expect((await GET(request())).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
afterEach(() => { for (const key of ['MCP_BROKER_EXPERIMENTAL','MCP_BROKER_CLIENT_ID','MCP_BROKER_CLIENT_SECRET','MCP_BROKER_REDIRECT_URI','MCP_GEMINI_RESOURCE_URL','MCP_BROKER_ENCRYPTION_KEY']) delete process.env[key]; jest.resetAllMocks(); });

test('refuses malformed or duplicate state and requires the cookie-authenticated user', async () => {
  expect((await GET(request(new URLSearchParams({state:'wrong',code:'x'})))).status).toBe(400);
  const q = new URLSearchParams({state,code:'x'}); q.append('state',state);
  expect((await GET(request(q))).status).toBe(400);
  (createServerClient as jest.Mock).mockReturnValueOnce({auth:{getUser:jest.fn().mockResolvedValue({data:{user:null},error:null})}});
  expect((await GET(request())).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});

test('rejects wrong state, replay, and failed upstream identity verification before finalization', async () => {
  rpc.mockResolvedValueOnce({ data: [], error: null });
  expect((await GET(request())).status).toBe(400);
  expect(exchangeUpstreamCode).not.toHaveBeenCalled();
  (exchangeUpstreamCode as jest.Mock).mockResolvedValueOnce(null);
  expect((await GET(request())).status).toBe(400);
  expect(rpc.mock.calls.filter(([name]) => name === 'mcp_oauth_finalize_pending')).toHaveLength(0);
});

test('does not exchange a verifier encrypted for a different browser user', async () => {
  rpc.mockResolvedValueOnce({ data: [{ pending_id: pending, verifier_ciphertext: sealUpstreamToken(verifier,
    { grantId: pending, userId: 'other-user', clientId: 'client' }, 'pkce', Buffer.alloc(32,7)), downstream_state: 'client-state' }], error: null });
  expect((await GET(request())).status).toBe(400);
  expect(exchangeUpstreamCode).not.toHaveBeenCalled();
});

test('claims once, exchanges using encrypted PKCE and redirects only after atomic finalization', async () => {
  const response = await GET(request());
  expect(response.status).toBe(303);
  expect(rpc).toHaveBeenCalledWith('mcp_oauth_claim_upstream_code', expect.objectContaining({p_state_hash:upstreamStateDigest(state),p_user_id:user}));
  expect(exchangeUpstreamCode).toHaveBeenCalledWith(expect.anything(),'upstream-code',verifier,user);
  const claim = rpc.mock.calls[0]![1].p_claim;
  expect(rpc).toHaveBeenCalledWith('mcp_oauth_finalize_pending',expect.objectContaining({p_id:pending,p_user_id:user,p_verified_upstream_user_id:user,p_claim:claim,p_upstream_session_id:upstreamSession,p_browser_session_id:browserSession}));
  const url = new URL(response.headers.get('location')!);
  expect(url.origin+url.pathname).toBe('https://client.example/callback');
  expect(url.searchParams.get('code')).toMatch(/^ma_code_/);
  expect(url.searchParams.get('state')).toBe('client-state');
  expect(rpc.mock.calls[1]![1].p_upstream_refresh_ciphertext).not.toBe('refresh');
});
