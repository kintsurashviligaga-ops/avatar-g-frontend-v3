/** POST /api/connectors/github/disconnect — revokes at the provider and deletes the sealed token → { ok, revoked }. */
import type { NextRequest } from 'next/server';
import { handleDisconnect, liveRouteEnv } from '@/lib/connectors/oauth/routes';
import { githubSpec } from '@/lib/connectors/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  return handleDisconnect(githubSpec, await liveRouteEnv(), req);
}
