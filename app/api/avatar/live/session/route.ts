import { NextRequest, NextResponse } from 'next/server';

import { authedClientFromRequest } from '@/lib/supabase/server';
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Real-time interactive avatar session (HeyGen LiveAvatar). It has no Google engine, so a signed-in caller gets 503
 * google_only before any provider call, whatever MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1, lib/providers/mediaPolicy);
 * the client degrades to the audio-reactive selfie avatar, as it did when no LiveAvatar key was set. A guest still
 * gets 401 first.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  return refuseOutsideEngine(req);
}
