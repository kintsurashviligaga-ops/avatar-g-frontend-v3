/** @jest-environment node */
import { GET } from './route';
import { mcpOAuthConfig } from '../../../../../../lib/mcp/gemini/auth';
import { brokerConfig } from '../../../../../../lib/mcp/gemini/oauth/config';

jest.mock('../../../../../../lib/mcp/gemini/auth', () => ({ mcpOAuthConfig: jest.fn() }));
jest.mock('../../../../../../lib/mcp/gemini/oauth/config', () => ({ brokerConfig: jest.fn() }));
afterEach(() => { delete process.env.VERCEL_ENV; jest.resetAllMocks(); });

test('does not publish misleading metadata without a configured issuer', async () => {
  (mcpOAuthConfig as jest.Mock).mockReturnValue(null);
  expect((await GET()).status).toBe(503);
});

test('points the protected resource to its broker issuer when explicitly configured', async () => {
  process.env.VERCEL_ENV = 'preview';
  (mcpOAuthConfig as jest.Mock).mockReturnValue({ resource: 'https://preview.vercel.app/api/mcp/gemini', issuer: 'https://auth.example.test/auth/v1' });
  (brokerConfig as jest.Mock).mockReturnValue({ resource: 'https://preview.vercel.app/api/mcp/gemini' });
  const data = await (await GET()).json();
  expect(data.authorization_servers).toEqual(['https://preview.vercel.app']);
  expect(data.scopes_supported).toEqual(['mcp:read']);
});

test('publishes the configured resource and issuer without request-derived URLs', async () => {
  (mcpOAuthConfig as jest.Mock).mockReturnValue({ resource: 'https://myavatar.ge/api/mcp/gemini', issuer: 'https://auth.example.test/auth/v1' });
  const res = await GET();
  expect(await res.json()).toEqual({ resource: 'https://myavatar.ge/api/mcp/gemini', authorization_servers: ['https://auth.example.test/auth/v1'], bearer_methods_supported: ['header'], scopes_supported: ['mcp:read', 'mcp:write'] });
});
