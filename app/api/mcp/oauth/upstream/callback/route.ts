import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createServerClient, createServiceRoleClient } from '../../../../../../lib/supabase/server';
import { brokerConfig } from '../../../../../../lib/mcp/gemini/oauth/config';
import { upstreamConfig, exchangeUpstreamCode } from '../../../../../../lib/mcp/gemini/oauth/upstreamOAuth';
import { brokerEncryptionKey, openUpstreamToken, sealUpstreamToken } from '../../../../../../lib/mcp/gemini/oauth/upstreamSecrets';
import { upstreamStateDigest } from '../../../../../../lib/mcp/gemini/oauth/upstreamState';
import { newOpaqueToken, opaqueTokenDigest } from '../../../../../../lib/mcp/gemini/oauth/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };
const fail = (status = 400) => new Response('Authorization unavailable or expired. Start again.', { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest): Promise<Response> {
  const config = brokerConfig();
  if (!config) return fail(404);
  const upstream = upstreamConfig();
  const key = brokerEncryptionKey();
  if (!upstream || !key) return fail(503);
  const states = req.nextUrl.searchParams.getAll('state');
  const codes = req.nextUrl.searchParams.getAll('code');
  if (states.length !== 1 || codes.length !== 1 || req.nextUrl.searchParams.has('error')) return fail();
  const stateHash = upstreamStateDigest(states[0] ?? '');
  const code = codes[0] ?? '';
  if (!stateHash || !code || code.length > 4096 || /[\u0000-\u001f\u007f]/.test(code)) return fail();
  try {
    // Reauthenticate the same first-party browser user that approved consent.
    const browser = createServerClient();
    const { data: { user }, error } = await browser.auth.getUser();
    if (error || !user) return fail(401);
    const verified = await browser.auth.getClaims();
    const browserClaims = verified.data?.claims;
    const audience = Array.isArray(browserClaims?.aud) ? browserClaims.aud : [browserClaims?.aud];
    const browserSession = browserClaims?.session_id;
    if (verified.error || !browserClaims || browserClaims.iss !== upstream.issuer || browserClaims.sub !== user.id ||
        !audience.includes('authenticated') || typeof browserClaims.exp !== 'number' || browserClaims.exp <= Math.floor(Date.now()/1000) ||
        typeof browserSession !== 'string' || !uuid.test(browserSession)) return fail(401);
    const claim = randomUUID();
    const db = createServiceRoleClient();
    const result = await db.rpc('mcp_oauth_claim_upstream_code', {
      p_state_hash: stateHash, p_user_id: user.id, p_client_id: config.clientId,
      p_redirect_uri: config.redirectUri, p_resource: config.resource, p_claim: claim,
    });
    if (result.error || !Array.isArray(result.data) || result.data.length !== 1) return fail();
    const pending: unknown = result.data[0];
    if (!pending || typeof pending !== 'object') return fail();
    const row = pending as Record<string, unknown>;
    if (typeof row.pending_id !== 'string' || typeof row.verifier_ciphertext !== 'string' || typeof row.downstream_state !== 'string') return fail();
    const binding = { grantId: row.pending_id, userId: user.id, clientId: config.clientId };
    const verifier = openUpstreamToken(row.verifier_ciphertext, binding, 'pkce', key);
    if (!verifier) return fail();
    // This helper verifies signature, issuer, audience, client and exact subject
    // and checks the user remains active before returning tokens.
    const tokens = await exchangeUpstreamCode(upstream, code, verifier, user.id);
    if (!tokens || !uuid.test(tokens.sessionId) || tokens.sessionId.toLowerCase() === browserSession.toLowerCase() ||
        !Number.isFinite(tokens.expiresAt) || tokens.expiresAt <= Date.now() + 10_000) return fail();
    const grantId = randomUUID();
    const grantBinding = { grantId, userId: user.id, clientId: config.clientId };
    const encrypted = sealUpstreamToken(tokens.refreshToken, grantBinding, 'refresh', key);
    const encryptedAccess = sealUpstreamToken(tokens.accessToken, grantBinding, 'access', key);
    const downstreamCode = newOpaqueToken('code');
    const codeHash = opaqueTokenDigest('code', downstreamCode);
    if (!encrypted || !encryptedAccess || !codeHash) return fail(503);
    const finalized = await db.rpc('mcp_oauth_finalize_pending', {
      p_id: row.pending_id, p_user_id: user.id, p_verified_upstream_user_id: user.id,
      p_client_id: config.clientId, p_redirect_uri: config.redirectUri, p_resource: config.resource,
      p_grant_id: grantId, p_code_hash: codeHash, p_upstream_refresh_ciphertext: encrypted, p_claim: claim,
      p_upstream_session_id: tokens.sessionId, p_browser_session_id: browserSession,
      p_upstream_access_ciphertext: encryptedAccess, p_upstream_access_expires_at: new Date(tokens.expiresAt).toISOString(),
    });
    if (finalized.error || finalized.data !== true) return fail(503);
    const destination = new URL(config.redirectUri);
    destination.searchParams.set('code', downstreamCode);
    destination.searchParams.set('state', row.downstream_state);
    return new Response(null, { status: 303, headers: { Location: destination.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch { return fail(503); }
}
