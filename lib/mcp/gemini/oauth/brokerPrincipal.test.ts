/** @jest-environment node */
import { resolveBrokerPrincipal } from './brokerPrincipal';
import { newOpaqueToken } from './tokens';
import { sealUpstreamToken, openUpstreamToken } from './upstreamSecrets';
import { verifyUpstreamIdentity, refreshUpstreamToken } from './upstreamOAuth';
import { createServiceRoleClient } from '../../../supabase/server';

jest.mock('server-only', () => ({}));
jest.mock('../../../supabase/server', () => ({ createServiceRoleClient: jest.fn() }));
jest.mock('./upstreamOAuth', () => ({
  upstreamConfig: () => ({issuer:'https://test.supabase.co/auth/v1',clientId:'upstream',clientSecret:'secret',redirectUri:'https://myavatar.ge/api/mcp/oauth/upstream/callback',anonKey:'anon'}),
  verifyUpstreamIdentity: jest.fn(), refreshUpstreamToken: jest.fn(),
}));
const userId = '00000000-0000-4000-8000-000000000001';
const grantId = '00000000-0000-4000-8000-000000000002';
const binding = { grantId, userId, clientId: 'client' };
const upstreamSession = '00000000-0000-4000-8000-000000000004';
const key = Buffer.alloc(32,7);
const token = newOpaqueToken('access');
const row = () => ({grant_id:grantId,user_id:userId,upstream_session_id:upstreamSession,scopes:['mcp:read','mcp:write'],access_ciphertext:sealUpstreamToken('cached-user-token',binding,'access',key),access_expires_at:new Date(Date.now()+300_000).toISOString()});
const rpc = jest.fn();

beforeEach(() => {
  process.env.MCP_BROKER_EXPERIMENTAL='true'; process.env.MCP_BROKER_CLIENT_ID='client';
  process.env.MCP_BROKER_CLIENT_SECRET='synthetic-client-secret-for-tests-only';
  process.env.MCP_BROKER_REDIRECT_URI='https://client.example/callback'; process.env.MCP_GEMINI_RESOURCE_URL='https://myavatar.ge/api/mcp/gemini';
  process.env.MCP_BROKER_ENCRYPTION_KEY=key.toString('base64');
  (createServiceRoleClient as jest.Mock).mockReturnValue({rpc});
  rpc.mockResolvedValue({data:[row()],error:null});
  (verifyUpstreamIdentity as jest.Mock).mockResolvedValue({expiresAt:Date.now()+300_000,sessionId:upstreamSession});
});
afterEach(() => { for (const k of ['MCP_BROKER_EXPERIMENTAL','MCP_BROKER_CLIENT_ID','MCP_BROKER_CLIENT_SECRET','MCP_BROKER_REDIRECT_URI','MCP_GEMINI_RESOURCE_URL','MCP_BROKER_ENCRYPTION_KEY','VERCEL_ENV','VERCEL_URL','MCP_BROKER_PREVIEW_ENABLED','MCP_BROKER_PREVIEW_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL']) delete process.env[k]; jest.resetAllMocks(); });

test('default off, malformed bearer, missing grant and invalid scopes all fail closed', async () => {
  delete process.env.MCP_BROKER_EXPERIMENTAL;
  expect(await resolveBrokerPrincipal(token)).toBeNull();
  process.env.MCP_BROKER_EXPERIMENTAL='true';
  expect(await resolveBrokerPrincipal('bad')).toBeNull();
  rpc.mockResolvedValueOnce({data:[],error:null});
  expect(await resolveBrokerPrincipal(token)).toBeNull(); // expired, revoked or wrong resource/client
  rpc.mockResolvedValueOnce({data:[{...row(),scopes:['mcp:write']}],error:null});
  expect(await resolveBrokerPrincipal(token)).toBeNull();
  rpc.mockResolvedValueOnce({data:[{...row(),scopes:['mcp:read','admin']}],error:null});
  expect(await resolveBrokerPrincipal(token)).toBeNull();
});

test('returns only a verified user RLS token and rechecks the grant after verification', async () => {
  expect(await resolveBrokerPrincipal(token)).toEqual({userId,token:'cached-user-token',clientId:'client',scopes:['mcp:read','mcp:write']});
  expect(verifyUpstreamIdentity).toHaveBeenCalledWith(expect.anything(),'cached-user-token',userId);
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc.mock.calls[0]![1]).toMatchObject({p_client_id:'client',p_resource:'https://myavatar.ge/api/mcp/gemini'});
  expect(JSON.stringify(rpc.mock.calls)).not.toContain(token);
  (verifyUpstreamIdentity as jest.Mock).mockResolvedValueOnce(null); // bad signature, audience or subject
  expect(await resolveBrokerPrincipal(token)).toBeNull();
  rpc.mockResolvedValueOnce({data:[row()],error:null}).mockResolvedValueOnce({data:[],error:null});
  expect(await resolveBrokerPrincipal(token)).toBeNull(); // revoked during verification
});

