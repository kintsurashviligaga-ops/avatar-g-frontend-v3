import { brokerConfig } from '../../../lib/mcp/gemini/oauth/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Metadata for the explicitly configured, pre-registered Gemini client.
 * DCR/CIMD are not implemented and must not be advertised. */
export async function GET(): Promise<Response> {
  const config = brokerConfig();
  if (!config) return Response.json({ error: 'oauth_not_configured' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const issuer = new URL(config.resource).origin;
  return Response.json({
    issuer,
    authorization_endpoint: `${issuer}/api/mcp/broker/authorize`,
    token_endpoint: `${issuer}/api/mcp/oauth/token`,
    revocation_endpoint: `${issuer}/api/mcp/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: process.env.VERCEL_ENV === 'preview' ? ['mcp:read'] : ['mcp:read', 'mcp:write'],
  }, { headers: { 'Cache-Control': 'no-store' } });
}
