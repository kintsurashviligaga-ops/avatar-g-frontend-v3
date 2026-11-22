/**
 * POST /api/connectors/notion/pages { parentId, title, text } — the user's own Save on a Notion draft Agent G prepared
 * (notion_prepare_page). The model never reaches this: only the signed-in user's press does, with their own linked
 * token, under a page they shared with the integration. → { ok, id, url } | { error }.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { closedGate, liveRouteEnv, NO_STORE } from '@/lib/connectors/oauth/routes';
import { linkedToken } from '@/lib/connectors/oauth/token';
import { notionCreatePage, notionSpec } from '@/lib/connectors/notion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  parentId: z.string().trim().regex(/^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(20_000),
});

export async function POST(req: NextRequest): Promise<Response> {
  const env = await liveRouteEnv();
  // CONNECTORS_NOTION off = a plain 404 before anything else (Phase 8.18 flag isolation).
  const shut = closedGate(notionSpec, env);
  if (shut) return shut;
  const user = await env.user(req);
  const shutForUser = closedGate(notionSpec, env, user);
  if (shutForUser) return shutForUser;
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: NO_STORE });
  const limited = await env.limit(req, user.id);
  if (limited) return limited;
  const deps = await env.deps(notionSpec, user);
  if (!deps.cfg) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_input' }, { status: 400, headers: NO_STORE });
  const token = await linkedToken(deps, user.id);
  if (!token) return NextResponse.json({ error: 'not_connected' }, { status: 409, headers: NO_STORE });
  const r = await notionCreatePage(token, parsed.data);
  if (!r.ok) {
    const status = r.reason === 'not_connected' ? 409 : r.reason === 'not_found' || r.reason === 'forbidden' ? 403 : r.reason === 'bad_input' ? 400 : r.reason === 'rate_limited' ? 429 : 502;
    return NextResponse.json({ error: r.reason }, { status, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, ...r.data }, { headers: NO_STORE });
}
