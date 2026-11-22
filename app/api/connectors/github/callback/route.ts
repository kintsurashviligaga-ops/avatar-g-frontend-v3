/** GET /api/connectors/github/callback?code&state — the provider's redirect back (handleCallback). Always a 303 to the app. */
import type { NextRequest } from 'next/server';
import { handleCallback, liveRouteEnv } from '@/lib/connectors/oauth/routes';
import { githubSpec } from '@/lib/connectors/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  return handleCallback(githubSpec, await liveRouteEnv(), req);
}
