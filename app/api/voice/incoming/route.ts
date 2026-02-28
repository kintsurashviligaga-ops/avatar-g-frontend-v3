import { NextRequest, NextResponse } from 'next/server';
import { structuredLog } from '@/lib/logger';
import { getTelephonyProvider } from '@/lib/voice/telephonyProvider';
import type { IncomingCallPayload } from '@/types/billing';

/**
 * POST /api/voice/incoming
 * Webhook endpoint for incoming call events (e.g. Twilio).
 * Returns TwiML XML response.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const payload: IncomingCallPayload = {
      from: String(body.From ?? body.from ?? ''),
      to: String(body.To ?? body.to ?? ''),
      callSid: String(body.CallSid ?? body.callSid ?? ''),
      direction: 'inbound',
    };

    const provider = getTelephonyProvider();
    const twiml = await provider.handleIncoming(payload);

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (err) {
    structuredLog('error', 'voice.incoming.error', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
