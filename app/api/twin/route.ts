/**
 * /api/twin — the caller's own Digital Twin. Session only: a phone-handoff link can create a twin, never read or erase one.
 *
 *   GET     → { status: 'none' } | { status: 'ready', committedAt, consentVersion, voiceVerified: false, expiresIn,
 *             urls: { front, left, right, voice } } — short-lived SIGNED urls (lib/twin/store.ts TWIN_URL_TTL_SEC) for the
 *             caller's own objects only; never a public URL.
 *   DELETE  → erases `twins/<uid>/**` (manifest, captures, staging, the Live-Avatar voice sample) AND the legacy public
 *             `live-avatars/<uid>/**` (poster, pre-Wave-1 voice): { ok: true, removed: { twins, legacy } }.
 *
 *   404  NEXT_PUBLIC_TWIN_ENABLED off — answered before auth · 429 RATE_LIMITS.WRITE · 401 no session
 *   503  storage did not answer — never reported as "no twin" or as "deleted"
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { sessionUserId } from '@/lib/twin/caller';
import { isTwinEnabled } from '@/lib/twin/flag';
import { getTwinStatus } from '@/lib/twin/resolve';
import { TwinStorageError, deleteTwinData, twinStorageClient } from '@/lib/twin/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function guard(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  if (!isTwinEnabled()) return json({ error: 'Not found' }, 404);
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;
  const userId = await sessionUserId(req);
  return userId ? { userId } : json({ error: 'unauthorized' }, 401);
}

function storageFailure(route: string, e: unknown): NextResponse {
  if (e instanceof TwinStorageError) {
    // eslint-disable-next-line no-console
    console.warn(`[twin] ${route}: storage unavailable:`, e.op);
    return json({ error: 'unavailable' }, 503);
  }
  // eslint-disable-next-line no-console
  console.error(`[twin] ${route} failed:`, e instanceof Error ? e.message : e);
  return json({ error: 'failed' }, 500);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const g = await guard(req);
  if (g instanceof NextResponse) return g;
  try {
    return json(await getTwinStatus(g.userId, twinStorageClient()), 200);
  } catch (e) {
    return storageFailure('GET', e);
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const g = await guard(req);
  if (g instanceof NextResponse) return g;
  try {
    const removed = await deleteTwinData(twinStorageClient(), g.userId);
    return json({ ok: true, removed }, 200);
  } catch (e) {
    return storageFailure('DELETE', e);
  }
}
