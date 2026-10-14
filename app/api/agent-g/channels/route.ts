/**
 * /api/agent-g/channels — Settings → Connections.
 * Every state is decided on the server; technical provider details never reach the browser.
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
import { phoneOtpReady, phoneCallsReady } from '@/lib/phone/connection';
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
        console.warn('[agent-g/channels] WhatsApp links unavailable');
      } else if (lookup.state === 'linked') {
        waLinked = maskNumber(lookup.link.waId);
      }
    }

    const phoneReady = phoneOtpReady();
    let phoneLinked: string | null = null;
    let phoneEnabled = false;
    if (user && phoneReady) {
      const prefs = await createServiceRoleClient()
        .from('agent_g_user_prefs')
        .select('phone_number,phone_verified,phone_agent_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (prefs.error) {
        console.warn('[agent-g/channels] Phone prefs unavailable');
      } else if (prefs.data?.phone_verified && prefs.data.phone_number) {
        phoneLinked = maskNumber(String(prefs.data.phone_number));
        phoneEnabled = Boolean(prefs.data.phone_agent_enabled);
      }
    }

    const connections = buildConnections({
      signedIn: Boolean(user),
      whatsapp: { ready: wa.ready, storage: waStorage, linkedMasked: waLinked },
      telegram: { ready: tg.ready, bindingLive: TELEGRAM_BINDING_LIVE, storage: true, linked: false },
      phone: { ready: phoneReady, linkedMasked: phoneLinked, enabled: phoneEnabled && phoneCallsReady() },
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
    if (payload.data.type !== 'web') return apiError(new Error('Channel links are made from the channel'), 400, 'Link this channel with a one-time code');

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.from('agent_g_channels').insert({ user_id: user.id, type: payload.data.type, status: payload.data.status, external_id: payload.data.external_id ?? null, username: payload.data.username ?? null, meta: payload.data.meta }).select('*').single();
    if (error || !data) return apiError(error ?? new Error('Insert failed'), 500, 'Failed to save channel config');
    return apiSuccess({ channel: data }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to save channel config');
  }
}
