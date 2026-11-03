import { mcpOAuthConfig } from '../../../../../../lib/mcp/gemini/auth';
import { brokerConfig } from '../../../../../../lib/mcp/gemini/oauth/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 9728 metadata; the AS itself must be configured and operated separately. */
export async function GET(): Promise<Response> {
  const config = mcpOAuthConfig();
  if (!config) return Response.json({ error: 'oauth_not_configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const broker = brokerConfig();
  return Response.json({
    resource: config.resource,
    authorization_servers: [broker ? new URL(broker.resource).origin : config.issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: broker && process.env.VERCEL_ENV === 'preview' ? ['mcp:read'] : ['mcp:read', 'mcp:write'],
  }, { headers: { 'Cache-Control': broker ? 'no-store' : 'public, max-age=300' } });
}
