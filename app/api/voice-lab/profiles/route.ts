import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import type { VoiceProfile } from '@/lib/voice-lab/types';

export const dynamic = 'force-dynamic';

const profileSchema = z.object({
  name: z.string().min(2).max(120),
  language: z.enum(['ka', 'en']),
  gender_hint: z.string().max(30).optional().nullable(),
  provider: z.string().min(2).max(80).default('mock-provider'),
  provider_voice_id: z.string().min(2).max(120),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiSuccess({ guest: true, profiles: [] as VoiceProfile[] });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('voice_profiles')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return apiError(error, 500, 'Failed to load voice profiles');
    }

    return apiSuccess({ guest: false, profiles: (data ?? []) as VoiceProfile[] });
  } catch (error) {
    return apiError(error, 500, 'Failed to load voice profiles');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiSuccess({ guest: true, profile: null, message: 'Guest mode stores voice profiles locally.' });
    }

    const payload = profileSchema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid voice profile payload');
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('voice_profiles')
      .insert({
        owner_id: user.id,
        name: payload.data.name,
        language: payload.data.language,
        gender_hint: payload.data.gender_hint ?? null,
        provider: payload.data.provider,
        provider_voice_id: payload.data.provider_voice_id,
      })
      .select('*')
      .single();

    if (error || !data) {
      return apiError(error ?? new Error('Insert failed'), 500, 'Failed to create voice profile');
    }

    return apiSuccess({ guest: false, profile: data as VoiceProfile }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to create voice profile');
  }
}
