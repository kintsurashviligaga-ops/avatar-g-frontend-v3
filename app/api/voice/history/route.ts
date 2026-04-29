import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { listVoiceCallsByUserId } from '@/lib/voice/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  const queryUserId = String(request.nextUrl.searchParams.get('userId') || '').trim();

  const userId = authUser?.id || queryUserId;
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const calls = await listVoiceCallsByUserId(userId, 10);
  return NextResponse.json({ calls });
}
