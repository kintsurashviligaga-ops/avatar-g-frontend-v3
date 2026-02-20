import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buildOneTimeCode } from '@/lib/agent-g/channels/telegram-client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');

    const supabase = createServiceRoleClient();

    const code = buildOneTimeCode(8);
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();

    await supabase.from('agent_g_connect_codes').delete().eq('user_id', user.id);

    const inserted = await supabase
      .from('agent_g_connect_codes')
      .insert({
        user_id: user.id,
        code,
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    if (inserted.error || !inserted.data) {
      return apiError(inserted.error ?? new Error('Failed to generate connect code'), 500, 'Failed to generate connect code');
    }

    return apiSuccess({
      code,
      expires_at: expiresAt,
      instruction: `/connect ${code}`,
    }, 201);
  } catch (error) {
    return apiError(error, 500, 'Connect code generation failed');
  }
}
