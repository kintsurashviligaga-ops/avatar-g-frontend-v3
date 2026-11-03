/** @jest-environment node */
import { POST } from './route';
import { authenticateMcp, mcpOAuthConfig } from '../../../../lib/mcp/gemini/auth';
import { executeMcpTool } from '../../../../lib/mcp/gemini/tools';

jest.mock('../../../../lib/mcp/gemini/auth', () => ({ authenticateMcp: jest.fn(), mcpOAuthConfig: jest.fn() }));
jest.mock('../../../../lib/mcp/gemini/tools', () => ({ executeMcpTool: jest.fn() }));
const auth = authenticateMcp as jest.MockedFunction<typeof authenticateMcp>;
const run = executeMcpTool as jest.MockedFunction<typeof executeMcpTool>;

function request(body: unknown, extra: Record<string, string> = {}): Request {
  return new Request('https://myavatar.ge/api/mcp/gemini', {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer test-token', ...extra }, body: JSON.stringify(body),
  });
}
const call = (method: string, params?: unknown) => ({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) });

beforeEach(() => {
  process.env.MCP_GEMINI_ENABLED = 'true';
  delete process.env.MCP_ALLOWED_ORIGINS;
  (mcpOAuthConfig as jest.Mock).mockReturnValue({ resource: 'https://myavatar.ge/api/mcp/gemini' });
  auth.mockResolvedValue({ userId: 'user-1', token: 'test-token', clientId: 'gemini-client', scopes: ['mcp:read'] });
  run.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
});
afterEach(() => { delete process.env.MCP_GEMINI_ENABLED; delete process.env.VERCEL_ENV; jest.clearAllMocks(); });

test('disabled by default and rejects unauthenticated and untrusted origin requests', async () => {
  delete process.env.MCP_GEMINI_ENABLED;
  expect((await POST(request(call('tools/list')))).status).toBe(404);
  process.env.MCP_GEMINI_ENABLED = 'true';
  expect((await POST(request(call('tools/list'), { origin: 'https://evil.example' }))).status).toBe(403);
  auth.mockResolvedValue(null);
  const res = await POST(request(call('tools/list')));
  expect(res.status).toBe(401);
  expect(res.headers.get('www-authenticate')).toContain('resource_metadata="https://myavatar.ge/.well-known/oauth-protected-resource/api/mcp/gemini"');
  expect(run).not.toHaveBeenCalled();
});

test('SDK advertises tools with correct names and write annotation', async () => {
  const res = await POST(request(call('tools/list')));
  const body = await res.json();
  expect(body.result.tools.map((tool: {name:string}) => tool.name)).toEqual(['chat_with_agent', 'get_recent_works', 'create_generation_task']);
  expect(body.result.tools[2].annotations.readOnlyHint).toBe(false);
});

test('preview advertises and executes only the read-only works tool', async () => {
  process.env.VERCEL_ENV = 'preview';
  const listed = await (await POST(request(call('tools/list')))).json();
  expect(listed.result.tools.map((tool: {name:string}) => tool.name)).toEqual(['get_recent_works']);
  for (const name of ['chat_with_agent', 'create_generation_task']) {
    run.mockClear();
    const denied = await (await POST(request(call('tools/call', { name, arguments: { message:'hello', kind:'audio', script:'test' } })))).json();
    expect(denied.error || denied.result?.isError).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
  }
  await POST(request(call('tools/call', { name:'get_recent_works', arguments: { limit:2 } })));
  expect(run).toHaveBeenCalledWith('get_recent_works', { limit:2 }, expect.objectContaining({userId:'user-1'}));
});

test('valid tool call uses authenticated principal and malformed arguments never reach handler', async () => {
  const res = await POST(request(call('tools/call', { name: 'chat_with_agent', arguments: { message: 'Hello' } })));
  expect(res.status).toBe(200);
  expect(run).toHaveBeenCalledWith('chat_with_agent', { message: 'Hello' }, { userId: 'user-1', token: 'test-token', clientId: 'gemini-client', scopes: ['mcp:read'] });
  run.mockClear();
  const invalid = await POST(request(call('tools/call', { name: 'chat_with_agent', arguments: { message: '' } })));
  expect((await invalid.json()).result.isError).toBe(true);
  expect(run).not.toHaveBeenCalled();
});

test('SDK accepts MCP initialize with a stateless JSON response', async () => {
  const res = await POST(request(call('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } })));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.result.serverInfo.name).toBe('myavatar-agent-ge');
  expect(res.headers.get('mcp-session-id')).toBeNull();
});
