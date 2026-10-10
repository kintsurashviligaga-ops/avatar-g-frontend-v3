/**
 * /api/agent-g/channels — Settings → Connections.
 *
 *   GET   one honest state per channel (phone, WhatsApp, Telegram, notifications), decided on the server
 *         (lib/connections/model.ts). Nothing technical reaches the browser: no env names, no table names, no full
 *         numbers. The reasons stay in the server logs.
 *   POST  the web channel's own settings row (unchanged). A browser may never name a WhatsApp number or a Telegram chat.
 *
 * ⚠️ Until 2026-10-10 GET returned `runtime_status` notes such as "Token set, missing TELEGRAM_WEBHOOK_SECRET" to anyone,
 * guests included, and the raw link rows (the full WhatsApp number). Both are gone (Omnichannel A3 / B).
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getTelegramChannelStatus, TELEGRAM_BINDING_LIVE } from '@/lib/agent-g/channels/telegram';
import { getWhatsappChannelStatus } from '@/lib/agent-g/channels/whatsapp';
import { findLinkByUser } from '@/lib/agent-g/channels/whatsapp-link';
import { maskNumber } from '@/lib/agent-g/channels/whatsapp-text';
import { phoneCallsReady } from '@/lib/calls/availability';
import { buildConnections } from '@/lib/connections/model';

export const dynamic = 'force-dynamic';

const saveSchema = z.object({
  type: z.enum(['telegram', 'whatsapp', 'web']),
  status: z.enum(['connected', 'disconnected']).default('connected'),
  external_id: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  meta: z.record(z.unknown()).default({}),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const wa = getWhatsappChannelStatus();
    const tg = getTelegramChannelStatus();

    let waStorage = true;
    let waLinked: string | null = null;
    if (user && wa.ready) {
      const lookup = await findLinkByUser(createServiceRoleClient(), user.id);
      if (lookup.state === 'unavailable') {
        waStorage = false;
        console.warn('[agent-g/channels] WhatsApp links unavailable (tables missing or unreadable)');
      } else if (lookup.state === 'linked') {
        waLinked = maskNumber(lookup.link.waId);
      }
    }
    // warn, not info: next.config strips console.info/log from builds (compiler.removeConsole keeps error and warn).
    if (!wa.ready || !tg.ready) console.warn('[agent-g/channels] runtime', { whatsapp: wa.note, telegram: tg.note });

    const connections = buildConnections({
      signedIn: Boolean(user),
      whatsapp: { ready: wa.ready, storage: waStorage, linkedMasked: waLinked },
      // Not queried while the binding is not built: nothing can be linked, so nothing is read.
      telegram: { ready: tg.ready, bindingLive: TELEGRAM_BINDING_LIVE, storage: true, linked: false },
      phone: { ready: phoneCallsReady() },
    });
    return apiSuccess({ guest: !user, connections });
  } catch (error) {
    return apiError(error, 500, 'Failed to load connections');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');

    const payload = saveSchema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid channel payload');
    // ⚠️ A browser may not name a WhatsApp number or a Telegram chat: that let anyone attach someone else's number to
    // their own account and read that person's conversation with Agent G. Those links are made only by a message FROM
    // the number (a one-time code — /api/agent-g/whatsapp/link); this route keeps the web channel's own settings.
    if (payload.data.type !== 'web') {
      return apiError(new Error('Channel links are made from the channel'), 400, 'Link this channel with a one-time code');
    }

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('agent_g_channels')
      .insert({
        user_id: user.id,
        type: payload.data.type,
        status: payload.data.status,
        external_id: payload.data.external_id ?? null,
        username: payload.data.username ?? null,
        meta: payload.data.meta,
      })
      .select('*')
      .single();

    if (error || !data) return apiError(error ?? new Error('Insert failed'), 500, 'Failed to save channel config');

    return apiSuccess({ channel: data }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to save channel config');
  }
}
