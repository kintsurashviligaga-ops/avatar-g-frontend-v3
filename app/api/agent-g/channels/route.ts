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

    if (error) return apiError(error, 500, 'Failed to load channels');

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
