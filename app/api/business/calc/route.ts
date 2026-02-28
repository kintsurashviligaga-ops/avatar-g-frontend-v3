import { NextResponse } from 'next/server'
import { requireUser, createSupabaseServerClient } from '@/lib/supabase/server'
import { CalcProfitSchema } from '@/lib/business/schemas'
import { calculateProfit } from '@/lib/business/profitCalc'

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = CalcProfitSchema.parse(await req.json())
    const outputs = calculateProfit(body)

    // Persist snapshot
    const supabase = createSupabaseServerClient()
    const { data: snapshot } = await supabase
      .from('profit_snapshots')
      .insert({
        project_id: body.project_id,
        item_id: body.item_id ?? null,
        user_id: user.id,
        inputs: body,
        outputs,
        label: body.label ?? null,
      })
      .select('id')
      .single()

    return NextResponse.json({ outputs, snapshot_id: snapshot?.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
