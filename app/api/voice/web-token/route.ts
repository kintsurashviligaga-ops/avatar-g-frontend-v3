import { NextRequest, NextResponse } from 'next/server';

import { RATE_LIMITS, checkRateLimit } from '@/lib/api/rate-limit';
import { requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/voice/web-token — retired: the Vapi browser assistant ran on an Anthropic model (lib/agent-g-voice-config)
 * and was handed to the browser whole, system prompt included. No screen calls this route; voice in the studio is Gemini
 * Live. It was refused while AI_GOOGLE_ONLY was on, and the kill switch that re-opened it is gone (MASTER TASK v3.1,
 * audit F-04), so it refuses before any balance read, row or mint, with no provider code behind it.
 */
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMITS.EXPENSIVE);
  if (limited) return limited;

  // The principal comes from the session, never a `userId` in the body (the old IDOR): an anonymous caller is a 401.
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  return NextResponse.json(
    { error: 'voice_provider_not_allowed', message: 'Voice runs on Live Voice in the studio.' },
    { status: 503 },
  );
}
