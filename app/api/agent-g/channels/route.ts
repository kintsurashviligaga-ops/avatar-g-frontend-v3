import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getWebChannelStatus } from '@/lib/agent-g/channels/web';
import { getTelegramChannelStatus } from '@/lib/agent-g/channels/telegram';
import { getWhatsappChannelStatus } from '@/lib/agent-g/channels/whatsapp';

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
    const user = await getAuthenticatedUser(request);

    const runtimeStatuses = [
      getWebChannelStatus(),
      getTelegramChannelStatus(),
      getWhatsappChannelStatus(),
    ];

    if (!user) {
      return apiSuccess({ guest: true, channels: [], runtime_status: runtimeStatuses });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('agent_g_channels')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // The runtime status (is the bot configured?) does not depend on the user's stored links, and it is all the hub
    // reads. A failed links query (in Production `agent_g_channels` does not exist, checked 2026-10-08) used to turn
    // the whole answer into a 500, so every signed-in user saw Telegram and WhatsApp as broken. It is reported, not
    // hidden: `channels_unavailable` says the list could not be read, and the error is logged.
    if (error) {
      console.error('[agent-g/channels] stored links unavailable:', error.code ?? '', error.message);
      return apiSuccess({ guest: false, channels: [], channels_unavailable: true, runtime_status: runtimeStatuses });
    }

    return apiSuccess({ guest: false, channels: data ?? [], runtime_status: runtimeStatuses });
  } catch (error) {
    return apiError(error, 500, 'Failed to load channels');
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
