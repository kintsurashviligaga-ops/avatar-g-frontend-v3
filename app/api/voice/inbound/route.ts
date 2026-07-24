import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { buildAgentGVapiAssistantConfig } from '@/lib/agent-g-voice-config';
import { structuredLog } from '@/lib/logger';
import { normalizePhoneNumber } from '@/lib/voice/phone';
import { upsertVoiceCallByVapiId } from '@/lib/voice/repository';
import { verifyVapiWebhookSignature } from '@/lib/voice/webhook-signature';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Verify the Vapi webhook signature when a secret is configured (parity with /api/voice/webhook).
    // Inbound is a Vapi-origin callback with no user session, so the HMAC is what proves the payload is
    // genuinely from Vapi rather than a spoofed request seeding voice_calls rows.
    const secret = String(process.env.VAPI_WEBHOOK_SECRET || '').trim();
    if (secret) {
      const signatureHeader =
        request.headers.get('x-vapi-signature') ||
        request.headers.get('x-vapi-signature-256') ||
        request.headers.get('x-signature');
      if (!verifyVapiWebhookSignature(rawBody, signatureHeader, secret)) {
        return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
      }
    }

    let payload: Record<string, unknown>;
    try {
      payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

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
