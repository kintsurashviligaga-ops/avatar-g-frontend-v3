/** GET /api/connectors/notion/connect?locale=ka — starts linking (lib/connectors/oauth/routes handleConnect). Closed = 404. */
import type { NextRequest } from 'next/server';
import { handleConnect, liveRouteEnv } from '@/lib/connectors/oauth/routes';
import { notionSpec } from '@/lib/connectors/notion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  return handleConnect(notionSpec, await liveRouteEnv(), req);
}
