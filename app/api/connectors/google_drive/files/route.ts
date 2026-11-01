/**
 * GET /api/connectors/google_drive/files — the Drive files this user picked (drive.file: the app sees nothing else).
 * → { files: ConnectorFile[] } | 409 not_connected | 503.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { liveDriveDeps } from '@/lib/connectors/google';
import { driveProvider } from '@/lib/connectors/google/drive';
import { NO_STORE, notFound } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: NO_STORE });
  const limited = await checkRateLimit(req, RATE_LIMITS.READ, user.id);
  if (limited) return limited;
  const deps = await liveDriveDeps(user);
  if (!deps.cfg) return notFound();
  const r = await driveProvider(deps).listFiles(user.id);
  if (r.ok) return NextResponse.json({ files: r.files }, { headers: NO_STORE });
  return NextResponse.json({ error: r.reason }, { status: r.reason === 'not_connected' ? 409 : 503, headers: NO_STORE });
}
