import { NextResponse } from 'next/server'
import { requireUser, createSupabaseServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const PatchSchema = z.object({
  title: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed', 'archived']).optional(),
  brand_name: z.string().max(100).optional(),
  niche: z.string().max(100).optional(),
  target_market: z.string().max(100).optional(),
})

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser()
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('business_projects')
      .select('*, business_items(*), profit_snapshots(*)')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()
    if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ project: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser()
    const body = PatchSchema.parse(await req.json())
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('business_projects')
      .update(body)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ project: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
