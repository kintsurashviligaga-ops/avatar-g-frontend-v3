import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import type { VoiceProject } from '@/lib/voice-lab/types';

export const dynamic = 'force-dynamic';

const createProjectSchema = z.object({
  title: z.string().min(2).max(180),
  status: z.enum(['draft', 'active']).default('draft'),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiSuccess({ guest: true, projects: [] as VoiceProject[] });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('voice_projects')
      .select('*')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      return apiError(error, 500, 'Failed to load voice projects');
    }

    return apiSuccess({ guest: false, projects: (data ?? []) as VoiceProject[] });
  } catch (error) {
    return apiError(error, 500, 'Failed to load voice projects');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiSuccess({ guest: true, project: null, message: 'Guest mode uses local storage only.' });
    }

    const payload = createProjectSchema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid voice project payload');
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('voice_projects')
      .insert({
        owner_id: user.id,
        title: payload.data.title,
        status: payload.data.status,
      })
      .select('*')
      .single();

    if (error || !data) {
      return apiError(error ?? new Error('Insert failed'), 500, 'Failed to create voice project');
    }

    return apiSuccess({ guest: false, project: data as VoiceProject }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to create voice project');
  }
}
