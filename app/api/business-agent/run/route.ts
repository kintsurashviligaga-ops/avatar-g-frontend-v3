import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { generateBusinessPack } from '@/lib/business-agent/generator';
import type { BusinessAgentProject, BusinessGeneratedPack } from '@/lib/business-agent/types';

export const dynamic = 'force-dynamic';

const runSchema = z.object({
  projectId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const payload = runSchema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid run payload');
    }

    const supabase = createServiceRoleClient();

    const { data: project, error: projectError } = await supabase
      .from('business_agent_projects')
      .select('*')
      .eq('id', payload.data.projectId)
      .eq('owner_id', user.id)
      .maybeSingle();

    if (projectError) {
      return apiError(projectError, 500, 'Failed to load project');
    }

    if (!project) {
      return apiError(new Error('Project not found'), 404, 'Project not found');
    }

    const { data: runRow, error: runInsertError } = await supabase
      .from('business_agent_runs')
      .insert({
        project_id: payload.data.projectId,
        owner_id: user.id,
        status: 'queued',
        error: null,
        result: null,
      })
      .select('*')
      .single();

    if (runInsertError || !runRow) {
      return apiError(runInsertError ?? new Error('Run insert failed'), 500, 'Failed to create run');
    }

    await supabase
      .from('business_agent_runs')
      .update({ status: 'running' })
      .eq('id', runRow.id)
      .eq('owner_id', user.id);

    const typedProject = project as BusinessAgentProject;
    const result = generateBusinessPack({
      locale: typedProject.locale,
      profile: typedProject.business_profile,
      goals: typedProject.goals,
      mode: typedProject.mode,
      inputs: typedProject.inputs,
    });

    const { data: completedRun, error: runDoneError } = await supabase
      .from('business_agent_runs')
      .update({
        status: 'done',
        result,
      })
      .eq('id', runRow.id)
      .eq('owner_id', user.id)
      .select('*')
      .single();

    if (runDoneError || !completedRun) {
      return apiError(runDoneError ?? new Error('Run update failed'), 500, 'Failed to finalize run');
    }

    const { data: updatedProject, error: projectUpdateError } = await supabase
      .from('business_agent_projects')
      .update({
        generated_pack: result,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payload.data.projectId)
      .eq('owner_id', user.id)
      .select('*')
      .single();

    if (projectUpdateError || !updatedProject) {
      return apiError(projectUpdateError ?? new Error('Project update failed'), 500, 'Failed to save generated pack');
    }

    return apiSuccess({
      run: completedRun,
      project: updatedProject as BusinessAgentProject,
      generated_pack: result as BusinessGeneratedPack,
    });
  } catch (error) {
    return apiError(error, 500, 'Failed to run Business Agent');
  }
}
