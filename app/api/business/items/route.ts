import { NextResponse } from 'next/server'
import { requireUser, createSupabaseServerClient } from '@/lib/supabase/server'
import { CreateItemSchema } from '@/lib/business/schemas'

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = CreateItemSchema.parse(await req.json())
    const supabase = createSupabaseServerClient()

    // Verify project belongs to user
    const { data: project } = await supabase
      .from('business_projects')
      .select('id')
      .eq('id', body.project_id)
      .eq('user_id', user.id)
      .single()
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const { data, error } = await supabase
      .from('business_items')
      .insert({ ...body, user_id: user.id })
      .select()
      .single()
    if (error) throw error

    // Auto-create first event
    await supabase.from('business_item_events').insert({
      item_id: data.id,
      status: 'planned',
      note: 'Item created',
      actor: 'system',
    })

    return NextResponse.json({ item: data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
