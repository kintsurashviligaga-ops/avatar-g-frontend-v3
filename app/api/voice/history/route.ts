import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { listVoiceCallsByUserId } from '@/lib/voice/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // Return ONLY the authenticated caller's own history. The prior version fell back to a `userId` QUERY
  // PARAM whenever the request was unauthenticated, so anyone could read ANY user's calls — phone numbers,
  // transcripts and summaries — just by guessing an id (IDOR). The query param is now ignored entirely.
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const calls = await listVoiceCallsByUserId(authUser.id, 10);
  return NextResponse.json({ calls });
}
