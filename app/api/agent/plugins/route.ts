/**
 * GET /api/agent/plugins → { plugins: PluginState[] } — the honest state of Agent G's 10 plugins for the signed-in user
 * (lib/agent/plugins/catalog resolvePlugins): status, linked, and blocker codes. No tokens, no account data.
 * Closed (AGENT_PLUGINS empty, or admin and the caller is not one) = 404, so nothing changes for anyone until it opens.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { resolvePlugins } from '@/lib/agent/plugins/catalog';
import { livePluginFacts, pluginsOpenTo } from '@/lib/agent/plugins/live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(req: NextRequest): Promise<Response> {
  const { user } = await authedClientFromRequest(req);
  if (!user || !pluginsOpenTo(user)) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  const limited = await checkRateLimit(req, RATE_LIMITS.READ, user.id);
  if (limited) return limited;
  return NextResponse.json({ plugins: resolvePlugins(await livePluginFacts(user)) }, { headers: NO_STORE });
}
