import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { buildAgentGVapiAssistantConfig } from '@/lib/agent-g-voice-config';
import { structuredLog } from '@/lib/logger';
import { normalizePhoneNumber } from '@/lib/voice/phone';
import { upsertVoiceCallByVapiId } from '@/lib/voice/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const callBlock = (payload.call || {}) as Record<string, unknown>;
    const metadata = (callBlock.metadata || payload.metadata || {}) as Record<string, unknown>;

    const callId =
      String(callBlock.id || payload.callId || payload.call_id || '').trim() ||
      `inbound_${randomUUID()}`;

    const phone = normalizePhoneNumber(
      String((callBlock.customer as Record<string, unknown> | undefined)?.number || payload.from || ''),
    );

    await upsertVoiceCallByVapiId(callId, {
      user_id: (metadata.userId as string | undefined) || null,
      direction: 'inbound',
      status: 'ringing',
      phone_number: phone || null,
      metadata: {
        ...metadata,
        source: 'voice_inbound',
      },
    });

    const webhookUrl = `${request.nextUrl.origin}/api/voice/webhook`;

    return NextResponse.json({
      callId,
      assistant: buildAgentGVapiAssistantConfig({
        webhookUrl,
        metadata: {
          flow: 'inbound',
        },
      }),
    });
  } catch (error) {
    structuredLog('error', 'voice.inbound.failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });

    return NextResponse.json({ error: 'voice_inbound_failed' }, { status: 500 });
  }
}
