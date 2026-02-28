import { NextResponse } from 'next/server'
import { requireUser, createSupabaseServerClient } from '@/lib/supabase/server'
import { UpdateItemSchema } from '@/lib/business/schemas'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser()
    const body = UpdateItemSchema.parse(await req.json())
    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('business_items')
      .update(body)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single()
    if (error) throw error

    // If status changed, auto-log event
    if (body.status) {
      await supabase.from('business_item_events').insert({
        item_id: params.id,
        status: body.status,
        actor: 'user',
      })
    }

    return NextResponse.json({ item: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
