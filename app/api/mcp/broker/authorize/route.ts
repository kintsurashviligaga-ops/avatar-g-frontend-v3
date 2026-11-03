import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createServerClient, createServiceRoleClient } from '../../../../../lib/supabase/server';
import { brokerConfig } from '../../../../../lib/mcp/gemini/oauth/config';
import { parseAuthorizationRequest } from '../../../../../lib/mcp/gemini/oauth/authorization';
import { upstreamAuthorizationUrl, upstreamConfig } from '../../../../../lib/mcp/gemini/oauth/upstreamOAuth';
import { brokerEncryptionKey, sealUpstreamToken } from '../../../../../lib/mcp/gemini/oauth/upstreamSecrets';
import { newUpstreamRequest, upstreamStateDigest } from '../../../../../lib/mcp/gemini/oauth/upstreamState';
import { formBody } from '../../../../../lib/mcp/gemini/oauth/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This is an experimental consent prototype, never available in production.
// The upstream exchange remains experimental and is never enabled in production.
const headers = {
  'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
};
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? '');
const page = (body: string, status = 200) => new Response(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>MyAvatar account access</title><style>body{font:16px system-ui;max-width:40rem;margin:3rem auto;padding:0 1rem;line-height:1.5}button{padding:.8rem;margin-right:.5rem}</style></head><body>${body}</body></html>`, { status, headers });
const invalid = () => page('<h1>Authorization unavailable or expired</h1>', 400);
const unavailable = () => page('<h1>Authorization unavailable</h1>', 404);
const signIn = () => page('<h1>Sign in to MyAvatar</h1><p>Sign in, then reopen the authorization link.</p>', 401);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function userId(): Promise<string | null> {
  // Cookie-authenticated first-party session only; never accept an MCP bearer.
  const { data: { user }, error } = await createServerClient().auth.getUser();
  return error || !user ? null : user.id;
}

export async function GET(req: NextRequest): Promise<Response> {
  const config = brokerConfig();
  if (!config) return unavailable();
  const request = parseAuthorizationRequest(req.nextUrl.searchParams, config, process.env.VERCEL_ENV === 'preview');
  if (!request) return invalid();
  try {
    const user = await userId();
    if (!user) return signIn();
    const id = randomUUID();
    const { data, error } = await createServiceRoleClient().rpc('mcp_oauth_begin_pending', {
      p_id: id, p_user_id: user, p_client_id: config.clientId, p_redirect_uri: config.redirectUri,
      p_resource: config.resource, p_scopes: request.scopes, p_code_challenge: request.challenge, p_oauth_state: request.state,
    });
    if (error) return page('<h1>Authorization unavailable</h1>', 503);
    if (data !== true) return page('<h1>Too many authorization requests</h1><p>Try again later.</p>', 429);
    const write = request.scopes.includes('mcp:write') ? '<li>Request generations, which may use credits after separate approval.</li>' : '';
    return page(`<h1>Connect ${escape(config.clientId)} to MyAvatar?</h1><p>The client requests these permissions:</p><ul><li>Send messages to Agent G and view your recent works.</li>${write}</ul><p>This experimental feature is being tested and is not available in production.</p><form method="post" action="/api/mcp/broker/authorize"><input type="hidden" name="id" value="${id}"><button name="decision" value="approve">Approve</button><button name="decision" value="deny">Deny</button></form>`);
  } catch { return page('<h1>Authorization unavailable</h1>', 503); }
}

export async function POST(req: NextRequest): Promise<Response> {
  const config = brokerConfig();
  if (!config) return unavailable();
  if (req.headers.get('origin') !== new URL(config.resource).origin) return page('<h1>Forbidden</h1>', 403);
  try {
    const user = await userId();
    if (!user) return signIn();
    const form = await formBody(req);
    const ids = form?.getAll('id') ?? [];
    const decisions = form?.getAll('decision') ?? [];
    const id = ids[0];
    const decision = decisions[0];
    if (ids.length !== 1 || decisions.length !== 1 || typeof id !== 'string' || !uuid.test(id) ||
        (decision !== 'approve' && decision !== 'deny')) return invalid();
    if (decision === 'deny') {
      const denied = await createServiceRoleClient().rpc('mcp_oauth_deny_pending', {
        p_id: id, p_user_id: user, p_client_id: config.clientId, p_redirect_uri: config.redirectUri, p_resource: config.resource,
      });
      if (denied.error) return page('<h1>Authorization unavailable</h1>', 503);
      const state: unknown = Array.isArray(denied.data) && denied.data.length === 1 ? denied.data[0]?.oauth_state : null;
      if (typeof state !== 'string' || !state || state.length > 1024 || /[\u0000-\u001f\u007f]/.test(state)) return invalid();
      const redirect = new URL(config.redirectUri);
      redirect.searchParams.set('error', 'access_denied');
      redirect.searchParams.set('state', state);
      return new Response(null, { status: 303, headers: { Location: redirect.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    }
    const upstream = upstreamConfig();
    const key = brokerEncryptionKey();
    if (!upstream || !key) return page('<h1>Authorization unavailable</h1>', 503);
    const { data, error } = await createServiceRoleClient().rpc('mcp_oauth_decide_pending', {
      p_id: id, p_user_id: user, p_approve: true,
    });
    if (error) return page('<h1>Authorization unavailable</h1>', 503);
    if (data !== true) return invalid();
    const link = newUpstreamRequest();
    const stateHash = upstreamStateDigest(link.state);
    const verifier = sealUpstreamToken(link.verifier, { grantId: id, userId: user, clientId: config.clientId }, 'pkce', key);
    const location = upstreamAuthorizationUrl(upstream, link.state, link.challenge);
    if (!stateHash || !verifier || !location) return page('<h1>Authorization unavailable</h1>', 503);
    const started = await createServiceRoleClient().rpc('mcp_oauth_start_upstream', {
      p_id: id, p_user_id: user, p_client_id: config.clientId, p_redirect_uri: config.redirectUri,
      p_resource: config.resource, p_state_hash: stateHash, p_verifier_ciphertext: verifier,
    });
    if (started.error || started.data !== true) return page('<h1>Authorization unavailable</h1>', 503);
    return new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch { return page('<h1>Authorization unavailable</h1>', 503); }
}
