/** @jest-environment node */
import { POST } from './route';
import { createServiceRoleClient } from '../../../../../lib/supabase/server';
import { newOpaqueToken } from '../../../../../lib/mcp/gemini/oauth/tokens';

jest.mock('server-only', () => ({}));
jest.mock('../../../../../lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }));
const secret = 'synthetic-client-secret-for-tests-only';

function request(token: string): Request {
  return new Request('https://myavatar.ge/api/mcp/oauth/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`client:${secret}`).toString('base64')}` }, body: new URLSearchParams({ token }).toString() });
}
beforeEach(() => {
  process.env.MCP_BROKER_EXPERIMENTAL = 'true'; process.env.MCP_BROKER_CLIENT_ID = 'client'; process.env.MCP_BROKER_CLIENT_SECRET = secret;
  process.env.MCP_BROKER_REDIRECT_URI = 'https://client.example.test/callback'; process.env.MCP_GEMINI_RESOURCE_URL = 'https://myavatar.ge/api/mcp/gemini';
});
afterEach(() => { for (const key of ['MCP_BROKER_EXPERIMENTAL', 'MCP_BROKER_CLIENT_ID', 'MCP_BROKER_CLIENT_SECRET', 'MCP_BROKER_REDIRECT_URI', 'MCP_GEMINI_RESOURCE_URL']) delete process.env[key]; jest.resetAllMocks(); });

test('revokes a known token by digest and returns success for unknown tokens', async () => {
  const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
  (createServiceRoleClient as jest.Mock).mockReturnValue({ rpc });
  const token = newOpaqueToken('refresh');
  expect((await POST(request(token))).status).toBe(200);
  expect(JSON.stringify(rpc.mock.calls)).not.toContain(token);
  expect((await POST(request('unknown'))).status).toBe(200);
  expect(rpc).toHaveBeenCalledTimes(1);
});
