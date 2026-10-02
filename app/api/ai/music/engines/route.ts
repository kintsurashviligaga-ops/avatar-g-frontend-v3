/**
 * GET /api/ai/music/engines — which music engines the studio's Create screen may offer right now.
 *
 * The picker asks instead of assuming (the sibling of /api/video/engine): an engine with no key, or one whose circuit
 * breaker is open after repeated failures, would make the route skip it — so the screen must not offer it as a choice.
 * Booleans and engine ids only; never a key, model id, project or URL. Public, like /api/video/engine (it reveals
 * nothing an operator would not print on a status page), but IP rate-limited because each call reads four breakers.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { musicEnginesStatus } from '@/lib/ai/musicEnginesStatus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.READ);
  if (rl) return rl;
  const body = await musicEnginesStatus();
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, max-age=20' } });
}
