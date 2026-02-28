import { NextRequest, NextResponse } from 'next/server';
import { structuredLog } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getTelephonyProvider } from '@/lib/voice/telephonyProvider';
import type { OutboundCallRequest } from '@/types/billing';

/**
 * POST /api/voice/outgoing
 * Initiate an outbound call on behalf of an authenticated user.
 * Body: { to: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const to = String(body.to ?? '');

    if (!to) {
      return NextResponse.json({ error: 'missing_to' }, { status: 400 });
    }

    /* ── Auth check via Supabase cookie ─────────────────────────────── */
    const supabase = createServiceRoleClient();

    // Extract user from authorization header (bearer) or cookie
    const authHeader = request.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(token);

    if (authErr || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    /* ── Place the call ──────────────────────────────────────────────── */
    const callReq: OutboundCallRequest = {
      to,
      userId: user.id,
      taskId: String(body.taskId ?? ''),
    };

    const provider = getTelephonyProvider();
    const result = await provider.placeOutbound(callReq);

    structuredLog('info', 'voice.outbound.placed', {
      userId: user.id,
      callSid: result.callSid,
    });

    return NextResponse.json(result);
  } catch (err) {
    structuredLog('error', 'voice.outbound.error', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
