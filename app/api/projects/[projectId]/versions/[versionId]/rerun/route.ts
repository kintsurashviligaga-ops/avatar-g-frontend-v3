import { NextResponse } from 'next/server'
import { requireUser, createServiceRoleClient } from '@/lib/supabase/server'
import { agentGRouter } from '@/lib/agents/agentGRouter'

export const dynamic = 'force-dynamic'

// POST /api/projects/[projectId]/versions/[versionId]/rerun — Re-run a version (creates vN+1)
export async function POST(
  _req: Request,
  { params }: { params: { projectId: string; versionId: string } }
) {
  try {
    const user = await requireUser()
    const supabase = createServiceRoleClient()

    // Verify project ownership
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, service_id, active_version')
      .eq('id', params.projectId)
      .eq('user_id', user.id)
      .single()

    if (projErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get the version to rerun
    const { data: sourceVersion, error: vErr } = await supabase
      .from('project_versions')
      .select('*')
      .eq('id', params.versionId)
      .eq('project_id', params.projectId)
      .single()

    if (vErr || !sourceVersion) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 })
    }

    const nextVersion = project.active_version + 1

    // Re-dispatch using the same intake
    const plan = await agentGRouter.buildAndDispatch({
      userId: user.id,
      serviceId: project.service_id,
      intake: sourceVersion.intake as Record<string, unknown>,
      mode: 'single',
      projectId: project.id,
    })

    // Create new version record
    const { data: newVersion, error: newVErr } = await supabase
      .from('project_versions')
      .insert({
        project_id: params.projectId,
        version: nextVersion,
        intake: sourceVersion.intake,
        status: 'running',
        root_job_id: plan.rootJobId,
      })
      .select('*')
      .single()

    if (newVErr) throw newVErr

    // Update active version
    await supabase
      .from('projects')
      .update({ active_version: nextVersion })
      .eq('id', params.projectId)

    return NextResponse.json({ version: newVersion, plan }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
