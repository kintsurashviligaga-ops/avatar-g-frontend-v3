import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCallsProvider } from '@/lib/calls/providers';
import { phoneCallsReady } from '@/lib/calls/availability';
import { normalizePhoneNumber } from '@/lib/voice/phone';

export const dynamic = 'force-dynamic';

const prefsSchema = z.object({
  phone_number: z.string().max(40).nullable().optional(),
  display_name: z.string().max(120).nullable().optional(),
  call_me_when_finished: z.boolean().optional(),
  quiet_hours_enabled: z.boolean().optional(),
  quiet_hours_start: z.string().max(5).nullable().optional(),
  quiet_hours_end: z.string().max(5).nullable().optional(),
  timezone_offset_minutes: z.number().int().min(-840).max(840).optional(),
  // `voice_connected` is not taken from the client any more: it let a user mark their own phone as connected, though no
  // call path exists (lib/calls/availability.ts). zod drops it from the body.
});

/** E.164 as stored: `+` and 8–15 digits, no leading zero. */
const E164 = /^\+[1-9]\d{7,14}$/;

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    const provider = getCallsProvider();

    if (!user) {
      return apiSuccess({
        guest: true,
        provider: provider.name,
        voice_connected: false,
        phone_calls_ready: phoneCallsReady(),
        prefs: null,
        calls: [],
      });
    }

    const supabase = createServiceRoleClient();

    const [callsRes, prefsRes] = await Promise.all([
      supabase
        .from('agent_g_calls')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(50),
      supabase
        .from('agent_g_user_prefs')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (callsRes.error) return apiError(callsRes.error, 500, 'Failed to load calls');
    if (prefsRes.error) return apiError(prefsRes.error, 500, 'Failed to load call preferences');

    return apiSuccess({
      guest: false,
      provider: provider.name,
      // Connected only when a call path exists, whatever an older row says.
      voice_connected: phoneCallsReady() && Boolean(prefsRes.data?.voice_connected),
      phone_calls_ready: phoneCallsReady(),
      prefs: prefsRes.data,
      calls: callsRes.data ?? [],
    });
  } catch (error) {
    return apiError(error, 500, 'Failed to load calls');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');

    const payload = prefsSchema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid call preferences payload');

    // A number is stored in E.164 (a Georgian 5XX XXX XXX becomes +9955…), or refused; null or '' clears it.
    const fields = { ...payload.data };
    if (typeof fields.phone_number === 'string') {
      const raw = fields.phone_number.trim();
      const e164 = raw ? normalizePhoneNumber(raw) : '';
      if (raw && !E164.test(e164)) return apiError(new Error('invalid_phone_number'), 400, 'Invalid phone number');
      fields.phone_number = e164 || null;
    }

    const supabase = createServiceRoleClient();
    const updateData = {
      user_id: user.id,
      ...fields,
      updated_at: new Date().toISOString(),
    };

    const result = await supabase
      .from('agent_g_user_prefs')
      .upsert(updateData, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (result.error || !result.data) {
      return apiError(result.error ?? new Error('Failed to save call preferences'), 500, 'Failed to save call preferences');
    }

    return apiSuccess({ prefs: result.data });
  } catch (error) {
    return apiError(error, 500, 'Failed to save call preferences');
  }
}
