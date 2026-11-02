import { NextRequest } from 'next/server';
import { createServerClient } from '../../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This UI is deliberately gated: Supabase OAuth's default JWTs grant normal
// user-level RLS access and do not contain the MCP resource audience/scopes.
// Enabling it requires separately audited RLS, OAuth registration and claims.
const headers = {
  'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? '');
const page = (body: string, status = 200) => new Response(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>MyAvatar account access</title><style>body{font:16px system-ui;max-width:40rem;margin:3rem auto;padding:0 1rem;line-height:1.5}button{padding:.8rem;margin-right:.5rem}</style></head><body>${body}</body></html>`, { status, headers });
const configList = (name: string) => (process.env[name] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const enabled = () => process.env.MCP_OAUTH_CONSENT_ENABLED === 'true';
const invalid = () => page('<h1>Authorization unavailable</h1><p>The request is invalid, expired, or not permitted.</p>', 400);

function trustedRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false;
    return configList('MCP_GEMINI_ALLOWED_REDIRECT_URIS').includes(`${url.origin}${url.pathname}`);
  } catch { return false; }
}

async function authorize(id: string) {
  if (!id || id.length > 512 || /[\u0000-\u001f\u007f]/.test(id)) return null;
  const client = createServerClient();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) return null;
  const { data, error } = await client.auth.oauth.getAuthorizationDetails(id);
  // Auto-approved redirects do not provide enough information here to verify
  // the client. Refuse rather than following an unverified redirect.
  if (error || !data || !('authorization_id' in data) || data.authorization_id !== id || data.user.id !== user.id ||
      !configList('MCP_GEMINI_ALLOWED_CLIENT_IDS').includes(data.client.id) || !trustedRedirect(data.redirect_uri)) return null;
  const scopes = data.scope.split(/\s+/).filter(Boolean);
  if (!scopes.length || scopes.some((scope) => !['openid', 'email', 'profile', 'phone'].includes(scope))) return null;
  return { client, data, scopes };
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!enabled()) return page('<h1>Authorization unavailable</h1>', 404);
  try {
    const auth = await authorize(req.nextUrl.searchParams.get('authorization_id') ?? '');
    if (!auth) return invalid();
    return page(`<h1>Connect ${esc(auth.data.client.name)} to MyAvatar?</h1><p>This app is requesting access to your MyAvatar account. Review the requested identity permissions: ${esc(auth.scopes.join(', '))}.</p><p>Depending on the access policies configured for this client, it may also access your MyAvatar data and request actions on your behalf. Only approve an app you trust.</p><form method="post" action="/api/mcp/oauth/consent"><input type="hidden" name="authorization_id" value="${esc(auth.data.authorization_id)}"><button name="decision" value="approve">Allow access</button><button name="decision" value="deny">Deny</button></form>`);
  } catch { return page('<h1>Authorization unavailable</h1>', 503); }
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!enabled()) return page('<h1>Authorization unavailable</h1>', 404);
  if (!['https://myavatar.ge', 'https://www.myavatar.ge'].includes(req.headers.get('origin') ?? '')) return page('<h1>Forbidden</h1>', 403);
  const form = await req.formData().catch(() => null);
  const id = form?.get('authorization_id');
  const decision = form?.get('decision');
  if (typeof id !== 'string' || (decision !== 'approve' && decision !== 'deny')) return invalid();
  try {
    const auth = await authorize(id);
    if (!auth) return invalid();
    const result = decision === 'approve' ? await auth.client.auth.oauth.approveAuthorization(id) : await auth.client.auth.oauth.denyAuthorization(id);
    if (result.error || !result.data?.redirect_url || !trustedRedirect(result.data.redirect_url)) return invalid();
    return new Response(null, { status: 303, headers: { Location: result.data.redirect_url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch { return page('<h1>Authorization unavailable</h1>', 503); }
}
