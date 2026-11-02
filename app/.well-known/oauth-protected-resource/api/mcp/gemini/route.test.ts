/** @jest-environment node */
import { GET } from './route';
import { mcpOAuthConfig } from '../../../../../../lib/mcp/gemini/auth';

jest.mock('../../../../../../lib/mcp/gemini/auth', () => ({ mcpOAuthConfig: jest.fn() }));

test('does not publish misleading metadata without a configured issuer', async () => {
  (mcpOAuthConfig as jest.Mock).mockReturnValue(null);
  expect((await GET()).status).toBe(503);
});

test('publishes the configured resource and issuer without request-derived URLs', async () => {
  (mcpOAuthConfig as jest.Mock).mockReturnValue({ resource: 'https://myavatar.ge/api/mcp/gemini', issuer: 'https://auth.example.test/auth/v1' });
  const res = await GET();
  expect(await res.json()).toEqual({ resource: 'https://myavatar.ge/api/mcp/gemini', authorization_servers: ['https://auth.example.test/auth/v1'], bearer_methods_supported: ['header'], scopes_supported: ['mcp:read', 'mcp:write'] });
});
