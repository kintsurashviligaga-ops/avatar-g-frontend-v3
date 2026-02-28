import { NextResponse } from 'next/server'
import { requireUser, createSupabaseServerClient } from '@/lib/supabase/server'
import { AddEventSchema } from '@/lib/business/schemas'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser()
    const body = AddEventSchema.parse(await req.json())
    const supabase = createSupabaseServerClient()

    // Verify ownership
    const { data: item } = await supabase
      .from('business_items')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const { data, error } = await supabase
      .from('business_item_events')
      .insert({ item_id: params.id, ...body, actor: 'user' })
      .select()
      .single()
    if (error) throw error

    return NextResponse.json({ event: data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
