/**
 * GET /api/connectors/google_drive/picker — what the browser needs to open the Google Picker for THIS user:
 * { accessToken (short-lived, scope drive.file), apiKey, appId }. Picking a file in it is what grants the app drive.file
 * access to that file. no-store; never logged.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { liveDriveDeps } from '@/lib/connectors/google';
import { driveAccessToken } from '@/lib/connectors/google/drive';
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
  if (!deps.cfg.pickerApiKey || !deps.cfg.projectNumber) return NextResponse.json({ error: 'picker_not_configured' }, { status: 503, headers: NO_STORE });
  const t = await driveAccessToken(deps, user.id);
  if (!t.ok) return NextResponse.json({ error: t.reason }, { status: t.reason === 'not_connected' ? 409 : 503, headers: NO_STORE });
  return NextResponse.json({ accessToken: t.accessToken, apiKey: deps.cfg.pickerApiKey, appId: deps.cfg.projectNumber }, { headers: NO_STORE });
}
