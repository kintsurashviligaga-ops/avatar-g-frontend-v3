/** GET /api/connectors/github/connect?locale=ka — starts linking (lib/connectors/oauth/routes handleConnect). Closed = 404. */
import type { NextRequest } from 'next/server';
import { handleConnect, liveRouteEnv } from '@/lib/connectors/oauth/routes';
import { githubSpec } from '@/lib/connectors/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  return handleConnect(githubSpec, await liveRouteEnv(), req);
}
