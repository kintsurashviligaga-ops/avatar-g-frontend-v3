import { z } from 'zod'
import { NextResponse } from 'next/server'
import { requireUser, createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CreateProjectSchema = z.object({
  service_id: z.string().min(1),
  title: z.string().min(1).max(200),
})

// GET /api/projects — List user's projects
export async function GET() {
  try {
    const user = await requireUser()
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('projects')
      .select('*, project_versions(id, version, status, qa_score, created_at)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return NextResponse.json({ projects: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/projects — Create new project
export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = CreateProjectSchema.parse(await req.json())
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        service_id: body.service_id,
        title: body.title,
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ project: data }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? 'Validation error' }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
