import { createServiceRoleClient } from '../../../../../lib/supabase/server';
import { brokerConfig, clientCredentials, validClient } from '../../../../../lib/mcp/gemini/oauth/config';
import { formBody, oauthError, unique } from '../../../../../lib/mcp/gemini/oauth/http';
import { opaqueTokenDigest } from '../../../../../lib/mcp/gemini/oauth/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 7009 local revocation prototype. Remote upstream revocation is not yet
 * wired, so this endpoint must remain disabled until the broker is complete. */
export async function POST(req: Request): Promise<Response> {
  const config = brokerConfig();
  if (!config) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const form = await formBody(req);
  if (!form) return oauthError('invalid_request');
  const client = clientCredentials(req.headers.get('authorization'), form);
  if (!client || !validClient(config, client.id, client.secret)) return oauthError('invalid_client', 401);
  const token = unique(form, 'token');
  if (!token) return oauthError('invalid_request');
  const hash = opaqueTokenDigest('access', token) ?? opaqueTokenDigest('refresh', token);
  if (hash) {
    try {
      const { error } = await createServiceRoleClient().rpc('mcp_oauth_revoke_token', { p_token_hash: hash, p_client_id: config.clientId, p_resource: config.resource });
      if (error) return oauthError('server_error', 500);
    } catch { return oauthError('server_error', 500); }
  }
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
}
