/**
 * GET /api/music/studio/capabilities — what Music Studio v1 offers right now, with the evidence for each capability.
 * Booleans, model ids and lengths only: never a key, project or URL.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { musicCapabilities } from '@/lib/music/studio/capabilities';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.READ);
  if (rl) return rl;
  return NextResponse.json({ ok: true, ...musicCapabilities() }, { headers: { 'Cache-Control': 'private, max-age=20' } });
}
