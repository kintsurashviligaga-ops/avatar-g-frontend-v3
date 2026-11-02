import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { checkRateLimitByKey, RATE_LIMITS } from '../../../../lib/api/rate-limit';
import { authenticateMcp } from '../../../../lib/mcp/gemini/auth';
import { executeMcpTool } from '../../../../lib/mcp/gemini/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Browser origins must be explicitly trusted. Server-to-server requests normally
// omit Origin. This is not a replacement for bearer authentication.
function allowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const configured = (process.env.MCP_ALLOWED_ORIGINS ?? 'https://myavatar.ge,https://www.myavatar.ge')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return configured.includes(origin);
}

export async function POST(req: Request): Promise<Response> {
  if (process.env.MCP_GEMINI_ENABLED !== 'true') return new Response('Not found', { status: 404 });
  if (!allowedOrigin(req)) return new Response('Forbidden', { status: 403 });
  const principal = await authenticateMcp(req);
  if (!principal) return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="myavatar-mcp"', 'Cache-Control': 'no-store' } });

  const limited = await checkRateLimitByKey(principal.userId, { ...RATE_LIMITS.READ, keyPrefix: 'rl:mcp-gemini' });
  if (limited) return limited;

  const server = new McpServer({ name: 'myavatar-agent-ge', version: '0.1.0' }, {
    maxToolInputElements: 100,
    instructions: 'Use chat_with_agent to message Agent.ge and get_recent_works to list the authenticated user’s assets. Paid generation requires explicit first-party user approval; create_generation_task is currently disabled and will not create or charge for a task.',
  });
  server.registerTool('chat_with_agent', {
    description: 'Send a message to Agent.ge and return its response.',
    inputSchema: { message: z.string().trim().min(1).max(4000), locale: z.enum(['ka', 'en', 'ru']).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, (args) => executeMcpTool('chat_with_agent', args, principal));
  server.registerTool('get_recent_works', {
    description: 'List recent generated works owned by the authenticated user.',
    inputSchema: { limit: z.number().int().min(1).max(20).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, (args) => executeMcpTool('get_recent_works', args, principal));
  server.registerTool('create_generation_task', {
    description: 'Request a video or audio generation. Requires first-party manual user approval and is unavailable until that flow is configured.',
    inputSchema: { kind: z.enum(['video', 'audio']), script: z.string().trim().min(1).max(5000), avatarId: z.string().min(1).max(128).optional(), aspectRatio: z.enum(['9:16', '16:9', '1:1']).optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, (args) => executeMcpTool('create_generation_task', args, principal));

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 65536 });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(req);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return new Response('MCP request failed', { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

// Stateless request/response does not retain SSE streams or server-side sessions.
export async function GET(): Promise<Response> { return new Response(null, { status: 405, headers: { Allow: 'POST' } }); }
export async function DELETE(): Promise<Response> { return new Response(null, { status: 405, headers: { Allow: 'POST' } }); }
