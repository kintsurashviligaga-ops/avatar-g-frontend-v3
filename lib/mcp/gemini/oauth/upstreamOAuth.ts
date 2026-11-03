import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { mcpResourceUrl } from '../previewResource';

/** Isolated, unconnected broker helper. The calling flow must authenticate the
 * browser user and bind state and the verifier to a durable one-time request. */
export type UpstreamConfig = { issuer: string; clientId: string; clientSecret: string; redirectUri: string; anonKey: string };
export type UpstreamTokens = { accessToken: string; refreshToken: string; expiresAt: number; sessionId: string };
export type VerifiedUpstreamIdentity = { expiresAt: number; sessionId: string };
const sessionUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Verify cached or newly issued upstream credentials independently of the
 * downstream bearer. Return the signed expiry only for the expected user. */
export async function verifyUpstreamIdentity(config: UpstreamConfig, accessToken: string, expectedUserId: string): Promise<VerifiedUpstreamIdentity | null> {
  if (!accessToken || accessToken.length > 8192 || !expectedUserId || expectedUserId.length > 256) return null;
  try {
    const supabase = createClient(new URL(config.issuer).origin, config.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const claimsResult = await supabase.auth.getClaims(accessToken);
    const claims = claimsResult.data?.claims;
    const audience = Array.isArray(claims?.aud) ? claims.aud : [claims?.aud];
    if (claimsResult.error || !claims || claims.iss !== config.issuer || claims.sub !== expectedUserId || claims.client_id !== config.clientId ||
        !audience.includes('authenticated') || typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000) ||
        typeof claims.session_id !== 'string' || !sessionUuid.test(claims.session_id)) return null;
    const user = await supabase.auth.getUser(accessToken);
    return !user.error && user.data.user?.id === expectedUserId ? { expiresAt: claims.exp * 1000, sessionId: claims.session_id } : null;
  } catch { return null; }
}

export async function verifyUpstreamAccess(config: UpstreamConfig, accessToken: string, expectedUserId: string): Promise<number | null> {
  return (await verifyUpstreamIdentity(config, accessToken, expectedUserId))?.expiresAt ?? null;
}

/** All values must come from server settings, never model or browser input. */
export function upstreamConfig(env: NodeJS.ProcessEnv = process.env): UpstreamConfig | null {
  const root = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const clientId = env.MCP_BROKER_UPSTREAM_CLIENT_ID ?? '';
  const clientSecret = env.MCP_BROKER_UPSTREAM_CLIENT_SECRET ?? '';
  const resource = mcpResourceUrl(env) ?? '';
  try {
    const url = new URL(root);
    const target = new URL(resource);
    const derivedPreviewRedirect = env.VERCEL_ENV === 'preview' && resource
      ? `${target.origin}/api/mcp/oauth/upstream/callback` : '';
    const redirectUri = env.MCP_BROKER_UPSTREAM_REDIRECT_URI || derivedPreviewRedirect;
    const redirect = new URL(redirectUri);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || root !== url.origin ||
        target.protocol !== 'https:' || target.pathname !== '/api/mcp/gemini' || target.username || target.password || target.search || target.hash ||
        redirect.protocol !== 'https:' || redirect.origin !== target.origin || redirect.pathname !== '/api/mcp/oauth/upstream/callback' ||
        redirect.username || redirect.password || redirect.search || redirect.hash || redirect.href !== redirectUri ||
        !anonKey || !clientId || clientId.length > 256 || Buffer.byteLength(clientSecret) < 32 || clientSecret.length > 4096) return null;
    return { issuer: `${url.origin}/auth/v1`, clientId, clientSecret, redirectUri, anonKey };
  } catch { return null; }
}

export function upstreamAuthorizationUrl(config: UpstreamConfig, state: string, challenge: string): string | null {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return null;
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: 'openid', state, code_challenge: challenge, code_challenge_method: 'S256' });
  return `${config.issuer}/oauth/authorize?${params.toString()}`;
}

async function boundedJson(response: Response): Promise<Record<string, unknown> | null> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 32768)) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; } finally { reader.releaseLock(); }
}

/** Exchange a one-time code, then validate the signed upstream OAuth subject
 * against the authenticated, state-bound first-party user. The caller must
 * encrypt and persist tokens without logging them; no persistence occurs here. */
export async function exchangeUpstreamCode(
  config: UpstreamConfig, code: string, verifier: string, expectedUserId: string, request: typeof fetch = fetch,
): Promise<UpstreamTokens | null> {
  if (!code || code.length > 4096 || /[\u0000-\u001f\u007f]/.test(code) ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !expectedUserId || expectedUserId.length > 256) return null;
  const form = new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: config.redirectUri });
  return exchangeUpstream(config, form, expectedUserId, null, request);
}

/** Refresh only under a durable per-grant lock. A null result is ambiguous:
 * Supabase may already have rotated the token, so the caller must mark the
 * grant uncertain and require re-linking; it must not retry the old token.
 * This helper is not a lock, a persistence layer, or a production flow. */
export async function refreshUpstreamToken(
  config: UpstreamConfig, refreshToken: string, expectedUserId: string, request: typeof fetch = fetch,
): Promise<UpstreamTokens | null> {
  if (!refreshToken || refreshToken.length > 8192 || /[\u0000-\u001f\u007f]/.test(refreshToken) ||
      !expectedUserId || expectedUserId.length > 256) return null;
  const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return exchangeUpstream(config, form, expectedUserId, refreshToken, request);
}

async function exchangeUpstream(
  config: UpstreamConfig, form: URLSearchParams, expectedUserId: string, previousRefresh: string | null, request: typeof fetch,
): Promise<UpstreamTokens | null> {
  try {
    // Supabase confidential clients default to client_secret_basic. RFC 6749
    // requires form-encoding each credential before joining it with a colon.
    const encodeCredential = (value: string) => new URLSearchParams([['', value]]).toString().slice(1);
    const basic = Buffer.from(`${encodeCredential(config.clientId)}:${encodeCredential(config.clientSecret)}`).toString('base64');
    const response = await request(`${config.issuer}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', authorization: `Basic ${basic}` }, body: form, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const data = await boundedJson(response);
    const accessToken = data?.access_token;
    const refreshToken = data?.refresh_token === undefined ? previousRefresh : data.refresh_token;
    const expiresIn = data?.expires_in;
    if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 8192 || typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 8192 ||
        typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 86400) return null;
    const identity = await verifyUpstreamIdentity(config, accessToken, expectedUserId);
    if (!identity) return null;
    return { accessToken, refreshToken, expiresAt: Math.min(identity.expiresAt, Date.now() + expiresIn * 1000), sessionId: identity.sessionId };
  } catch { return null; }
}
