/** @jest-environment node */
import { GET } from './route';
import { brokerConfig } from '../../../lib/mcp/gemini/oauth/config';
jest.mock('server-only', () => ({}));
jest.mock('../../../lib/mcp/gemini/oauth/config', () => ({ brokerConfig: jest.fn() }));

afterEach(() => { delete process.env.VERCEL_ENV; jest.resetAllMocks(); });
test('metadata is unavailable without the preview broker', async () => {
  (brokerConfig as jest.Mock).mockReturnValue(null);
  expect((await GET()).status).toBe(404);
});

test('advertises read scope only in preview', async () => {
  process.env.VERCEL_ENV = 'preview';
  (brokerConfig as jest.Mock).mockReturnValue({ resource: 'https://preview.vercel.app/api/mcp/gemini' });
  expect((await (await GET()).json()).scopes_supported).toEqual(['mcp:read']);
});
test('advertises pre-registered client capabilities with no invented registration endpoint', async () => {
  (brokerConfig as jest.Mock).mockReturnValue({ resource: 'https://preview.vercel.app/api/mcp/gemini' });
  const response = await GET();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ issuer:'https://preview.vercel.app', authorization_endpoint:'https://preview.vercel.app/api/mcp/broker/authorize',
    token_endpoint:'https://preview.vercel.app/api/mcp/oauth/token', revocation_endpoint:'https://preview.vercel.app/api/mcp/oauth/revoke',
    response_types_supported:['code'], grant_types_supported:['authorization_code','refresh_token'],
    token_endpoint_auth_methods_supported:['client_secret_basic','client_secret_post'], code_challenge_methods_supported:['S256'], scopes_supported:['mcp:read','mcp:write'] });
});
