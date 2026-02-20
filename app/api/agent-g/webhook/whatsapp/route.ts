import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { handleInbound } from '@/lib/agent-g/channels/handleInbound';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const mode = request.nextUrl.searchParams.get('hub.mode');
    const token = request.nextUrl.searchParams.get('hub.verify_token');
    const challenge = request.nextUrl.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return new Response(challenge || '', { status: 200 });
    }

    return new Response('Verification failed', { status: 403 });
  } catch (error) {
    return apiError(error, 500, 'WhatsApp verify failed');
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const body = JSON.parse(rawBody || '{}') as Record<string, unknown>;

    const appSecret = process.env.WHATSAPP_APP_SECRET;
    const signatureHeader = request.headers.get('x-hub-signature-256');
    if (appSecret && signatureHeader?.startsWith('sha256=')) {
      const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
      const incoming = signatureHeader.slice('sha256='.length);
      if (incoming !== expected) {
        return new Response('Invalid signature', { status: 403 });
      }
    }

    const supabase = createServiceRoleClient();

    await supabase.from('agent_g_channel_events').insert({
      type: 'whatsapp_event',
      payload: body,
    });

    const entries = (body.entry as Array<Record<string, unknown>> | undefined) || [];
    for (const entry of entries) {
      const changes = (entry.changes as Array<Record<string, unknown>> | undefined) || [];
      for (const change of changes) {
        const value = (change.value as Record<string, unknown> | undefined) || {};
        const messages = (value.messages as Array<Record<string, unknown>> | undefined) || [];

        for (const message of messages) {
          const from = String(message.from || '');
          const textBody = String((message.text as Record<string, unknown> | undefined)?.body || '');
          if (!from || !textBody.trim()) continue;

          const handled = await handleInbound({
            channel: 'whatsapp',
            externalId: from,
            text: textBody,
            origin: request.nextUrl.origin,
          });

          await supabase.from('agent_g_channel_events').insert({
            user_id: handled.userId || null,
            type: 'whatsapp_event',
            payload: {
              simulated_outgoing: true,
              to: from,
              replies: handled.replyMessages,
              task_id: handled.taskId || null,
            },
          });
        }
      }
    }

    return apiSuccess({
      channel: 'whatsapp',
      received: true,
      object: (body as { object?: string }).object ?? null,
    });
  } catch (error) {
    return apiError(error, 500, 'WhatsApp webhook failed');
  }
}
