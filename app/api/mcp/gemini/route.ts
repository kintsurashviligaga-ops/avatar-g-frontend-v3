import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { checkRateLimitByKey, RATE_LIMITS } from '../../../../lib/api/rate-limit';
import { authenticateMcp, mcpOAuthConfig } from '../../../../lib/mcp/gemini/auth';
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
  const oauth = mcpOAuthConfig();
  if (!oauth) return new Response('OAuth not configured', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const principal = await authenticateMcp(req);
  if (!principal) {
    const metadata = new URL('/.well-known/oauth-protected-resource/api/mcp/gemini', oauth.resource).href;
    return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': `Bearer realm="myavatar-mcp", resource_metadata="${metadata}"`, 'Cache-Control': 'no-store' } });
  }

  const limited = await checkRateLimitByKey(principal.userId, { ...RATE_LIMITS.READ, keyPrefix: 'rl:mcp-gemini' });
  if (limited) return limited;

  const server = new McpServer({ name: 'myavatar-agent-ge', version: '0.1.0' }, {
    maxToolInputElements: 100,
    instructions: 'Use chat_with_agent to message Agent.ge and get_recent_works for the authenticated user’s assets. Audio generation is available only when enabled and requires first-party user approval: show the returned approval URL and retry the same request with its approvalId after the user approves. Never infer or provide approval on the user’s behalf. Video generation is unavailable.',
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
    description: 'Request an instrumental audio task when enabled. First request returns an approval URL; after the user approves, retry the same arguments with approvalId. Video is unavailable.',
    inputSchema: { kind: z.enum(['video', 'audio']), script: z.string().trim().min(1).max(2000), avatarId: z.string().uuid().optional(), aspectRatio: z.enum(['9:16', '16:9', '1:1']).optional(), approvalId: z.string().uuid().optional() },
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
