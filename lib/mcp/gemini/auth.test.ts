/** @jest-environment node */
import { authenticateMcp, mcpOAuthConfig } from './auth';
const getUser = jest.fn();
const getClaims = jest.fn();
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser, getClaims } }) }));
const req = (auth?: string) => new Request('https://myavatar.ge/api/mcp/gemini', { headers: auth ? { authorization: auth } : { cookie: 'session=untrusted' } });
const good = () => ({ iss: 'https://test.supabase.co/auth/v1', sub: 'user-1', aud: ['authenticated', 'https://myavatar.ge/api/mcp/gemini'], exp: Math.floor(Date.now() / 1000) + 300, client_id: 'gemini-client', scope: 'mcp:read mcp:write' });
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  process.env.MCP_GEMINI_RESOURCE_URL = 'https://myavatar.ge/api/mcp/gemini';
  process.env.MCP_GEMINI_ALLOWED_CLIENT_IDS = 'gemini-client';
  getClaims.mockResolvedValue({ data: { claims: good() }, error: null });
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.MCP_GEMINI_RESOURCE_URL; delete process.env.MCP_GEMINI_ALLOWED_CLIENT_IDS;
  jest.resetAllMocks();
});
test('requires explicit bearer and configured trusted issuer, resource and client', async () => {
  expect(await authenticateMcp(req())).toBeNull();
  expect(await authenticateMcp(req('Basic aaa'))).toBeNull();
  delete process.env.MCP_GEMINI_ALLOWED_CLIENT_IDS;
  expect(mcpOAuthConfig()).toBeNull();
  expect(await authenticateMcp(req('Bearer token'))).toBeNull();
  expect(getClaims).not.toHaveBeenCalled();
});
test('accepts a verified resource-bound delegated token for its matching active user', async () => {
  expect(await authenticateMcp(req('Bearer token'))).toEqual({ userId: 'user-1', token: 'token', clientId: 'gemini-client', scopes: ['mcp:read', 'mcp:write'] });
  expect(getClaims).toHaveBeenCalledWith('token');
  expect(getUser).toHaveBeenCalledWith('token');
});
test.each([
  ['issuer', { iss: 'https://evil.example/auth/v1' }], ['audience', { aud: 'authenticated' }],
  ['client', { client_id: 'other-client' }], ['scope', { scope: 'openid email' }],
  ['expiry', { exp: 1 }], ['subject', { sub: '' }],
])('rejects a verified token with invalid %s', async (_label, overrides) => {
  getClaims.mockResolvedValue({ data: { claims: { ...good(), ...overrides } }, error: null });
  expect(await authenticateMcp(req('Bearer token'))).toBeNull();
  expect(getUser).not.toHaveBeenCalled();
});
test('rejects signature errors, user mismatches and auth outages', async () => {
  getClaims.mockResolvedValueOnce({ data: null, error: new Error('bad signature') });
  expect(await authenticateMcp(req('Bearer token'))).toBeNull();
  getUser.mockResolvedValueOnce({ data: { user: { id: 'other' } }, error: null });
  expect(await authenticateMcp(req('Bearer token'))).toBeNull();
  getClaims.mockRejectedValueOnce(new Error('offline'));
  expect(await authenticateMcp(req('Bearer token'))).toBeNull();
});
test('rejects insecure or noncanonical trust anchors', () => {
  process.env.MCP_GEMINI_RESOURCE_URL = 'https://myavatar.ge/api/mcp/gemini?evil=1';
  expect(mcpOAuthConfig()).toBeNull();
  process.env.MCP_GEMINI_RESOURCE_URL = 'https://myavatar.ge/api/mcp/gemini';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test.supabase.co';
  expect(mcpOAuthConfig()).toBeNull();
});
