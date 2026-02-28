import { z } from 'zod'
import { NextResponse } from 'next/server'
import { requireUser, createServiceRoleClient } from '@/lib/supabase/server'
import { agentGRouter } from '@/lib/agents/agentGRouter'

export const dynamic = 'force-dynamic'

const CreateVersionSchema = z.object({
  intake: z.record(z.unknown()),
  mode: z.enum(['single', 'bundle']).default('single'),
  bundle_type: z.string().optional(),
})

// POST /api/projects/[projectId]/versions — Create new version and dispatch
export async function POST(
  req: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser()
    const body = CreateVersionSchema.parse(await req.json())
    const supabase = createServiceRoleClient()

    // Verify project ownership and get service_id
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, service_id, active_version')
      .eq('id', params.projectId)
      .eq('user_id', user.id)
      .single()

    if (projErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const nextVersion = project.active_version + 1

    // Dispatch through Agent G
    const plan = await agentGRouter.buildAndDispatch({
      userId: user.id,
      serviceId: project.service_id,
      intake: body.intake,
      mode: body.mode as 'single' | 'bundle',
      bundleType: body.bundle_type as import('@/types/agents').BundleType | undefined,
      projectId: project.id,
    })

    // Create version record
    const { data: version, error: vErr } = await supabase
      .from('project_versions')
      .insert({
        project_id: params.projectId,
        version: nextVersion,
        intake: body.intake,
        status: 'running',
        root_job_id: plan.rootJobId,
      })
      .select('*')
      .single()

    if (vErr) throw vErr

    // Update active version
    await supabase
      .from('projects')
      .update({ active_version: nextVersion })
      .eq('id', params.projectId)

    return NextResponse.json({ version, plan }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
