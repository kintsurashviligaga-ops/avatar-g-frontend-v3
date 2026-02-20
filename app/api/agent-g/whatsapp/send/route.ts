import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const schema = z.object({
  to: z.string().min(3),
  text: z.string().min(1).max(4000),
  user_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = schema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid WhatsApp send payload');

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      const supabase = createServiceRoleClient();
      await supabase.from('agent_g_channel_events').insert({
        user_id: payload.data.user_id ?? null,
        type: 'whatsapp_event',
        payload: {
          simulated: true,
          direction: 'outgoing',
          to: payload.data.to,
          text: payload.data.text,
          reason: 'Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID',
        },
      });

      return apiSuccess({ ok: true, simulated: true });
    }

    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: payload.data.to,
        type: 'text',
        text: { body: payload.data.text },
      }),
      cache: 'no-store',
    });

    const body = await response.json().catch(() => ({ id: crypto.randomUUID() }));

    const supabase = createServiceRoleClient();
    await supabase.from('agent_g_channel_events').insert({
      user_id: payload.data.user_id ?? null,
      type: 'whatsapp_event',
      payload: {
        simulated: false,
        direction: 'outgoing',
        to: payload.data.to,
        response_ok: response.ok,
        response: body,
      },
    });

    return apiSuccess({ ok: response.ok, simulated: false, response: body });
  } catch (error) {
    return apiError(error, 500, 'WhatsApp send failed');
  }
}
