import { NextRequest, NextResponse } from 'next/server';

import { structuredLog } from '@/lib/logger';
import { processVoiceWebhookEventWithRetry } from '@/lib/voice/webhook-processing';
import { verifyVapiWebhookSignature } from '@/lib/voice/webhook-signature';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getSignatureHeader(request: NextRequest): string | null {
  return (
    request.headers.get('x-vapi-signature') ||
    request.headers.get('x-vapi-signature-256') ||
    request.headers.get('x-signature') ||
    null
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = String(process.env.VAPI_WEBHOOK_SECRET || '').trim();
  const signatureHeader = getSignatureHeader(request);

  if (secret) {
    const valid = verifyVapiWebhookSignature(rawBody, signatureHeader, secret);

    if (!valid) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
    }
  }

  let eventPayload: Record<string, unknown>;
  try {
    eventPayload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  queueMicrotask(() => {
    void processVoiceWebhookEventWithRetry(eventPayload).catch((error) => {
      structuredLog('error', 'voice.webhook.async_processing_failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    });
  });

  return NextResponse.json({ ok: true });
}
