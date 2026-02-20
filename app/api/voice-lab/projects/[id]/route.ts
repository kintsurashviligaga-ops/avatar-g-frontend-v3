import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import type { VoiceProject } from '@/lib/voice-lab/types';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  title: z.string().min(2).max(180).optional(),
  status: z.enum(['draft', 'active']).optional(),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiSuccess({ guest: true, project: null });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('voice_projects')
      .select('*')
      .eq('id', params.id)
      .eq('owner_id', user.id)
      .maybeSingle();

    if (error) {
      return apiError(error, 500, 'Failed to load voice project');
    }

    return apiSuccess({ guest: false, project: (data ?? null) as VoiceProject | null });
  } catch (error) {
    return apiError(error, 500, 'Failed to load voice project');
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiSuccess({ guest: true, project: null, message: 'Guest mode uses local storage only.' });
    }

    const payload = patchSchema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid voice project update payload');
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('voice_projects')
      .update({
        ...payload.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('owner_id', user.id)
      .select('*')
      .maybeSingle();

    if (error) {
      return apiError(error, 500, 'Failed to update voice project');
    }

    return apiSuccess({ guest: false, project: (data ?? null) as VoiceProject | null });
  } catch (error) {
    return apiError(error, 500, 'Failed to update voice project');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiSuccess({ guest: true, deleted: false, message: 'Guest mode uses local storage only.' });
    }

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from('voice_projects')
      .delete()
      .eq('id', params.id)
      .eq('owner_id', user.id);

    if (error) {
      return apiError(error, 500, 'Failed to delete voice project');
    }

    return apiSuccess({ guest: false, deleted: true });
  } catch (error) {
    return apiError(error, 500, 'Failed to delete voice project');
  }
}
