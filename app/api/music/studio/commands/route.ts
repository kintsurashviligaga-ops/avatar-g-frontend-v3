/** POST /api/music/studio/commands — { text } → what Agent G understood (a draft, an edit, a refusal). Never charges. */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { parseMusicCommand } from '@/lib/music/studio/commands';
import { musicErrorResponse, musicUser, readJson } from '@/lib/music/studio/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const who = await musicUser(req);
  if ('response' in who) return who.response;
  const rl = await checkRateLimit(req, RATE_LIMITS.WRITE, who.userId); // per user, not per shared IP
  if (rl) return rl;
  try {
    const body = await readJson(req);
    return NextResponse.json({ ok: true, command: parseMusicCommand(typeof body.text === 'string' ? body.text : '') });
  } catch (e) {
    return musicErrorResponse(e, req);
  }
}
