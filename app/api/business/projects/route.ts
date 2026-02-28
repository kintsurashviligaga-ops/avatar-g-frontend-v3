import { NextResponse } from 'next/server'
import { requireUser, createSupabaseServerClient } from '@/lib/supabase/server'
import { CreateProjectSchema } from '@/lib/business/schemas'

export async function GET() {
  try {
    const user = await requireUser()
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('business_projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ projects: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = CreateProjectSchema.parse(await req.json())
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('business_projects')
      .insert({ ...body, user_id: user.id })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ project: data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
