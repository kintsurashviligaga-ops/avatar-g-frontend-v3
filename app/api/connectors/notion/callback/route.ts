/** GET /api/connectors/notion/callback?code&state — the provider's redirect back (handleCallback). Always a 303 to the app. */
import type { NextRequest } from 'next/server';
import { handleCallback, liveRouteEnv } from '@/lib/connectors/oauth/routes';
import { notionSpec } from '@/lib/connectors/notion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  return handleCallback(notionSpec, await liveRouteEnv(), req);
}
