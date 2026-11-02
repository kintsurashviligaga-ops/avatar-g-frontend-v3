import { createClient } from '@supabase/supabase-js';

export type McpPrincipal = { userId: string; token: string; clientId: string; scopes: string[] };

/** Static configuration only: never construct trust anchors from request headers. */
export function mcpOAuthConfig(): { issuer: string; resource: string; clients: string[]; supabaseUrl: string; anonKey: string } | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const resource = process.env.MCP_GEMINI_RESOURCE_URL;
  const clients = (process.env.MCP_GEMINI_ALLOWED_CLIENT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!supabaseUrl || !anonKey || !resource || clients.length === 0) return null;
  try {
    const url = new URL(supabaseUrl);
    const target = new URL(resource);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/api/mcp/gemini' || target.search || target.hash ||
        resource !== target.href) return null;
    return { issuer: `${url.origin}/auth/v1`, resource, clients, supabaseUrl: url.origin, anonKey };
  } catch { return null; }
}

/**
 * Supabase verifies JWT signatures (JWKS or Auth-server validation), then we
 * require a delegated token explicitly bound to this resource and client.
 * Ordinary Supabase session JWTs do not grant access to this endpoint.
 */
export async function authenticateMcp(request: Request): Promise<McpPrincipal | null> {
  const match = /^Bearer ([^\s,]+)$/i.exec(request.headers.get('authorization') ?? '');
  const token = match?.[1];
  const cfg = mcpOAuthConfig();
  if (!token || token.length > 16384 || !cfg) return null;
  try {
    const client = createClient(cfg.supabaseUrl, cfg.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const verified = await client.auth.getClaims(token);
    const claims = verified.data?.claims;
    if (verified.error || !claims || claims.iss !== cfg.issuer || typeof claims.sub !== 'string' || !claims.sub ||
        typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(cfg.resource)) return null;
    const clientId = typeof claims.client_id === 'string' ? claims.client_id : '';
    if (!cfg.clients.includes(clientId)) return null;
    const scopes = typeof claims.scope === 'string' ? claims.scope.split(/\s+/).filter(Boolean) : [];
    if (!scopes.includes('mcp:read')) return null;
    // Check the user remains active and bind the verified JWT subject to that user.
    const { data, error } = await client.auth.getUser(token);
    if (error || data.user?.id !== claims.sub) return null;
    return { userId: claims.sub, token, clientId, scopes };
  } catch { return null; }
}
