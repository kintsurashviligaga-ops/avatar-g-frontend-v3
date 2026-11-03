import { createHash } from 'node:crypto';
import { createServiceRoleClient } from '../../../../../lib/supabase/server';
import { brokerConfig, clientCredentials, validClient } from '../../../../../lib/mcp/gemini/oauth/config';
import { formBody, oauthError, unique } from '../../../../../lib/mcp/gemini/oauth/http';
import { newOpaqueToken, opaqueTokenDigest } from '../../../../../lib/mcp/gemini/oauth/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Experimental token endpoint; remains unavailable unless explicitly enabled.
 * It cannot complete Gemini linking until the authorization and upstream token
 * exchange paths are implemented and the SQL proposal has been reviewed. */
export async function POST(req: Request): Promise<Response> {
  const config = brokerConfig();
  if (!config) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const form = await formBody(req);
  if (!form) return oauthError('invalid_request');
  const client = clientCredentials(req.headers.get('authorization'), form);
  if (!client || !validClient(config, client.id, client.secret)) return oauthError('invalid_client', 401);
  const type = unique(form, 'grant_type');
  if (!type) return oauthError('invalid_request');
  const resources = form.getAll('resource');
  if (resources.length > 1 || (resources.length === 1 && resources[0] !== config.resource)) return oauthError('invalid_target');

  const access = newOpaqueToken('access');
  const refresh = newOpaqueToken('refresh');
  const accessHash = opaqueTokenDigest('access', access)!;
  const refreshHash = opaqueTokenDigest('refresh', refresh)!;
  try {
    let result: { data: unknown; error: unknown };
    if (type === 'authorization_code') {
      const code = unique(form, 'code');
      const verifier = unique(form, 'code_verifier');
      const redirect = unique(form, 'redirect_uri');
      const codeHash = code && opaqueTokenDigest('code', code);
      if (!codeHash || !verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || redirect !== config.redirectUri) return oauthError('invalid_grant');
      const db = createServiceRoleClient();
      result = await db.rpc('mcp_oauth_redeem_code', {
        p_code_hash: codeHash, p_client_id: config.clientId, p_redirect_uri: redirect,
        p_resource: config.resource, p_s256_challenge: createHash('sha256').update(verifier, 'ascii').digest('base64url'),
        p_access_hash: accessHash, p_refresh_hash: refreshHash,
      });
    } else if (type === 'refresh_token') {
      const old = unique(form, 'refresh_token');
      const oldHash = old && opaqueTokenDigest('refresh', old);
      if (!oldHash || form.has('scope')) return oauthError('invalid_grant');
      const db = createServiceRoleClient();
      result = await db.rpc('mcp_oauth_rotate_refresh', {
        p_refresh_hash: oldHash, p_client_id: config.clientId, p_resource: config.resource,
        p_access_hash: accessHash, p_next_refresh_hash: refreshHash,
      });
    } else return oauthError('unsupported_grant_type');
    if (result.error) return oauthError('server_error', 500);
    if (result.data !== true) return oauthError('invalid_grant');
    const scopeResult = await createServiceRoleClient().rpc('mcp_oauth_access_scopes', { p_access_hash: accessHash, p_client_id: config.clientId, p_resource: config.resource });
    const scopes = scopeResult.data;
    if (scopeResult.error || !Array.isArray(scopes) || !scopes.includes('mcp:read') || scopes.some((s) => s !== 'mcp:read' && s !== 'mcp:write')) return oauthError('server_error', 500);
    if (process.env.VERCEL_ENV === 'preview' && scopes.includes('mcp:write')) return oauthError('invalid_scope');
    return Response.json({ access_token: access, token_type: 'Bearer', expires_in: 600, refresh_token: refresh, scope: scopes.join(' ') }, { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
  } catch { return oauthError('server_error', 500); }
}
