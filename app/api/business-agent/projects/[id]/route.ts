import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import type { BusinessAgentProject } from '@/lib/business-agent/types';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  title: z.string().min(2).max(180).optional(),
  locale: z.enum(['ka', 'en']).optional(),
  business_profile: z.record(z.unknown()).optional(),
  goals: z.array(z.string()).optional(),
  mode: z.string().min(1).max(80).optional(),
  inputs: z.record(z.unknown()).optional(),
  generated_pack: z.record(z.unknown()).nullable().optional(),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('business_agent_projects')
      .select('*')
      .eq('id', params.id)
      .eq('owner_id', user.id)
      .maybeSingle();

    if (error) {
      return apiError(error, 500, 'Failed to load project');
    }

    if (!data) {
      return apiSuccess({ project: null });
    }

    return apiSuccess({ project: data as BusinessAgentProject });
  } catch (error) {
    return apiError(error, 500, 'Failed to load project');
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const payload = patchSchema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid update payload');
    }

    const supabase = createServiceRoleClient();

    const { data: existing, error: existingError } = await supabase
      .from('business_agent_projects')
      .select('id')
      .eq('id', params.id)
      .eq('owner_id', user.id)
      .maybeSingle();

    if (existingError) {
      return apiError(existingError, 500, 'Failed to verify project');
    }

    if (!existing) {
      return apiError(new Error('Not found'), 404, 'Project not found');
    }

    const { data, error } = await supabase
      .from('business_agent_projects')
      .update({
        ...payload.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('owner_id', user.id)
      .select('*')
      .single();

    if (error || !data) {
      return apiError(error ?? new Error('Update failed'), 500, 'Failed to update project');
    }

    return apiSuccess({ project: data as BusinessAgentProject });
  } catch (error) {
    return apiError(error, 500, 'Failed to update project');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from('business_agent_projects')
      .delete()
      .eq('id', params.id)
      .eq('owner_id', user.id);

    if (error) {
      return apiError(error, 500, 'Failed to delete project');
    }

    return apiSuccess({ deleted: true });
  } catch (error) {
    return apiError(error, 500, 'Failed to delete project');
  }
}
