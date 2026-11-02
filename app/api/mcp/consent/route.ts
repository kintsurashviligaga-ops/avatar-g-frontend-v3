import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient, createServiceRoleClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = z.string().uuid();
const origins = new Set(['https://myavatar.ge', 'https://www.myavatar.ge']);
const headers = {
  'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
};
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? '');
function page(body: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>MyAvatar generation approval</title><style>body{font:16px system-ui;max-width:40rem;margin:3rem auto;padding:0 1rem;line-height:1.5}pre{white-space:pre-wrap;overflow-wrap:anywhere}button{padding:.8rem;margin-right:.5rem}</style></head><body>${body}</body></html>`, { status, headers });
}
async function signedInUser() {
  // Cookie-only: an MCP Bearer token must never impersonate a first-party tap.
  const client = createServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  return !error ? user : null;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (process.env.MCP_VIDEO_GENERATION_ENABLED !== 'true') return page('<h1>Approval unavailable</h1>', 404);
  const user = await signedInUser();
  if (!user) return page('<h1>Sign in to MyAvatar</h1><p>Sign in to the account that requested this task, then reopen this link.</p>', 401);
  const parsed = UUID.safeParse(req.nextUrl.searchParams.get('id'));
  if (!parsed.success) return page('<h1>Approval unavailable</h1>', 404);
  try {
    const { data, error } = await createServiceRoleClient().from('mcp_generation_approvals')
      .select('id,request,quoted_credits,expires_at').eq('id', parsed.data).eq('user_id', user.id)
      .eq('state', 'pending').gt('expires_at', new Date().toISOString()).maybeSingle();
    if (error || !data) return page('<h1>Approval unavailable or expired</h1>', 404);
    const r = data.request as Record<string, unknown>;
    if (!r || r.kind !== 'video' || typeof r.script !== 'string' || typeof r.avatarId !== 'string' || typeof r.aspectRatio !== 'string' || !Number.isInteger(data.quoted_credits)) return page('<h1>Approval unavailable</h1>', 404);
    return page(`<h1>Approve video generation?</h1><p>This will allow one generation attempt and may charge <strong>${data.quoted_credits} credits</strong>. Review the exact request:</p><p>Avatar: <code>${escape(r.avatarId)}</code><br>Aspect ratio: ${escape(r.aspectRatio)}</p><pre>${escape(r.script)}</pre><p>The approval expires at ${escape(data.expires_at)}.</p><form method="post" action="/api/mcp/consent"><input type="hidden" name="id" value="${escape(data.id)}"><button type="submit" name="decision" value="approve">Approve one attempt</button><button type="submit" name="decision" value="deny">Deny</button></form>`);
  } catch { return page('<h1>Approval unavailable</h1>', 503); }
}

export async function POST(req: NextRequest): Promise<Response> {
  if (process.env.MCP_VIDEO_GENERATION_ENABLED !== 'true') return page('<h1>Approval unavailable</h1>', 404);
  // Cross-site or missing Origin is rejected; an MCP request cannot use this
  // endpoint as a substitute for the user's first-party browser action.
  if (!origins.has(req.headers.get('origin') ?? '')) return page('<h1>Forbidden</h1>', 403);
  const user = await signedInUser();
  if (!user) return page('<h1>Sign in to MyAvatar</h1>', 401);
  const data = await req.formData().catch(() => null);
  const parsed = UUID.safeParse(data?.get('id'));
  const decision = data?.get('decision');
  if (!parsed.success || (decision !== 'approve' && decision !== 'deny')) return page('<h1>Invalid request</h1>', 400);
  try {
    const now = new Date().toISOString();
    const state = decision === 'approve' ? 'approved' : 'denied';
    const { data: updated, error } = await createServiceRoleClient().from('mcp_generation_approvals')
      .update({ state, ...(decision === 'approve' ? { approved_at: now } : {}) })
      .eq('id', parsed.data).eq('user_id', user.id).eq('state', 'pending').gt('expires_at', now)
      .select('id').maybeSingle();
    if (error || !updated) return page('<h1>Approval unavailable or expired</h1>', 409);
    return page(decision === 'approve'
      ? '<h1>Approved</h1><p>Return to the connected app to continue. This approval can be used once.</p>'
      : '<h1>Denied</h1><p>No task will be created.</p>');
  } catch { return page('<h1>Approval unavailable</h1>', 503); }
}