test('preview rejects previously issued write grants even if the lookup is otherwise valid', async () => {
  process.env.VERCEL_ENV='preview'; process.env.VERCEL_URL='test.vercel.app'; process.env.MCP_BROKER_PREVIEW_ENABLED='true';
  process.env.MCP_GEMINI_RESOURCE_URL='https://test.vercel.app/api/mcp/gemini';
  process.env.MCP_BROKER_PREVIEW_SUPABASE_URL='https://test.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';
  expect(await resolveBrokerPrincipal(token)).toBeNull();
  expect(verifyUpstreamIdentity).not.toHaveBeenCalled();
});

test('serializes refresh, persists both encrypted credentials and rechecks the grant', async () => {
  const stale = {...row(),access_ciphertext:null,access_expires_at:null};
  rpc.mockImplementation(async (name: string) => {
    if (name === 'mcp_oauth_resolve_access_v2') return {data:[stale],error:null};
    if (name === 'mcp_oauth_claim_upstream_refresh') return {data:sealUpstreamToken('old-refresh',binding,'refresh',key),error:null};
    return {data:true,error:null};
  });
  (refreshUpstreamToken as jest.Mock).mockResolvedValue({accessToken:'new-user-token',refreshToken:'rotated-refresh',expiresAt:Date.now()+300_000,sessionId:upstreamSession});
  expect(await resolveBrokerPrincipal(token)).toMatchObject({userId,token:'new-user-token'});
  const claim = rpc.mock.calls.find(([n]) => n === 'mcp_oauth_claim_upstream_refresh')![1];
  const saved = rpc.mock.calls.find(([n]) => n === 'mcp_oauth_complete_upstream_refresh_v2')![1];
  expect(saved.p_claim_id).toBe(claim.p_claim_id);
  expect(openUpstreamToken(saved.p_access_ciphertext,binding,'access',key)).toBe('new-user-token');
  expect(openUpstreamToken(saved.p_refresh_ciphertext,binding,'refresh',key)).toBe('rotated-refresh');
  expect(refreshUpstreamToken).toHaveBeenCalledWith(expect.anything(),'old-refresh',userId);
  expect(rpc.mock.calls.filter(([n]) => n === 'mcp_oauth_uncertain_upstream_refresh')).toHaveLength(0);
});

test('contention does not retry and ambiguous refresh becomes uncertain', async () => {
  const stale = {...row(),access_ciphertext:null,access_expires_at:null};
  rpc.mockImplementation(async (name: string) => name === 'mcp_oauth_resolve_access_v2' ? {data:[stale],error:null} : {data:null,error:null});
  expect(await resolveBrokerPrincipal(token)).toBeNull();
  expect(refreshUpstreamToken).not.toHaveBeenCalled();
  rpc.mockImplementation(async (name: string) => name === 'mcp_oauth_resolve_access_v2' ? {data:[stale],error:null} : name === 'mcp_oauth_claim_upstream_refresh' ? {data:sealUpstreamToken('old-refresh',binding,'refresh',key),error:null} : {data:true,error:null});
  (refreshUpstreamToken as jest.Mock).mockResolvedValue(null);
  expect(await resolveBrokerPrincipal(token)).toBeNull();
  expect(rpc.mock.calls.filter(([n]) => n === 'mcp_oauth_uncertain_upstream_refresh')).toHaveLength(1);
  expect(rpc.mock.calls.filter(([n]) => n === 'mcp_oauth_complete_upstream_refresh_v2')).toHaveLength(0);
});

test('rejects a cached or refreshed token from another upstream session', async () => {
  (verifyUpstreamIdentity as jest.Mock).mockResolvedValueOnce({expiresAt:Date.now()+300_000,sessionId:'00000000-0000-4000-8000-000000000099'});
  expect(await resolveBrokerPrincipal(token)).toBeNull();
  const stale = {...row(),access_ciphertext:null,access_expires_at:null};
  rpc.mockImplementation(async (name: string) => name === 'mcp_oauth_resolve_access_v2' ? {data:[stale],error:null} : name === 'mcp_oauth_claim_upstream_refresh' ? {data:sealUpstreamToken('old-refresh',binding,'refresh',key),error:null} : {data:true,error:null});
  (refreshUpstreamToken as jest.Mock).mockResolvedValue({accessToken:'access',refreshToken:'new-refresh',expiresAt:Date.now()+300_000,sessionId:'00000000-0000-4000-8000-000000000099'});
  expect(await resolveBrokerPrincipal(token)).toBeNull();
  expect(rpc.mock.calls.filter(([name]) => name === 'mcp_oauth_uncertain_upstream_refresh')).toHaveLength(1);
  expect(rpc.mock.calls.filter(([name]) => name === 'mcp_oauth_complete_upstream_refresh_v2')).toHaveLength(0);
});
