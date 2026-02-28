import { NextResponse } from 'next/server'
import { requireUser, createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/projects/[projectId] — Single project with all versions
export async function GET(
  _req: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser()
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('projects')
      .select('*, project_versions(*, jobs:root_job_id(id, status, result, error_message))')
      .eq('id', params.projectId)
      .eq('user_id', user.id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({ project: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
