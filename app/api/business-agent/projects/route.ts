import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import type { BusinessAgentProject } from '@/lib/business-agent/types';

export const dynamic = 'force-dynamic';

const projectSchema = z.object({
  title: z.string().min(2).max(180),
  locale: z.enum(['ka', 'en']),
  business_profile: z.record(z.unknown()),
  goals: z.array(z.string()).default([]),
  mode: z.string().min(1).max(80),
  inputs: z.record(z.unknown()).default({}),
  generated_pack: z.record(z.unknown()).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('business_agent_projects')
      .select('*')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      return apiError(error, 500, 'Failed to load projects');
    }

    return apiSuccess({ projects: (data ?? []) as BusinessAgentProject[] });
  } catch (error) {
    return apiError(error, 500, 'Failed to load projects');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const payload = projectSchema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid project payload');
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('business_agent_projects')
      .insert({
        owner_id: user.id,
        title: payload.data.title,
        locale: payload.data.locale,
        business_profile: payload.data.business_profile,
        goals: payload.data.goals,
        mode: payload.data.mode,
        inputs: payload.data.inputs,
        generated_pack: payload.data.generated_pack ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      return apiError(error ?? new Error('Insert failed'), 500, 'Failed to create project');
    }

    return apiSuccess({ project: data as BusinessAgentProject }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to create project');
  }
}
