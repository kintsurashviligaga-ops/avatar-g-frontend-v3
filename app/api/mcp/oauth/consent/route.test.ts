/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { createServerClient } from '../../../../../lib/supabase/server';

jest.mock('../../../../../lib/supabase/server', () => ({ createServerClient: jest.fn() }));
const details = { authorization_id: 'auth-id', client: { id: 'client-1', name: '<unsafe app>', uri: '', logo_uri: '' }, user: { id: 'user-1', email: 'test@example.test' }, redirect_uri: 'https://oauth-redirect.googleusercontent.com/r/app', scope: 'openid email' };
const getDetails = jest.fn();
const approve = jest.fn();
const deny = jest.fn();
const req = (origin: string) => new NextRequest('https://myavatar.ge/api/mcp/oauth/consent', { method: 'POST', headers: { origin }, body: new URLSearchParams({ authorization_id: 'auth-id', decision: 'approve' }) });

beforeEach(() => {
  process.env.MCP_OAUTH_CONSENT_ENABLED = 'true';
  process.env.MCP_GEMINI_ALLOWED_CLIENT_IDS = 'client-1';
  process.env.MCP_GEMINI_ALLOWED_REDIRECT_URIS = 'https://oauth-redirect.googleusercontent.com/r/app';
  getDetails.mockResolvedValue({ data: details, error: null });
  (createServerClient as jest.Mock).mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }), oauth: { getAuthorizationDetails: getDetails, approveAuthorization: approve, denyAuthorization: deny } } });
});
afterEach(() => { delete process.env.MCP_OAUTH_CONSENT_ENABLED; delete process.env.MCP_GEMINI_ALLOWED_CLIENT_IDS; delete process.env.MCP_GEMINI_ALLOWED_REDIRECT_URIS; jest.resetAllMocks(); });

test('disabled by default and rejects requests from other origins', async () => {
  delete process.env.MCP_OAUTH_CONSENT_ENABLED;
  expect((await GET(new NextRequest('https://myavatar.ge/api/mcp/oauth/consent?authorization_id=auth-id'))).status).toBe(404);
  process.env.MCP_OAUTH_CONSENT_ENABLED = 'true';
  expect((await POST(req('https://evil.test'))).status).toBe(403);
  expect(approve).not.toHaveBeenCalled();
});

test('renders verified request metadata escaped', async () => {
  const res = await GET(new NextRequest('https://myavatar.ge/api/mcp/oauth/consent?authorization_id=auth-id'));
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('&lt;unsafe app&gt;');
  expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
});

test('rejects a different client and an untrusted redirect', async () => {
  getDetails.mockResolvedValueOnce({ data: { ...details, client: { ...details.client, id: 'other' } }, error: null });
  expect((await POST(req('https://myavatar.ge'))).status).toBe(400);
  getDetails.mockResolvedValueOnce({ data: { ...details, redirect_uri: 'https://evil.test/callback' }, error: null });
  expect((await POST(req('https://myavatar.ge'))).status).toBe(400);
  expect(approve).not.toHaveBeenCalled();
});

test('only redirects to the registered destination after approval', async () => {
  approve.mockResolvedValue({ data: { redirect_url: 'https://oauth-redirect.googleusercontent.com/r/app?code=code&state=state' }, error: null });
  const res = await POST(req('https://myavatar.ge'));
  expect(res.status).toBe(303);
  expect(res.headers.get('location')).toContain('oauth-redirect.googleusercontent.com/r/app?');
});
